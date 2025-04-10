import express from 'express';
import { authenticateJWT } from '../../middleware/auth';
import * as enhancedEscrowController from '../controllers/enhanced-escrow.controller';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateJWT);

// Multi-sig escrow endpoints
router.post('/multi-sig', enhancedEscrowController.createMultiSigEscrow);
router.post('/:id/sign', enhancedEscrowController.signMultiSigEscrow);

// Time-locked escrow endpoints
router.post('/time-locked', enhancedEscrowController.createTimeLockedEscrow);
router.post('/process-time-locked', enhancedEscrowController.processTimeLockedEscrows);

// Dispute resolution endpoints
router.post('/:id/dispute-resolution', enhancedEscrowController.setDisputeResolutionMode);
router.post('/process-auto-resolutions', enhancedEscrowController.processAutoDisputeResolution);

export default router;
