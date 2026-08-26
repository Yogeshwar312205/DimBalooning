import { Router } from 'express';
import { updateMeasurement, saveMeasurement } from '../controllers/measurementController';

const router = Router();

// Frictionless Prototyping - No token barrier
router.post('/', saveMeasurement);
router.put('/:id', updateMeasurement);

export default router;