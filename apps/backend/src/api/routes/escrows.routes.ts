import { Router } from 'express';
import * as escrowsController from '../controllers/escrows.controller';
import authenticate from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/', escrowsController.createEscrow);
router.get('/', escrowsController.getUserEscrows);
router.get('/:id', escrowsController.getEscrowById);
router.post('/:id/fund', escrowsController.fundEscrow);
router.post('/:id/release', escrowsController.releaseEscrow);
router.post('/:id/refund', escrowsController.refundEscrow);

export default router;
