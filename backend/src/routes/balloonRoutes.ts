import { Router } from 'express';
import { createBalloon, updateBalloon, deleteBalloon, autoExtractBalloons } from '../controllers/balloonController';

const router = Router();

// Frictionless Prototyping - No token barrier
router.post('/auto-extract/:sessionId', autoExtractBalloons);
router.post('/', createBalloon);
router.put('/:id', updateBalloon);
router.delete('/:id', deleteBalloon);

export default router;