import { Router } from 'express';
import { getHealthLive, getHealthReady } from '../controllers/health.controler';

const router = Router();

router.get('/health/live', getHealthLive);
router.get('/health/ready', getHealthReady);

export default router;