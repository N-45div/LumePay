import express from 'express';
import * as disputesController from '../controllers/disputes.controller';
import authenticate from '../middleware/auth';
import { isAdmin } from '../middleware/admin.middleware';

const router = express.Router();

router.use(authenticate);

// User routes
router.post('/', disputesController.createDispute);
router.get('/user', disputesController.getUserDisputes);
router.get('/:id', disputesController.getDispute);

// Admin routes
router.get('/', isAdmin, disputesController.getAllDisputes);
router.patch('/:id/resolve', isAdmin, disputesController.resolveDispute);
router.patch('/:id/status', isAdmin, disputesController.updateDisputeStatus);

export default router;
