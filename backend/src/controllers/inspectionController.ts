import { Request, Response } from 'express';
import prisma from '../utils/prisma'

export async function createInspectionSession(req: Request, res: Response) {
  try {
    const { drawingId, name, partNumber, partName, revision, batchNumber } = req.body;

    if (!drawingId || !name || !partNumber || !partName || !batchNumber) {
      return res.status(400).json({ error: 'Drawing ID, session name, part number, part name, and batch number are required' });
    }

    const drawing = await prisma.drawing.findUnique({ where: { id: drawingId } });
    if (!drawing) {
      return res.status(404).json({ error: 'Associated engineering drawing not found' });
    }

    const session = await prisma.inspectionSession.create({
      data: {
        drawingId,
        name,
        partNumber,
        partName,
        revision: revision || drawing.revision || 'Rev A',
        batchNumber,
        status: 'IN_PROGRESS'
      },
      include: {
        drawing: true
      }
    });

    return res.status(201).json({
      message: 'Inspection session created successfully',
      session
    });
  } catch (error: any) {
    console.error('Create inspection session error:', error);
    return res.status(500).json({ error: 'Failed to create inspection session' });
  }
}

export async function getInspectionSessions(req: Request, res: Response) {
  try {
    const sessions = await prisma.inspectionSession.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        drawing: true,
        _count: { select: { balloons: true } }
      }
    });
    return res.json({ sessions });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch inspection sessions' });
  }
}

export async function getInspectionSessionById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const session = await prisma.inspectionSession.findUnique({
      where: { id },
      include: {
        drawing: true,
        balloons: {
          include: {
            measurement: true
          },
          orderBy: { balloonNumber: 'asc' }
        }
      }
    });

    if (!session) {
      return res.status(404).json({ error: 'Inspection session not found' });
    }

    return res.json({ session });
  } catch (error: any) {
    console.error('Get inspection session error:', error);
    return res.status(500).json({ error: 'Failed to fetch inspection session' });
  }
}

export async function updateInspectionStatus(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'APPROVED'];
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}` });
    }

    const session = await prisma.inspectionSession.update({
      where: { id },
      data: { status },
      include: { drawing: true }
    });

    return res.json({ message: 'Inspection session status updated', session });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update inspection session status' });
  }
}

export async function getDashboardStats(req: Request, res: Response) {
  try {
    const totalDrawings = await prisma.drawing.count();
    const totalSessions = await prisma.inspectionSession.count();
    const activeSessions = await prisma.inspectionSession.count({
      where: { status: 'IN_PROGRESS' }
    });
    const completedSessions = await prisma.inspectionSession.count({
      where: { status: { in: ['COMPLETED', 'APPROVED'] } }
    });

    const measurements = await prisma.measurement.findMany({
      select: { status: true }
    });

    let passCount = 0;
    let checkCount = 0;
    let failCount = 0;
    let pendingCount = 0;

    measurements.forEach((m) => {
      if (m.status === 'PASS') passCount++;
      else if (m.status === 'CHECK') checkCount++;
      else if (m.status === 'FAIL') failCount++;
      else pendingCount++;
    });

    const totalEvaluated = passCount + checkCount + failCount;
    const passRate = totalEvaluated > 0 ? Number(((passCount / totalEvaluated) * 100).toFixed(1)) : 100;

    const recentSessions = await prisma.inspectionSession.findMany({
      take: 5,
      orderBy: { updatedAt: 'desc' },
      include: {
        drawing: { select: { name: true } },
        _count: { select: { balloons: true } }
      }
    });

    return res.json({
      totalDrawings,
      totalSessions,
      activeSessions,
      completedSessions,
      passCount,
      checkCount,
      failCount,
      pendingCount,
      passRate,
      recentSessions
    });
  } catch (error: any) {
    console.error('Dashboard stats error:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
}