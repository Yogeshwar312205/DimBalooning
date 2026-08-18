import { Router } from 'express';
import { generateExcel, generateMarkedPdf, downloadReport, getSessionReports } from '../controllers/reportController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.post('/excel', generateExcel);
router.post('/pdf', generateMarkedPdf);
router.get('/session/:sessionId', getSessionReports);
router.get('/download/:id', downloadReport);

export default router;
