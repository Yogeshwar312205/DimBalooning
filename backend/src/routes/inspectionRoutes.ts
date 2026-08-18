import { Router } from 'express';
import {
  createInspectionSession,
  getInspectionSessions,
  getInspectionSessionById,
  updateInspectionStatus,
  getDashboardStats
} from '../controllers/inspectionController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.post('/', createInspectionSession);
router.get('/', getInspectionSessions);
router.get('/stats/dashboard', getDashboardStats);
router.get('/:id', getInspectionSessionById);
router.put('/:id/status', updateInspectionStatus);

export default router;
