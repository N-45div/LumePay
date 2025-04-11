import { Router } from 'express';
import * as perenaController from '../controllers/perena.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/apy', perenaController.getCurrentAPY);
router.get('/yield', authenticate, perenaController.getYieldData);
router.post('/swap', authenticate, perenaController.swapTokens);
router.post('/distribute', authenticate, perenaController.distributeYield);

export default router;
