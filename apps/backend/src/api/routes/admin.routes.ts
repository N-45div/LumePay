import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import authenticate from '../middleware/auth';
import { isAdmin } from '../middleware/admin.middleware';

const router = Router();

// Apply authentication middleware to all admin routes
router.use(authenticate);
// Apply admin check middleware to all admin routes
router.use(isAdmin);

// Dashboard endpoints
router.get('/stats', adminController.getSystemStats);
router.get('/disputes/pending', adminController.getPendingDisputes);
router.get('/transactions/recent', adminController.getRecentTransactions);
router.get('/listings/flagged', adminController.getFlaggedListings);

// Moderation endpoints
router.post('/broadcast-notification', adminController.broadcastNotification);
router.patch('/listings/:id/suspend', adminController.suspendListing);
router.patch('/users/:id/suspend', adminController.suspendUser);

export default router;
