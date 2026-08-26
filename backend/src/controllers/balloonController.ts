import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import path from 'path';
import { extractDimensionFromPdf, autoExtractDimensionsFromPdf } from '../services/pdfServiceConnector';
import { calculateTolerance } from '../utils/toleranceCalculator';
import { broadcastToInspectionSession } from '../websocket/socketHandler';

export async function autoExtractBalloons(req: Request, res: Response) {
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

    const extractionResult = await autoExtractDimensionsFromPdf({
      filePath: drawingPath,
      pageNumber
    });

    const items = extractionResult.items || extractionResult.balloons || [];

    const existingBalloons = await prisma.balloon.findMany({
      where: { inspectionSessionId: sessionId },
      select: { balloonNumber: true }
    });

    let currentBalloonNum = existingBalloons.length > 0
      ? Math.max(...existingBalloons.map(b => b.balloonNumber)) + 1
      : 1;

    const createdBalloons: any[] = [];

    for (const item of items) {
      const anchorX = item.normX !== undefined ? item.normX : (item.x ?? 0.5);
      const anchorY = item.normY !== undefined ? item.normY : (item.y ?? 0.5);
      const balloonX = item.x !== undefined ? item.x : Math.max(0.02, Math.min(0.98, anchorX + 0.03));
      const balloonY = item.y !== undefined ? item.y : Math.max(0.02, Math.min(0.98, anchorY - 0.03));

      const nominal = item.nominalValue !== undefined && item.nominalValue !== null ? Number(item.nominalValue) : null;
      const upperTol = item.upperTolerance !== undefined && item.upperTolerance !== null ? Number(item.upperTolerance) : 0;
      const lowerTol = item.lowerTolerance !== undefined && item.lowerTolerance !== null ? Number(item.lowerTolerance) : 0;
      const initialTolerance = calculateTolerance(nominal, upperTol, lowerTol, null);

      const balloon = await prisma.balloon.create({
        data: {
          inspectionSessionId: sessionId,
          balloonNumber: currentBalloonNum,
          pageNumber,
          x: Number(balloonX.toFixed(4)),
          y: Number(balloonY.toFixed(4)),
          width: 0.04,
          height: 0.04,
          leaderStartX: Number(anchorX.toFixed(4)),
          leaderStartY: Number(anchorY.toFixed(4)),
          isAiExtracted: item.isAiExtracted ?? (item.extractionMode !== 'VECTOR_AUTOMATIC'),
          nominalValue: nominal,
          upperTolerance: upperTol,
          lowerTolerance: lowerTol,
          unit: item.unit || 'mm',
          measurement: {
            create: {
              dimensionText: item.rawText || item.dimensionText || `Dim #${currentBalloonNum}`,
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
          measurement: true
        }
      });

      createdBalloons.push(balloon);
      currentBalloonNum++;
    }

    broadcastToInspectionSession(sessionId, 'BALLOONS_AUTO_EXTRACTED', {
      sessionId,
      balloons: createdBalloons,
      extractionSummary: {
        extractedCount: createdBalloons.length,
        processingTimeSeconds: extractionResult.processingTimeSeconds || 0,
        engine: extractionResult.engine || 'SMART_ROUTER'
      }
    });

    return res.status(200).json({
      message: `Successfully auto-extracted ${createdBalloons.length} dimensions`,
      balloons: createdBalloons,
      extractionSummary: {
        extractedCount: createdBalloons.length,
        processingTimeSeconds: extractionResult.processingTimeSeconds || 0,
        engine: extractionResult.engine || 'SMART_ROUTER'
      }
    });
  } catch (error: any) {
    console.error('Auto-extract balloons error:', error);
    return res.status(500).json({ error: error.message || 'Failed to auto-extract dimensions' });
  }
}

export async function createBalloon(req: Request, res: Response) {
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

    const existingBalloons = await prisma.balloon.findMany({
      where: { inspectionSessionId },
      select: { balloonNumber: true }
    });

    let nextBalloonNumber = existingBalloons.length > 0
      ? Math.max(...existingBalloons.map(b => b.balloonNumber)) + 1
      : 1;

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

    const nominal = extracted?.nominalValue !== undefined ? extracted.nominalValue : null;
    const upperTol = extracted?.upperTolerance !== undefined ? extracted.upperTolerance : 0;
    const lowerTol = extracted?.lowerTolerance !== undefined ? extracted.lowerTolerance : 0;
    const initialTolerance = calculateTolerance(nominal, upperTol, lowerTol, null);

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
        isAiExtracted: false,
        nominalValue: nominal,
        upperTolerance: upperTol,
        lowerTolerance: lowerTol,
        unit: extracted?.unit || 'mm'
      }
    });

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
      measurement
    };

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

export async function updateBalloon(req: Request, res: Response) {
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

export async function deleteBalloon(req: Request, res: Response) {
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