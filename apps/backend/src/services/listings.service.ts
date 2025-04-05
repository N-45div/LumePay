import * as listingsRepository from '../db/listings.repository';
import * as usersRepository from '../db/users.repository';
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors';
import { Listing, ListingStatus } from '../types';

export const createListing = async (
  sellerId: string,
  listingData: Omit<Listing, 'id' | 'sellerId' | 'status' | 'createdAt' | 'updatedAt'>
): Promise<Listing> => {
  const seller = await usersRepository.findById(sellerId);
  
  if (!seller) {
    throw new NotFoundError('Seller not found');
  }
  
  if (listingData.price <= 0) {
    throw new BadRequestError('Price must be greater than 0');
  }
  
  return await listingsRepository.create({
    ...listingData,
    sellerId,
    status: ListingStatus.ACTIVE
  });
};

export const getListingById = async (id: string): Promise<Listing> => {
  const listing = await listingsRepository.findById(id);
  
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }
  
  return listing;
};

export const getListings = async (
  options: {
    limit?: number;
    offset?: number;
    status?: ListingStatus;
    sellerId?: string;
    category?: string;
  } = {}
): Promise<{ listings: Listing[]; total: number }> => {
  return await listingsRepository.findAll(options);
};

export const updateListing = async (
  id: string,
  sellerId: string,
  data: Partial<Omit<Listing, 'id' | 'sellerId' | 'createdAt' | 'updatedAt'>>
): Promise<Listing> => {
  const listing = await listingsRepository.findById(id);
  
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }
  
  if (listing.sellerId !== sellerId) {
    throw new ForbiddenError('You do not have permission to update this listing');
  }
  
  if (listing.status === ListingStatus.SOLD) {
    throw new BadRequestError('Cannot update a sold listing');
  }
  
  if (data.price !== undefined && data.price <= 0) {
    throw new BadRequestError('Price must be greater than 0');
  }
  
  const updatedListing = await listingsRepository.update(id, data);
  
  if (!updatedListing) {
    throw new NotFoundError('Listing not found');
  }
  
  return updatedListing;
};

export const deleteListing = async (id: string, sellerId: string): Promise<void> => {
  const listing = await listingsRepository.findById(id);
  
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }
  
  if (listing.sellerId !== sellerId) {
    throw new ForbiddenError('You do not have permission to delete this listing');
  }
  
  if (listing.status === ListingStatus.SOLD) {
    throw new BadRequestError('Cannot delete a sold listing');
  }
  
  const deleted = await listingsRepository.deleteById(id);
  
  if (!deleted) {
    throw new NotFoundError('Listing not found');
  }
};

export const markListingAsSold = async (id: string, sellerId: string): Promise<Listing> => {
  const listing = await listingsRepository.findById(id);
  
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }
  
  if (listing.sellerId !== sellerId) {
    throw new ForbiddenError('You do not have permission to update this listing');
  }
  
  if (listing.status === ListingStatus.SOLD) {
    throw new BadRequestError('Listing is already marked as sold');
  }
  
  const updatedListing = await listingsRepository.update(id, { status: ListingStatus.SOLD });
  
  if (!updatedListing) {
    throw new NotFoundError('Listing not found');
  }
  
  return updatedListing;
};
