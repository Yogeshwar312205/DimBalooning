import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import path from 'path';
import fs from 'fs';
import { fetchPdfInfo, autoExtractDimensionsFromPdf } from '../services/pdfServiceConnector';
import { calculateTolerance } from '../utils/toleranceCalculator';
import { broadcastToInspectionSession } from '../websocket/socketHandler';

/**
 * 32-Candidate Radial Spiral Search Algorithm
 */
function calculateSpiralBalloonPosition(
  anchorX: number,
  anchorY: number,
  placedBalloons: Array<{ x: number; y: number }>
): { x: number; y: number } {
  const radii = [0.04, 0.065, 0.09, 0.12];
  const angles = [
    0,
    Math.PI / 4,
    Math.PI / 2,
    (3 * Math.PI) / 4,
    Math.PI,
    (5 * Math.PI) / 4,
    (3 * Math.PI) / 2,
    (7 * Math.PI) / 4
  ];
  const minDistance = 0.04;

  for (const r of radii) {
    for (const theta of angles) {
      const candidateX = anchorX + r * Math.cos(theta);
      const candidateY = anchorY + r * Math.sin(theta);

      if (candidateX < 0.02 || candidateX > 0.98 || candidateY < 0.02 || candidateY > 0.98) {
        continue;
      }

      const hasCollision = placedBalloons.some((b) => {
        const dist = Math.hypot(candidateX - b.x, candidateY - b.y);
        return dist < minDistance;
      });

      if (!hasCollision) {
        return {
          x: Number(candidateX.toFixed(4)),
          y: Number(candidateY.toFixed(4))
        };
      }
    }
  }

  return {
    x: Number(Math.max(0.02, Math.min(0.98, anchorX + 0.03)).toFixed(4)),
    y: Number(Math.max(0.02, Math.min(0.98, anchorY - 0.03)).toFixed(4))
  };
}

/**
 * Background Dimension Extraction Worker
 */
