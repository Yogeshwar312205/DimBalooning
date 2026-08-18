import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import { fetchPdfInfo } from '../services/pdfServiceConnector';

const prisma = new PrismaClient();

export async function uploadDrawing(req: AuthRequest, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const { name, revision } = req.body;
    const drawingName = name || req.file.originalname.replace(/\.[^/.]+$/, '');
    const absolutePath = path.resolve(req.file.path);

    // Call PDF service to get page count & info
    const pdfInfo = await fetchPdfInfo(absolutePath);
    const pageCount = pdfInfo.pageCount || 1;

    const drawing = await prisma.drawing.create({
      data: {
        name: drawingName,
        filePath: req.file.path,
        revision: revision || 'Rev A',
        pageCount,
        uploadedById: req.user!.id
      },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } }
      }
    });

    return res.status(201).json({
      message: 'Engineering drawing uploaded successfully',
      drawing
    });
  } catch (error: any) {
    console.error('Upload drawing error:', error);
    return res.status(500).json({ error: 'Failed to upload drawing' });
  }
}

export async function getDrawings(req: AuthRequest, res: Response) {
  try {
    const drawings = await prisma.drawing.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
        _count: { select: { inspectionSessions: true } }
      }
    });
    return res.json({ drawings });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch drawings' });
  }
}

export async function getDrawingById(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const drawing = await prisma.drawing.findUnique({
      where: { id },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
        inspectionSessions: true
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

export async function getDrawingFile(req: AuthRequest, res: Response) {
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
