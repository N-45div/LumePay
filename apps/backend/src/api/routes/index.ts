import { Router } from 'express';
import usersRoutes from './users.routes';
import listingsRoutes from './listings.routes';
import escrowsRoutes from './escrows.routes';
import notificationsRoutes from './notifications.routes';
import adminRoutes from './admin.routes';
import disputesRoutes from './disputes.routes';

const router = Router();

router.use('/users', usersRoutes);
router.use('/listings', listingsRoutes);
router.use('/escrows', escrowsRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/disputes', disputesRoutes);
router.use('/admin', adminRoutes);

export default router;
