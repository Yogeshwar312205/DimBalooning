import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import { extractDimensionFromPdf, extractAllDimensionsFromPdf } from '../services/pdfServiceConnector';
import { calculateTolerance } from '../utils/toleranceCalculator';
import { broadcastToInspectionSession } from '../websocket/socketHandler';

const prisma = new PrismaClient();

// Helper function: Check if two line segments intersect
function doLinesIntersect(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): boolean {
  // Calculate the direction of the lines
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  
  if (Math.abs(denom) < 1e-10) {
    return false; // Lines are parallel
  }
  
  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
  
  // Check if intersection point lies on both line segments
  return (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1);
}

// Helper function: Calculate distance from point to line segment
function pointToLineDistance(
  px: number, py: number,
  x1: number, y1: number, x2: number, y2: number
): number {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  
  let param = -1;
  if (lenSq !== 0) {
    param = dot / lenSq;
  }
  
  let xx, yy;
  
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }
  
  const dx = px - xx;
  const dy = py - yy;
  
  return Math.sqrt(dx * dx + dy * dy);
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

    // ENHANCED: More sophisticated collision avoidance with spatial indexing
    const placedPositions: Array<{ x: number; y: number }> = existingBalloons.map(b => ({ x: b.x, y: b.y }));
    const placedAnchors: Array<{ x: number; y: number }> = existingBalloons.map(b => ({
      x: b.leaderStartX ?? b.x,
      y: b.leaderStartY ?? b.y
    }));

    // FIX: Query ALL balloons across ALL pages to maintain global sequential numbering
    const allBalloonsInSession = await prisma.balloon.findMany({
      where: { inspectionSessionId },
      select: { balloonNumber: true }
    });

    let currentMaxNum = allBalloonsInSession.length > 0 ? Math.max(...allBalloonsInSession.map(b => b.balloonNumber)) : 0;
    const createdBalloons = [];
    
    // MODIFIED: Adjusted confidence filtering for dense drawings
    // Only filter if VERY dense (>150) and even then use a lower threshold
    let filteredItems = extractedData.items;
    let filterApplied = false;
    
    if (extractedData.items.length > 150) {
      // For extremely dense drawings, filter low-confidence detections
      const threshold = 0.65; // Lowered from 0.75 to preserve more valid dimensions
      filteredItems = extractedData.items.filter((item: any) => 
        (item.confidence ?? 0.7) >= threshold
      );
      filterApplied = true;
      console.log(`Very dense drawing (${extractedData.items.length} items): filtered to ${filteredItems.length} detections with confidence >= ${threshold}`);
    } else if (extractedData.items.length > 100) {
      // For moderately dense drawings, only filter very low confidence
      const threshold = 0.55; // Even lower threshold
      filteredItems = extractedData.items.filter((item: any) => 
        (item.confidence ?? 0.7) >= threshold
      );
      filterApplied = true;
      console.log(`Dense drawing (${extractedData.items.length} items): filtered to ${filteredItems.length} detections with confidence >= ${threshold}`);
    }

    for (const item of filteredItems) {
      const targetX = item.normX;
      const targetY = item.normY;
      const confidence = item.confidence ?? 0.7;

      // 1. ENHANCED: Adaptive spatial deduplication based on drawing density
      // Smaller threshold for dense areas, larger for sparse areas
      const localDensity = placedAnchors.filter(
        anchor => Math.hypot(anchor.x - targetX, anchor.y - targetY) < 0.05
      ).length;
      const dedupThreshold = localDensity > 5 ? 0.008 : 0.012; // Adaptive threshold
      
      const isDuplicate = placedAnchors.some(
        anchor => Math.hypot(anchor.x - targetX, anchor.y - targetY) < dedupThreshold
      );
      if (isDuplicate) continue;
      placedAnchors.push({ x: targetX, y: targetY });

      // 2. ENHANCED: Advanced candidate generation with whitespace detection
      // Generate more candidates in promising directions, fewer in crowded areas
      
      // First, assess local density and find promising directions
      const localBalloons = placedPositions.filter(pos => 
        Math.hypot(pos.x - targetX, pos.y - targetY) < 0.15
      );
      
      // Determine which quadrants are less crowded
      const quadrantDensity = {
        topRight: 0, topLeft: 0, bottomRight: 0, bottomLeft: 0
      };
      
      for (const pos of localBalloons) {
        const dx = pos.x - targetX;
        const dy = pos.y - targetY;
        if (dx > 0 && dy < 0) quadrantDensity.topRight++;
        else if (dx < 0 && dy < 0) quadrantDensity.topLeft++;
        else if (dx > 0 && dy > 0) quadrantDensity.bottomRight++;
        else quadrantDensity.bottomLeft++;
      }
      
      // Sort quadrants by density (prefer less crowded)
      const sortedQuadrants = Object.entries(quadrantDensity)
        .sort((a, b) => a[1] - b[1])
        .map(([name]) => name);
      
      // Map quadrant names to angle ranges
      const quadrantAngles: Record<string, number[]> = {
        topRight: [-Math.PI/4, 0, -Math.PI/8],
        topLeft: [-3*Math.PI/4, -Math.PI/2, -5*Math.PI/8],
        bottomRight: [Math.PI/4, Math.PI/2, 3*Math.PI/8],
        bottomLeft: [3*Math.PI/4, Math.PI, 5*Math.PI/8]
      };
      
      // Adaptive radii - start smaller for dense areas
      const localDensityNorm = localBalloons.length / 20; // Normalize to 0-1
      const minRadius = 0.035 + localDensityNorm * 0.015; // 0.035-0.050
      const adaptiveRadii = [
        minRadius,
        minRadius * 1.5,
        minRadius * 2.0,
        minRadius * 2.5,
        minRadius * 3.0,
        minRadius * 3.5
      ];
      
      // Generate candidates prioritizing less crowded quadrants
      const candidates: Array<{x: number, y: number, score: number}> = [];
      
      for (const r of adaptiveRadii) {
        // Try preferred quadrants first (more angles)
        for (let i = 0; i < sortedQuadrants.length; i++) {
          const quadrant = sortedQuadrants[i];
          const angles = quadrantAngles[quadrant];
          const numAngles = i === 0 ? angles.length : (i === 1 ? 2 : 1); // More angles for less crowded
          
          for (let j = 0; j < numAngles; j++) {
            const angle = angles[j];
            const candX = targetX + r * Math.cos(angle);
            const candY = targetY + r * Math.sin(angle);
            
            // Bounds check
            if (candX < 0.02 || candX > 0.98 || candY < 0.02 || candY > 0.98) {
              continue;
            }
            
            candidates.push({x: candX, y: candY, score: 0});
          }
        }
      }
      
      // Evaluate all candidates with comprehensive scoring
      let bestCandidate = {
        x: Math.max(0.03, Math.min(0.97, targetX + 0.04)),
        y: Math.max(0.03, Math.min(0.97, targetY - 0.03)),
        score: -10000
      };

      for (const cand of candidates) {
        let score = 1000; // Start with high base score
        
        // 1. Distance penalty (prefer closer)
        const distFromAnchor = Math.hypot(cand.x - targetX, cand.y - targetY);
        score -= distFromAnchor * 15;
        
        // 2. Collision detection with existing balloons
        let minDistToBalloon = 1.0;
        let hasCollision = false;
        const BALLOON_RADIUS = 0.022; // Actual balloon radius in normalized coords
        
        for (const pos of placedPositions) {
          const dist = Math.hypot(pos.x - cand.x, pos.y - cand.y);
          minDistToBalloon = Math.min(minDistToBalloon, dist);
          
          if (dist < BALLOON_RADIUS * 2.2) { // Hard collision
            hasCollision = true;
            score -= 5000; // Severe penalty
            break;
          } else if (dist < BALLOON_RADIUS * 3.0) { // Soft collision
            score -= (BALLOON_RADIUS * 3.0 - dist) * 200;
          } else if (dist < BALLOON_RADIUS * 4.0) { // Proximity penalty
            score -= (BALLOON_RADIUS * 4.0 - dist) * 50;
          }
        }
        
        if (!hasCollision) {
          // Reward good spacing
          score += Math.min(minDistToBalloon * 10, 50);
        }
        
        // 3. Leader line crossing detection
        let crossingPenalty = 0;
        for (let i = 0; i < placedPositions.length; i++) {
          const otherBalloon = placedPositions[i];
          const otherAnchor = placedAnchors[i];
          
          // Check if our leader would cross their leader
          if (doLinesIntersect(
            targetX, targetY, cand.x, cand.y,
            otherAnchor.x, otherAnchor.y, otherBalloon.x, otherBalloon.y
          )) {
            crossingPenalty += 30;
          }
          
          // Check if our leader would cross their balloon
          const distToOtherLine = pointToLineDistance(
            otherBalloon.x, otherBalloon.y,
            targetX, targetY, cand.x, cand.y
          );
          if (distToOtherLine < BALLOON_RADIUS * 1.5) {
            crossingPenalty += 20;
          }
        }
        score -= crossingPenalty;
        
        // 4. Edge proximity penalty
        const edgeDist = Math.min(cand.x, cand.y, 1 - cand.x, 1 - cand.y);
        if (edgeDist < 0.04) {
          score -= (0.04 - edgeDist) * 100;
        } else if (edgeDist < 0.08) {
          score -= (0.08 - edgeDist) * 20;
        }
        
        // 5. Preferred direction bonus (top-right for mechanical drawings)
        if (cand.x > targetX && cand.y < targetY) {
          score += 8;
        }
        
        // 6. Penalize placing balloons in dense anchor regions
        const nearbyAnchors = placedAnchors.filter(anchor =>
          Math.hypot(anchor.x - cand.x, anchor.y - cand.y) < 0.05
        ).length;
        if (nearbyAnchors > 0) {
          score -= nearbyAnchors * 10;
        }
        
        if (score > bestCandidate.score) {
          bestCandidate = { x: cand.x, y: cand.y, score };
        }
      }
      
      // Fallback if no good candidate found
      if (bestCandidate.score < -5000) {
        // Try progressive spiral outward
        for (let radius = 0.08; radius <= 0.20; radius += 0.02) {
          for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 6) {
            const candX = Math.max(0.03, Math.min(0.97, targetX + radius * Math.cos(angle)));
            const candY = Math.max(0.03, Math.min(0.97, targetY + radius * Math.sin(angle)));
            
            const minDist = Math.min(
              ...placedPositions.map(pos => Math.hypot(pos.x - candX, pos.y - candY)),
              1.0
            );
            
            if (minDist > 0.04) {
              const fallbackDist = Math.hypot(candX - targetX, candY - targetY);
              bestCandidate = { x: candX, y: candY, score: -fallbackDist * 15 };
              break;
            }
          }
          if (bestCandidate.score > -5000) break;
        }
      }
      
      placedPositions.push({ x: bestCandidate.x, y: bestCandidate.y });

      const balloon = await prisma.balloon.create({
        data: {
          inspectionSessionId,
          balloonNumber: currentMaxNum + 1,
          pageNumber,
          x: bestCandidate.x,
          y: bestCandidate.y,
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

    if (createdBalloons.length === 0 && filteredItems.length > 0) {
      return res.json({
        message: `All ${filteredItems.length} detected dimension callouts on this page are already ballooned.`,
        count: 0,
        balloons: [],
        stats: {
          totalExtractedCandidates: extractedData.items.length,
          filteredCandidates: filteredItems.length,
          createdBalloonsCount: 0,
          skippedDuplicatesCount: filteredItems.length
        }
      });
    }

    return res.status(201).json({
      message: `Successfully auto-detected ${createdBalloons.length} dimension balloons`,
      count: createdBalloons.length,
      balloons: createdBalloons,
      stats: {
        totalExtractedCandidates: extractedData.items.length,
        filteredCandidates: filteredItems.length,
        createdBalloonsCount: createdBalloons.length,
        skippedDuplicatesCount: Math.max(0, filteredItems.length - createdBalloons.length),
        skippedLowConfidence: extractedData.items.length - filteredItems.length
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
