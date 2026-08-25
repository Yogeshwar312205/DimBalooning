import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { uploadDrawing, extractDrawing, getDrawings, getDrawingById, getDrawingFile } from '../controllers/drawingController';
import { config } from '../config';

const uploadDir = path.resolve(config.uploadDir);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF engineering drawings are allowed'));
    }
  }
});

const router = Router();

// Routes (Frictionless / No Auth Barrier)
router.post('/', upload.single('pdf'), uploadDrawing);
router.post('/:id/extract', extractDrawing);
router.get('/', getDrawings);
router.get('/:id', getDrawingById);
router.get('/:id/file', getDrawingFile);

export default router;