import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function createInspectionSession(req: AuthRequest, res: Response) {
  try {
    const { drawingId, name, partNumber, partName, revision, batchNumber } = req.body;

    if (!drawingId || !name || !partNumber || !partName || !batchNumber) {
      return res.status(400).json({ error: 'Drawing ID, session name, part number, part name, and batch number are required' });
    }

    const drawing = await prisma.drawing.findUnique({ where: { id: drawingId } });
    if (!drawing) {
      return res.status(404).json({ error: 'Associated engineering drawing not found' });
    }

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

    const session = await prisma.inspectionSession.create({
      data: {
        drawingId,
        name,
        partNumber,
        partName,
        revision: revision || drawing.revision || 'Rev A',
        batchNumber,
        status: 'IN_PROGRESS',
        createdById: userId
      },
      include: {
        drawing: true,
        createdBy: { select: { id: true, name: true, email: true } }
      }
    });

    return res.status(201).json({
      message: 'Inspection session created successfully',
      session
    });
  } catch (error: any) {
    console.error('Create inspection session error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to create inspection session' });
  }
}

export async function getInspectionSessions(req: AuthRequest, res: Response) {
  try {
    const sessions = await prisma.inspectionSession.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        drawing: true,
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { balloons: true } }
      }
    });
    return res.json({ sessions });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch inspection sessions' });
  }
}

export async function getInspectionSessionById(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const session = await prisma.inspectionSession.findUnique({
      where: { id },
      include: {
        drawing: true,
        createdBy: { select: { id: true, name: true, email: true } },
        balloons: {
          include: {
            measurement: true,
            createdBy: { select: { id: true, name: true } }
          },
          orderBy: { balloonNumber: 'asc' }
        },
        collaborators: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } }
          }
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

export async function updateInspectionStatus(req: AuthRequest, res: Response) {
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

export async function getDashboardStats(req: AuthRequest, res: Response) {
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
        createdBy: { select: { name: true } },
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
