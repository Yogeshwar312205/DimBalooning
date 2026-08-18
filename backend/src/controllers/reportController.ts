import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import { generateExcelReport } from '../services/excelReportService';
import { requestMarkedUpPdf } from '../services/pdfServiceConnector';
import { config } from '../config';

const prisma = new PrismaClient();

export async function generateExcel(req: AuthRequest, res: Response) {
  try {
    const { inspectionSessionId, companyName } = req.body;
    if (!inspectionSessionId) {
      return res.status(400).json({ error: 'Inspection session ID is required' });
    }

    const session = await prisma.inspectionSession.findUnique({
      where: { id: inspectionSessionId },
      include: {
        drawing: true,
        createdBy: true,
        balloons: {
          include: { measurement: true },
          orderBy: { balloonNumber: 'asc' }
        }
      }
    });

    if (!session) {
      return res.status(404).json({ error: 'Inspection session not found' });
    }

    const items = session.balloons.map((b) => ({
      balloonNumber: b.balloonNumber,
      dimensionText: b.measurement?.dimensionText || `Balloon ${b.balloonNumber}`,
      nominalValue: b.measurement?.nominalValue ?? null,
      upperTolerance: b.measurement?.upperTolerance ?? null,
      lowerTolerance: b.measurement?.lowerTolerance ?? null,
      lowerLimit: b.measurement?.lowerLimit ?? null,
      upperLimit: b.measurement?.upperLimit ?? null,
      actualValue: b.measurement?.actualValue ?? null,
      unit: b.measurement?.unit || 'mm',
      status: b.measurement?.status || 'PENDING',
      remarks: b.measurement?.remarks || ''
    }));

    const excelPath = await generateExcelReport({
      companyName: companyName || 'Industrial Precision Engineering',
      partName: session.partName,
      partNumber: session.partNumber,
      drawingName: session.drawing.name,
      revision: session.revision,
      batchNumber: session.batchNumber,
      inspectorName: session.createdBy.name,
      inspectionDate: new Date(session.createdAt).toLocaleDateString(),
      items
    });

    const report = await prisma.report.create({
      data: {
        inspectionSessionId,
        type: 'EXCEL',
        filePath: excelPath,
        generatedById: req.user!.id
      }
    });

    return res.json({
      message: 'Excel report generated successfully',
      report,
      downloadUrl: `/reports/download/${report.id}`
    });
  } catch (error: any) {
    console.error('Generate Excel report error:', error);
    return res.status(500).json({ error: 'Failed to generate Excel report' });
  }
}

export async function generateMarkedPdf(req: AuthRequest, res: Response) {
  try {
    const { inspectionSessionId } = req.body;
    if (!inspectionSessionId) {
      return res.status(400).json({ error: 'Inspection session ID is required' });
    }

    const session = await prisma.inspectionSession.findUnique({
      where: { id: inspectionSessionId },
      include: {
        drawing: true,
        balloons: {
          include: { measurement: true }
        }
      }
    });

    if (!session) {
      return res.status(404).json({ error: 'Inspection session not found' });
    }

    const inputPdfPath = path.resolve(session.drawing.filePath);
    const reportsDir = path.resolve(config.reportsDir);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const outputPdfFilename = `MarkedUp_${session.partNumber}_${Date.now()}.pdf`;
    const outputPdfPath = path.join(reportsDir, outputPdfFilename);

    const balloonsData = session.balloons.map((b) => ({
      pageNumber: b.pageNumber,
      x: b.x,
      y: b.y,
      balloonNumber: b.balloonNumber,
      status: b.measurement?.status || 'PENDING',
      leaderStartX: b.leaderStartX,
      leaderStartY: b.leaderStartY
    }));

    const result = await requestMarkedUpPdf(inputPdfPath, outputPdfPath, balloonsData);

    const report = await prisma.report.create({
      data: {
        inspectionSessionId,
        type: 'MARKED_PDF',
        filePath: outputPdfPath,
        generatedById: req.user!.id
      }
    });

    return res.json({
      message: 'Marked-up PDF generated successfully',
      report,
      downloadUrl: `/reports/download/${report.id}`
    });
  } catch (error: any) {
    console.error('Generate Marked PDF error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate marked-up PDF' });
  }
}

export async function downloadReport(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) {
      return res.status(404).json({ error: 'Report record not found' });
    }

    const filePath = path.resolve(report.filePath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Report file missing on server' });
    }

    if (report.type === 'EXCEL') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } else if (report.type === 'MARKED_PDF') {
      res.setHeader('Content-Type', 'application/pdf');
    }

    return res.sendFile(filePath);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to download report' });
  }
}

export async function getSessionReports(req: AuthRequest, res: Response) {
  try {
    const { sessionId } = req.params;
    const reports = await prisma.report.findMany({
      where: { inspectionSessionId: sessionId },
      orderBy: { createdAt: 'desc' },
      include: { generatedBy: { select: { id: true, name: true } } }
    });
    return res.json({ reports });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch session reports' });
  }
}