async function processExtractionInBackground(sessionId: string, filePath: string, drawingName: string) {
  try {
    console.log(`\n======================================================`);
    console.log(`🚀 [Background-Worker] Auto-Extraction Triggered for: "${drawingName}"`);
    console.log(`📄 [Background-Worker] PDF File: ${path.basename(filePath)}`);
    console.log(`======================================================`);

    const absolutePath = path.resolve(filePath);

    const extractionResult = await autoExtractDimensionsFromPdf({
      filePath: absolutePath,
      pageNumber: 1
    });

    const items = extractionResult.items || extractionResult.balloons || [];
    const placedPositions: Array<{ x: number; y: number }> = [];
    const createdBalloons: any[] = [];
    let balloonNum = 1;

    for (const item of items) {
      const anchorX = item.normX !== undefined ? item.normX : item.x;
      const anchorY = item.normY !== undefined ? item.normY : item.y;

      if (anchorX === undefined || anchorY === undefined) continue;

      const balloonPos = calculateSpiralBalloonPosition(anchorX, anchorY, placedPositions);
      placedPositions.push(balloonPos);

      const nominal = item.nominalValue !== undefined && item.nominalValue !== null ? Number(item.nominalValue) : null;
      const upperTol = item.upperTolerance !== undefined && item.upperTolerance !== null ? Number(item.upperTolerance) : 0;
      const lowerTol = item.lowerTolerance !== undefined && item.lowerTolerance !== null ? Number(item.lowerTolerance) : 0;
      const tolMath = calculateTolerance(nominal, upperTol, lowerTol, null);

      const balloon = await prisma.balloon.create({
        data: {
          inspectionSessionId: sessionId,
          balloonNumber: balloonNum,
          pageNumber: 1,
          x: balloonPos.x,
          y: balloonPos.y,
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
              dimensionText: item.rawText || item.dimensionText || `Dim #${balloonNum}`,
              nominalValue: nominal,
              upperTolerance: upperTol,
              lowerTolerance: lowerTol,
              lowerLimit: tolMath.lowerLimit,
              upperLimit: tolMath.upperLimit,
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
      balloonNum++;
    }

    console.log(`✅ [Background-Worker] Successfully saved & placed ${createdBalloons.length} balloons via ${extractionResult.engine || 'Smart Router'}`);
    console.log(`⚡ [Background-Worker] Broadcasting auto-sync to WebSocket session: ${sessionId}\n`);

    // Real-Time WebSocket Broadcast
    broadcastToInspectionSession(sessionId, 'BALLOONS_AUTO_EXTRACTED', {
      balloons: createdBalloons
    });

  } catch (err: any) {
    console.error(`❌ [Background-Worker Error] Failed extraction for ${sessionId}:`, err?.message || err);
  }
}

export async function uploadDrawing(req: Request, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const { name, revision, partNumber, partName, batchNumber } = req.body;
    const drawingName = name || req.file.originalname.replace(/\.[^/.]+$/, '');
    const absolutePath = path.resolve(req.file.path);

    // 1. Fetch PDF Metadata (Fast - ~50ms)
    const pdfInfo = await fetchPdfInfo(absolutePath);
    const pageCount = pdfInfo.pageCount || 1;

    // 2. Create Drawing in PostgreSQL
    const drawing = await prisma.drawing.create({
      data: {
        name: drawingName,
        filePath: req.file.path,
        revision: revision || 'Rev A',
        pageCount
      }
    });

    // 3. Create Default Inspection Session
    const session = await prisma.inspectionSession.create({
      data: {
        drawingId: drawing.id,
        name: `${drawingName} Inspection`,
        partNumber: partNumber || drawingName,
        partName: partName || 'Mechanical Component',
        revision: revision || 'Rev A',
        batchNumber: batchNumber || `BATCH-${Math.floor(1000 + Math.random() * 9000)}`,
        status: 'IN_PROGRESS'
      }
    });

    // 4. Fire-and-forget background extraction (Non-blocking)
    processExtractionInBackground(session.id, req.file.path, drawing.name);

    // 5. Send immediate response (<200ms)
    return res.status(201).json({
      message: 'Drawing uploaded successfully. Extraction started in background.',
      drawing,
      session
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to process drawing upload' });
  }
}

export async function extractDrawing(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const drawing = await prisma.drawing.findUnique({ where: { id } });
    if (!drawing) {
      return res.status(404).json({ error: 'Drawing not found' });
    }

    let session = await prisma.inspectionSession.findFirst({
      where: { drawingId: id },
      orderBy: { updatedAt: 'desc' }
    });

    if (!session) {
      session = await prisma.inspectionSession.create({
        data: {
          drawingId: id,
          name: `${drawing.name} AI Re-Scan`,
          partNumber: drawing.name,
          partName: 'Mechanical Component',
          revision: drawing.revision,
          batchNumber: `BATCH-${Math.floor(1000 + Math.random() * 9000)}`,
          status: 'IN_PROGRESS'
        }
      });
    }

    await prisma.balloon.deleteMany({
      where: { inspectionSessionId: session.id }
    });

    const absolutePath = path.resolve(drawing.filePath);
    const extractionResult = await autoExtractDimensionsFromPdf({
      filePath: absolutePath,
      pageNumber: 1
    });

    const items = extractionResult.items || extractionResult.balloons || [];
    const placedPositions: Array<{ x: number; y: number }> = [];
    const createdBalloons: any[] = [];
    let balloonNum = 1;

    for (const item of items) {
      const anchorX = item.normX !== undefined ? item.normX : item.x;
      const anchorY = item.normY !== undefined ? item.normY : item.y;
      if (anchorX === undefined || anchorY === undefined) continue;

      const balloonPos = calculateSpiralBalloonPosition(anchorX, anchorY, placedPositions);
      placedPositions.push(balloonPos);

      const nominal = item.nominalValue !== undefined && item.nominalValue !== null ? Number(item.nominalValue) : null;
      const upperTol = item.upperTolerance !== undefined && item.upperTolerance !== null ? Number(item.upperTolerance) : 0;
      const lowerTol = item.lowerTolerance !== undefined && item.lowerTolerance !== null ? Number(item.lowerTolerance) : 0;
      const tolMath = calculateTolerance(nominal, upperTol, lowerTol, null);

      const balloon = await prisma.balloon.create({
        data: {
          inspectionSessionId: session.id,
          balloonNumber: balloonNum,
          pageNumber: 1,
          x: balloonPos.x,
          y: balloonPos.y,
          width: 0.04,
          height: 0.04,
          leaderStartX: Number(anchorX.toFixed(4)),
          leaderStartY: Number(anchorY.toFixed(4)),
          isAiExtracted: true,
          nominalValue: nominal,
          upperTolerance: upperTol,
          lowerTolerance: lowerTol,
          unit: item.unit || 'mm',
          measurement: {
            create: {
              dimensionText: item.rawText || item.dimensionText || `Dim #${balloonNum}`,
              nominalValue: nominal,
              upperTolerance: upperTol,
              lowerTolerance: lowerTol,
              lowerLimit: tolMath.lowerLimit,
              upperLimit: tolMath.upperLimit,
              actualValue: null,
              unit: item.unit || 'mm',
              status: 'PENDING'
            }
          }
        },
        include: { measurement: true }
      });
      createdBalloons.push(balloon);
      balloonNum++;
    }

    broadcastToInspectionSession(session.id, 'BALLOONS_AUTO_EXTRACTED', {
      balloons: createdBalloons
    });

    return res.json({
      message: 'Deep AI scan and spiral ballooning completed successfully',
      sessionId: session.id,
      balloonsCount: createdBalloons.length,
      balloons: createdBalloons
    });
  } catch (error: any) {
    console.error('Extract drawing error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to execute deep AI extraction' });
  }
}

export async function getDrawings(req: Request, res: Response) {
  try {
    const drawings = await prisma.drawing.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        inspectionSessions: {
          orderBy: { updatedAt: 'desc' },
          include: {
            _count: { select: { balloons: true } }
          }
        },
        _count: { select: { inspectionSessions: true } }
      }
    });
    return res.json({ drawings });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch drawings' });
  }
}

export async function getDrawingById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const drawing = await prisma.drawing.findUnique({
      where: { id },
      include: {
        inspectionSessions: {
          include: {
            balloons: {
              include: { measurement: true }
            }
          }
        }
      }
    });

    if (!drawing) {
      return res.status(404).json({ error: 'Drawing not found' });
    }

    return res.json({ drawing });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch drawing' });
  }
}

export async function getDrawingFile(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const drawing = await prisma.drawing.findUnique({ where: { id } });
    if (!drawing) {
      return res.status(404).json({ error: 'Drawing not found' });
    }

    const filePath = path.resolve(drawing.filePath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Drawing file not found on server disk' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    return res.sendFile(filePath);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to stream drawing file' });
  }
}