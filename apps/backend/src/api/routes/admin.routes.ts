import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import authenticate from '../middleware/auth.middleware';

const router = Router();

// All admin routes require authentication
// In a production environment, you would add additional middleware to check admin permissions
router.use(authenticate);

// Broadcast a notification to all users
router.post('/broadcast-notification', adminController.broadcastNotification);

// Get system statistics
router.get('/stats', adminController.getSystemStats);

export default router;
