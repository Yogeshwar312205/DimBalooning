import { Router } from 'express';
import { createBalloon, updateBalloon, deleteBalloon, autoExtractBalloons } from '../controllers/balloonController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.post('/auto-extract/:sessionId', autoExtractBalloons);
router.post('/', createBalloon);
router.put('/:id', updateBalloon);
router.delete('/:id', deleteBalloon);

export default router;

