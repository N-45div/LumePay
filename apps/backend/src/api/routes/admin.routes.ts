import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import authenticate from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.post('/broadcast-notification', adminController.broadcastNotification);

router.get('/stats', adminController.getSystemStats);

export default router;
