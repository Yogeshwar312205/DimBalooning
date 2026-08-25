import { Router } from 'express';
import { generateExcel, generateMarkedPdf, downloadReport, getSessionReports } from '../controllers/reportController';

const router = Router();

// Frictionless Prototyping - No token barrier
router.post('/excel', generateExcel);
router.post('/pdf', generateMarkedPdf);
router.get('/session/:sessionId', getSessionReports);
router.get('/download/:id', downloadReport);

export default router;