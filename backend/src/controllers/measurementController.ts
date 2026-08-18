import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { PrismaClient } from '@prisma/client';
import { calculateTolerance } from '../utils/toleranceCalculator';
import { broadcastToInspectionSession } from '../websocket/socketHandler';

const prisma = new PrismaClient();

export async function updateMeasurement(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const {
      actualValue,
      nominalValue,
      upperTolerance,
      lowerTolerance,
      unit,
      dimensionText,
      remarks
    } = req.body;

    const existingMeasurement = await prisma.measurement.findUnique({
      where: { id },
      include: { balloon: true }
    });

    if (!existingMeasurement) {
      return res.status(404).json({ error: 'Measurement record not found' });
    }

    const nominal = nominalValue !== undefined ? nominalValue : existingMeasurement.nominalValue;
    const upperTol = upperTolerance !== undefined ? upperTolerance : existingMeasurement.upperTolerance;
    const lowerTol = lowerTolerance !== undefined ? lowerTolerance : existingMeasurement.lowerTolerance;
    const actual = actualValue !== undefined ? (actualValue === null || actualValue === '' ? null : Number(actualValue)) : existingMeasurement.actualValue;

    // Run deterministic tolerance calculation
    const calcResult = calculateTolerance(nominal, upperTol, lowerTol, actual);

    const updatedMeasurement = await prisma.measurement.update({
      where: { id },
      data: {
        ...(nominal !== undefined && { nominalValue: nominal }),
        ...(upperTol !== undefined && { upperTolerance: upperTol }),
        ...(lowerTol !== undefined && { lowerTolerance: lowerTol }),
        ...(unit !== undefined && { unit }),
        ...(dimensionText !== undefined && { dimensionText }),
        ...(remarks !== undefined && { remarks }),
        actualValue: actual,
        lowerLimit: calcResult.lowerLimit,
        upperLimit: calcResult.upperLimit,
        status: calcResult.status,
        updatedById: req.user!.id
      },
      include: {
        balloon: true,
        updatedBy: { select: { id: true, name: true } }
      }
    });

    // Broadcast update via WebSockets
    broadcastToInspectionSession(existingMeasurement.balloon.inspectionSessionId, 'MEASUREMENT_UPDATED', {
      measurement: updatedMeasurement,
      balloonId: existingMeasurement.balloonId,
      status: calcResult.status
    });

    return res.json({
      message: 'Measurement updated successfully',
      measurement: updatedMeasurement,
      validation: calcResult
    });
  } catch (error: any) {
    console.error('Update measurement error:', error);
    return res.status(500).json({ error: 'Failed to update measurement record' });
  }
}

export async function saveMeasurement(req: AuthRequest, res: Response) {
  try {
    const {
      balloonId,
      actualValue,
      nominalValue,
      upperTolerance,
      lowerTolerance,
      unit,
      dimensionText,
      remarks
    } = req.body;

    if (!balloonId) {
      return res.status(400).json({ error: 'balloonId is required' });
    }

    const balloon = await prisma.balloon.findUnique({
      where: { id: balloonId },
      include: { measurement: true }
    });

    if (!balloon) {
      return res.status(404).json({ error: 'Balloon not found' });
    }

    let existing = balloon.measurement;
    const nominal = nominalValue !== undefined ? nominalValue : existing?.nominalValue;
    const upperTol = upperTolerance !== undefined ? upperTolerance : existing?.upperTolerance;
    const lowerTol = lowerTolerance !== undefined ? lowerTolerance : existing?.lowerTolerance;
    const actual = actualValue !== undefined ? (actualValue === null || actualValue === '' ? null : Number(actualValue)) : existing?.actualValue;

    const calcResult = calculateTolerance(nominal, upperTol, lowerTol, actual);

    let savedMeasurement: any = null;

    if (existing) {
      savedMeasurement = await prisma.measurement.update({
        where: { id: existing.id },
        data: {
          ...(nominal !== undefined && { nominalValue: nominal }),
          ...(upperTol !== undefined && { upperTolerance: upperTol }),
          ...(lowerTol !== undefined && { lowerTolerance: lowerTol }),
          ...(unit !== undefined && { unit }),
          ...(dimensionText !== undefined && { dimensionText }),
          ...(remarks !== undefined && { remarks }),
          actualValue: actual,
          lowerLimit: calcResult.lowerLimit,
          upperLimit: calcResult.upperLimit,
          status: calcResult.status,
          updatedById: req.user!.id
        },
        include: {
          balloon: true,
          updatedBy: { select: { id: true, name: true } }
        }
      });
    } else {
      savedMeasurement = await prisma.measurement.create({
        data: {
          balloonId: balloon.id,
          dimensionText: dimensionText || `Dim #${balloon.balloonNumber}`,
          nominalValue: nominal,
          upperTolerance: upperTol,
          lowerTolerance: lowerTol,
          lowerLimit: calcResult.lowerLimit,
          upperLimit: calcResult.upperLimit,
          actualValue: actual,
          unit: unit || 'mm',
          status: calcResult.status,
          updatedById: req.user!.id
        },
        include: {
          balloon: true,
          updatedBy: { select: { id: true, name: true } }
        }
      });
    }

    broadcastToInspectionSession(balloon.inspectionSessionId, 'MEASUREMENT_UPDATED', {
      measurement: savedMeasurement,
      balloonId: balloon.id,
      status: calcResult.status
    });

    return res.json({
      message: 'Measurement saved successfully',
      measurement: savedMeasurement,
      validation: calcResult
    });
  } catch (error: any) {
    console.error('Save measurement error:', error);
    return res.status(500).json({ error: 'Failed to save measurement record' });
  }
}
