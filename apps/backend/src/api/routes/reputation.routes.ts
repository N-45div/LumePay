import express from 'express';
import * as reputationController from '../controllers/reputation.controller';
import { authenticateJWT } from '../../middleware/auth';

const router = express.Router();

router.get('/users/:userId', authenticateJWT, reputationController.getReputationInfo);
router.post('/reviews', authenticateJWT, reputationController.submitReview);
router.post('/verify', authenticateJWT, reputationController.verifyUserReputation);
router.post('/users/:userId/publish', authenticateJWT, reputationController.publishReputationOnChain);
router.get('/users/:userId/records', authenticateJWT, reputationController.getReputationRecords);

export default router;
