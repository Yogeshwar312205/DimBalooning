import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import { extractDimensionFromPdf, autoExtractDimensionsFromPdf } from '../services/pdfServiceConnector';
import { calculateTolerance } from '../utils/toleranceCalculator';
import { broadcastToInspectionSession } from '../websocket/socketHandler';

const prisma = new PrismaClient();

export async function autoExtractBalloons(req: AuthRequest, res: Response) {
  try {
    const { sessionId } = req.params;
    const { pageNumber = 1, clearExisting = false } = req.body;

    const session = await prisma.inspectionSession.findUnique({
      where: { id: sessionId },
      include: { drawing: true }
    });

    if (!session) {
      return res.status(404).json({ error: 'Inspection session not found' });
    }

    if (clearExisting) {
      await prisma.balloon.deleteMany({
        where: { inspectionSessionId: sessionId, pageNumber }
      });
    }

    const drawingPath = path.resolve(session.drawing.filePath);

    // Call Python Vision Pipeline
    const extractionResult = await autoExtractDimensionsFromPdf({
      filePath: drawingPath,
      pageNumber
    });

    const existingBalloons = await prisma.balloon.findMany({
      where: { inspectionSessionId: sessionId },
      select: { balloonNumber: true }
    });

    let currentBalloonNum = existingBalloons.length > 0
      ? Math.max(...existingBalloons.map(b => b.balloonNumber)) + 1
      : 1;

    const createdBalloons: any[] = [];

    // Save each extracted dimension into DB inside Prisma transaction
    for (const item of extractionResult.balloons) {
      const nominal = item.nominalValue !== undefined ? item.nominalValue : null;
      const upperTol = item.upperTolerance !== undefined ? item.upperTolerance : null;
      const lowerTol = item.lowerTolerance !== undefined ? item.lowerTolerance : null;
      const initialTolerance = calculateTolerance(nominal, upperTol, lowerTol, null);

      const balloon = await prisma.balloon.create({
        data: {
          inspectionSessionId: sessionId,
          balloonNumber: currentBalloonNum,
          pageNumber,
          x: item.x,
          y: item.y,
          width: 0.04,
          height: 0.04,
          leaderStartX: item.leaderStartX ?? null,
          leaderStartY: item.leaderStartY ?? null,
          createdById: req.user!.id,
          measurement: {
            create: {
              dimensionText: item.dimensionText || `Dim #${currentBalloonNum}`,
              nominalValue: nominal,
              upperTolerance: upperTol,
              lowerTolerance: lowerTol,
              lowerLimit: initialTolerance.lowerLimit,
              upperLimit: initialTolerance.upperLimit,
              actualValue: null,
              unit: item.unit || 'mm',
              status: 'PENDING'
            }
          }
        },
        include: {
          measurement: true,
          createdBy: { select: { id: true, name: true } }
        }
      });

      createdBalloons.push(balloon);
      currentBalloonNum++;
    }

    // Broadcast WebSocket event to all inspectors in the session
    broadcastToInspectionSession(sessionId, 'BALLOONS_AUTO_EXTRACTED', {
      sessionId,
      balloons: createdBalloons,
      extractionSummary: {
        totalTiles: extractionResult.totalTiles,
        activeTiles: extractionResult.activeTilesProcessed,
        skippedBlankTiles: extractionResult.skippedBlankTiles,
        extractedCount: createdBalloons.length,
        processingTimeSeconds: extractionResult.processingTimeSeconds,
        engineUsed: extractionResult.engineUsed,
        macroMetadata: extractionResult.macroMetadata
      }
    });

    return res.status(200).json({
      message: `Successfully auto-extracted ${createdBalloons.length} dimensions using ${extractionResult.engineUsed}`,
      balloons: createdBalloons,
      extractionSummary: {
        totalTiles: extractionResult.totalTiles,
        activeTiles: extractionResult.activeTilesProcessed,
        skippedBlankTiles: extractionResult.skippedBlankTiles,
        extractedCount: createdBalloons.length,
        processingTimeSeconds: extractionResult.processingTimeSeconds,
        engineUsed: extractionResult.engineUsed,
        macroMetadata: extractionResult.macroMetadata
      }
    });
  } catch (error: any) {
    console.error('Auto-extract balloons error:', error);
    return res.status(500).json({ error: error.message || 'Failed to auto-extract dimensions from drawing' });
  }
}


