import { Router } from 'express';
import * as reclaimController from '../controllers/reclaim.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/verify', authenticate, reclaimController.verifyProof);
router.get('/credentials', authenticate, reclaimController.getUserCredentials);
router.get('/credentials/:userId', authenticate, reclaimController.getUserCredentials);
router.get('/status', authenticate, reclaimController.getVerificationStatus);
router.get('/status/:userId', authenticate, reclaimController.getVerificationStatus);

export default router;
