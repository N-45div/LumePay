import { Router } from 'express';
import * as notificationsController from '../controllers/notifications.controller';
import authenticate from '../middleware/auth.middleware';

const router = Router();

// All notification routes require authentication
router.use(authenticate);

// Get all notifications for the authenticated user
router.get('/', notificationsController.getNotifications);

// Get count of unread notifications for the authenticated user
router.get('/count', notificationsController.getNotificationCount);

// Mark a notification as read
router.patch('/:id/read', notificationsController.markAsRead);

// Mark all notifications as read
router.patch('/read-all', notificationsController.markAllAsRead);

export default router;
