import { Router } from 'express';
import * as usersController from '../controllers/users.controller';
import authenticate from '../middleware/auth';

const router = Router();

router.post('/authenticate', usersController.authenticate);

router.use(authenticate);

router.get('/profile', usersController.getProfile);
router.patch('/profile', usersController.updateProfile);

export default router;