export async function createBalloon(req: AuthRequest, res: Response) {
  try {
    const {
      inspectionSessionId,
      pageNumber = 1,
      x,
      y,
      width = 0.04,
      height = 0.04,
      leaderStartX,
      leaderStartY,
      manualDimension
    } = req.body;

    if (!inspectionSessionId || x === undefined || y === undefined) {
      return res.status(400).json({ error: 'Inspection session ID and normalized coordinates (x, y) are required' });
    }

    const session = await prisma.inspectionSession.findUnique({
      where: { id: inspectionSessionId },
      include: { drawing: true }
    });

    if (!session) {
      return res.status(404).json({ error: 'Inspection session not found' });
    }

    // 1. Calculate next sequential balloon number
    const existingBalloons = await prisma.balloon.findMany({
      where: { inspectionSessionId },
      select: { balloonNumber: true }
    });

    let nextBalloonNumber = 1;
    if (existingBalloons.length > 0) {
      const maxNum = Math.max(...existingBalloons.map(b => b.balloonNumber));
      nextBalloonNumber = maxNum + 1;
    }

    // 2. Extract dimension or use manual fallback
    let extracted: any = null;
    if (manualDimension) {
      extracted = {
        found: true,
        rawText: manualDimension.rawText || `${manualDimension.nominalValue || ''}`,
        nominalValue: manualDimension.nominalValue,
        upperTolerance: manualDimension.upperTolerance,
        lowerTolerance: manualDimension.lowerTolerance,
        unit: manualDimension.unit || 'mm',
        extractionMode: 'MANUAL'
      };
    } else {
      const drawingPath = path.resolve(session.drawing.filePath);
      extracted = await extractDimensionFromPdf({
        filePath: drawingPath,
        pageNumber,
        normX: x,
        normY: y
      });
    }

    // 3. Create Balloon in DB
    const balloon = await prisma.balloon.create({
      data: {
        inspectionSessionId,
        balloonNumber: nextBalloonNumber,
        pageNumber,
        x,
        y,
        width,
        height,
        leaderStartX: leaderStartX ?? null,
        leaderStartY: leaderStartY ?? null,
        createdById: req.user!.id
      }
    });

    // 4. Compute initial limits if nominal provided
    const nominal = extracted?.nominalValue !== undefined ? extracted.nominalValue : null;
    const upperTol = extracted?.upperTolerance !== undefined ? extracted.upperTolerance : null;
    const lowerTol = extracted?.lowerTolerance !== undefined ? extracted.lowerTolerance : null;
    const initialTolerance = calculateTolerance(nominal, upperTol, lowerTol, null);

    const measurement = await prisma.measurement.create({
      data: {
        balloonId: balloon.id,
        dimensionText: extracted?.rawText || `Dim #${nextBalloonNumber}`,
        nominalValue: nominal,
        upperTolerance: upperTol,
        lowerTolerance: lowerTol,
        lowerLimit: initialTolerance.lowerLimit,
        upperLimit: initialTolerance.upperLimit,
        actualValue: null,
        unit: extracted?.unit || 'mm',
        status: 'PENDING'
      }
    });

    const resultBalloon = {
      ...balloon,
      measurement,
      createdBy: { id: req.user!.id, name: req.user!.name }
    };

    // Broadcast WebSocket event
    broadcastToInspectionSession(inspectionSessionId, 'BALLOON_CREATED', {
      balloon: resultBalloon,
      extracted
    });

    return res.status(201).json({
      message: 'Balloon created successfully',
      balloon: resultBalloon,
      extracted
    });
  } catch (error: any) {
    console.error('Create balloon error:', error);
    return res.status(500).json({ error: 'Failed to create balloon' });
  }
}

export async function updateBalloon(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { x, y, leaderStartX, leaderStartY, leaderEndX, leaderEndY } = req.body;

    const balloon = await prisma.balloon.update({
      where: { id },
      data: {
        ...(x !== undefined && { x }),
        ...(y !== undefined && { y }),
        ...(leaderStartX !== undefined && { leaderStartX }),
        ...(leaderStartY !== undefined && { leaderStartY }),
        ...(leaderEndX !== undefined && { leaderEndX }),
        ...(leaderEndY !== undefined && { leaderEndY })
      },
      include: { measurement: true }
    });

    broadcastToInspectionSession(balloon.inspectionSessionId, 'BALLOON_UPDATED', { balloon });

    return res.json({ message: 'Balloon updated', balloon });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update balloon' });
  }
}

export async function deleteBalloon(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const balloon = await prisma.balloon.findUnique({ where: { id } });
    if (!balloon) {
      return res.status(404).json({ error: 'Balloon not found' });
    }

    await prisma.balloon.delete({ where: { id } });

    broadcastToInspectionSession(balloon.inspectionSessionId, 'BALLOON_DELETED', {
      balloonId: id,
      balloonNumber: balloon.balloonNumber
    });

    return res.json({ message: 'Balloon deleted successfully', id });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to delete balloon' });
  }
}
