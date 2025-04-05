import { Router } from 'express';
import usersRoutes from './users.routes';
import listingsRoutes from './listings.routes';
import escrowsRoutes from './escrows.routes';

const router = Router();

router.use('/users', usersRoutes);
router.use('/listings', listingsRoutes);
router.use('/escrows', escrowsRoutes);

export default router;
