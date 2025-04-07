import { Router } from 'express';
import * as notificationsController from '../controllers/notifications.controller';
import authenticate from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', notificationsController.getNotifications);

router.get('/count', notificationsController.getNotificationCount);


router.patch('/:id/read', notificationsController.markAsRead);

router.patch('/read-all', notificationsController.markAllAsRead);

export default router;
