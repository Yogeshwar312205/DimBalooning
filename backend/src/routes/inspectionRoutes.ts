import { Router } from 'express';
import {
  createInspectionSession,
  getInspectionSessions,
  getInspectionSessionById,
  updateInspectionStatus,
  getDashboardStats
} from '../controllers/inspectionController';

const router = Router();

// Frictionless Prototyping - No token barrier
router.post('/', createInspectionSession);
router.get('/', getInspectionSessions);
router.get('/stats/dashboard', getDashboardStats);
router.get('/:id', getInspectionSessionById);
router.put('/:id/status', updateInspectionStatus);

export default router;