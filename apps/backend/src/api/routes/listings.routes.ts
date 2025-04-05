import { Router } from 'express';
import * as listingsController from '../controllers/listings.controller';
import authenticate from '../middleware/auth';

const router = Router();

router.get('/', listingsController.getListings);
router.get('/:id', listingsController.getListingById);

router.use(authenticate);

router.post('/', listingsController.createListing);
router.patch('/:id', listingsController.updateListing);
router.delete('/:id', listingsController.deleteListing);
router.patch('/:id/sold', listingsController.markListingAsSold);

export default router;
