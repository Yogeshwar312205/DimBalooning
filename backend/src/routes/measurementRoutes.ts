import { Router } from 'express';
import { updateMeasurement, saveMeasurement } from '../controllers/measurementController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.post('/', saveMeasurement);
router.put('/:id', updateMeasurement);

export default router;
