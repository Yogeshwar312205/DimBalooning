import { Router } from 'express';
import { createBalloon, autoDetectBalloons, updateBalloon, deleteBalloon } from '../controllers/balloonController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.post('/', createBalloon);
router.post('/auto-detect', autoDetectBalloons);
router.put('/:id', updateBalloon);
router.delete('/:id', deleteBalloon);

export default router;
