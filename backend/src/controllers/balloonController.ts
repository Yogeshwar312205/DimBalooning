import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import { extractDimensionFromPdf, extractAllDimensionsFromPdf } from '../services/pdfServiceConnector';
import { calculateTolerance } from '../utils/toleranceCalculator';
import { broadcastToInspectionSession } from '../websocket/socketHandler';

const prisma = new PrismaClient();

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

    // 3. Resolve user ID safely
    let userId = req.user?.id;
    if (userId) {
      const userExists = await prisma.user.findUnique({ where: { id: userId } });
      if (!userExists) {
        const matchingEmailUser = req.user?.email ? await prisma.user.findUnique({ where: { email: req.user.email } }) : null;
        if (matchingEmailUser) {
          userId = matchingEmailUser.id;
        } else {
          const fallbackUser = await prisma.user.findFirst();
          if (fallbackUser) {
            userId = fallbackUser.id;
          }
        }
      }
    }

    if (!userId) {
      return res.status(401).json({ error: 'User session invalid. Please log in again.' });
    }

    // 4. Create Balloon in DB
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
        createdById: userId
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

export async function autoDetectBalloons(req: AuthRequest, res: Response) {
  try {
    const { inspectionSessionId, pageNumber = 1 } = req.body;
    if (!inspectionSessionId) {
      return res.status(400).json({ error: 'inspectionSessionId is required' });
    }

    const session = await prisma.inspectionSession.findUnique({
      where: { id: inspectionSessionId },
      include: { drawing: true }
    });

    if (!session || !session.drawing) {
      return res.status(404).json({ error: 'Inspection session or drawing file not found' });
    }

    let drawingPath = session.drawing.filePath;
    if (!fs.existsSync(drawingPath)) {
      drawingPath = path.resolve(process.cwd(), session.drawing.filePath);
    }
    if (!fs.existsSync(drawingPath)) {
      drawingPath = path.resolve(process.cwd(), 'uploads', path.basename(session.drawing.filePath));
    }

    if (!fs.existsSync(drawingPath)) {
      return res.status(404).json({ error: `PDF file not found on server disk at ${drawingPath}` });
    }

    const extractedData = await extractAllDimensionsFromPdf(drawingPath, pageNumber);

    if (!extractedData.success || !extractedData.items || extractedData.items.length === 0) {
      const msg = extractedData.error || 'No dimension callouts detected on this page.';
      return res.json({ message: msg, count: 0, balloons: [] });
    }

    // Safe user lookup
    let userId = req.user?.id;
    if (userId) {
      const userExists = await prisma.user.findUnique({ where: { id: userId } });
      if (!userExists) {
        const fallbackUser = await prisma.user.findFirst();
        userId = fallbackUser?.id;
      }
    }

    if (!userId) {
      return res.status(401).json({ error: 'User session invalid. Please log in again.' });
    }

    const existingBalloons = await prisma.balloon.findMany({
      where: { inspectionSessionId, pageNumber },
      select: { balloonNumber: true, x: true, y: true, leaderStartX: true, leaderStartY: true }
    });

    // Track placed balloon circle positions and anchor positions to avoid overlap
    const placedPositions: Array<{ x: number; y: number }> = existingBalloons.map(b => ({ x: b.x, y: b.y }));
    const placedAnchors: Array<{ x: number; y: number }> = existingBalloons.map(b => ({
      x: b.leaderStartX ?? b.x,
      y: b.leaderStartY ?? b.y
    }));

    let currentMaxNum = existingBalloons.length > 0 ? Math.max(...existingBalloons.map(b => b.balloonNumber)) : 0;
    const createdBalloons = [];

    for (const item of extractedData.items) {
      const targetX = item.normX;
      const targetY = item.normY;

      // 1. Spatial Proximity Duplicate Check (Merge only if anchor position is within 0.010 distance, ~1% page bounds)
      const isDuplicate = placedAnchors.some(
        anchor => Math.hypot(anchor.x - targetX, anchor.y - targetY) < 0.010
      );
      if (isDuplicate) continue;
      placedAnchors.push({ x: targetX, y: targetY });

      // 2. Candidate Spiral Collision Avoidance Search for Balloon Circle Position
      const candidateRadii = [0.04, 0.065, 0.09, 0.12];
      const angles = [
        -Math.PI / 4,      // Top-Right
        -3 * Math.PI / 4,  // Top-Left
        Math.PI / 4,       // Bottom-Right
        3 * Math.PI / 4,   // Bottom-Left
        -Math.PI / 2,      // Top
        0,                 // Right
        Math.PI / 2,       // Bottom
        Math.PI            // Left
      ];

      let chosenX = Math.max(0.03, Math.min(0.97, targetX + 0.04));
      let chosenY = Math.max(0.03, Math.min(0.97, targetY - 0.03));
      let foundFree = false;

      for (const r of candidateRadii) {
        for (const angle of angles) {
          const candX = Math.max(0.03, Math.min(0.97, targetX + r * Math.cos(angle)));
          const candY = Math.max(0.03, Math.min(0.97, targetY + r * Math.sin(angle)));

          const collides = placedPositions.some(
            pos => Math.hypot(pos.x - candX, pos.y - candY) < 0.035
          );

          if (!collides) {
            chosenX = candX;
            chosenY = candY;
            foundFree = true;
            break;
          }
        }
        if (foundFree) break;
      }

      placedPositions.push({ x: chosenX, y: chosenY });

      const balloon = await prisma.balloon.create({
        data: {
          inspectionSessionId,
          balloonNumber: currentMaxNum + 1,
          pageNumber,
          x: chosenX,
          y: chosenY,
          leaderStartX: targetX,
          leaderStartY: targetY,
          width: 0.04,
          height: 0.04,
          createdById: userId
        }
      });
      currentMaxNum++;

      const nominal = item.nominalValue ?? null;
      const upperTol = item.upperTolerance ?? null;
      const lowerTol = item.lowerTolerance ?? null;
      const initialTolerance = calculateTolerance(nominal, upperTol, lowerTol, null);

      const measurement = await prisma.measurement.create({
        data: {
          balloonId: balloon.id,
          dimensionText: item.rawText || `Dim #${currentMaxNum}`,
          nominalValue: nominal,
          upperTolerance: upperTol,
          lowerTolerance: lowerTol,
          lowerLimit: initialTolerance.lowerLimit,
          upperLimit: initialTolerance.upperLimit,
          actualValue: null,
          unit: item.unit || 'mm',
          status: 'PENDING'
        }
      });

      const fullBalloon = {
        ...balloon,
        measurement,
        createdBy: { id: userId, name: req.user?.name || 'Inspector' }
      };

      createdBalloons.push(fullBalloon);

      broadcastToInspectionSession(inspectionSessionId, 'BALLOON_CREATED', {
        balloon: fullBalloon,
        extracted: item
      });
    }

    if (createdBalloons.length === 0 && extractedData.items.length > 0) {
      return res.json({
        message: `All ${extractedData.items.length} detected dimension callouts on this page are already ballooned.`,
        count: 0,
        balloons: []
      });
    }

    return res.status(201).json({
      message: `Successfully auto-detected ${createdBalloons.length} dimension balloons`,
      count: createdBalloons.length,
      balloons: createdBalloons,
      stats: {
        totalExtractedCandidates: extractedData.items.length,
        createdBalloonsCount: createdBalloons.length,
        skippedDuplicatesCount: Math.max(0, extractedData.items.length - createdBalloons.length)
      }
    });
  } catch (error: any) {
    console.error('Auto detect balloons error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to auto detect balloons' });
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
