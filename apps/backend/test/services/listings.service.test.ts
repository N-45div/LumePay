import * as listingsService from '../../src/services/listings.service';
import * as listingsRepository from '../../src/db/listings.repository';
import * as usersRepository from '../../src/db/users.repository';
import * as notificationsService from '../../src/services/notifications.service';
import { ForbiddenError, BadRequestError, NotFoundError } from '../../src/utils/errors';
import { ListingStatus } from '../../src/types';

// Mock dependencies
jest.mock('../../src/db/listings.repository');
jest.mock('../../src/db/users.repository');
jest.mock('../../src/services/notifications.service');

describe('Listings Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    const mockUser = {
      id: 'user-123',
      username: 'testuser',
      walletAddress: 'wallet123',
      profileImage: null,
      reputationScore: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    (usersRepository.findById as jest.Mock).mockResolvedValue(mockUser);
    (notificationsService.createListingNotification as jest.Mock).mockResolvedValue(undefined);
  });
  
  describe('createListing', () => {
    it('should create a listing successfully', async () => {
      // Setup
      const listingData = {
        title: 'Test Listing',
        description: 'This is a test listing',
        price: 100,
        currency: 'USDC',
        category: 'electronics'
      };
      
      const userId = 'user-123';
      
      const createdListing = {
        id: 'listing-123',
        title: 'Test Listing',
        description: 'This is a test listing',
        price: 100,
        currency: 'USDC',
        category: 'electronics',
        sellerId: 'user-123',
        status: ListingStatus.ACTIVE,
        createdAt: new Date()
      };
      
      (listingsRepository.create as jest.Mock).mockResolvedValue(createdListing);
      
      // Execute
      const result = await listingsService.createListing(userId, listingData);
      
      // Assert
      expect(usersRepository.findById).toHaveBeenCalledWith(userId);
      expect(listingsRepository.create).toHaveBeenCalledWith({
        ...listingData,
        sellerId: userId,
        status: ListingStatus.ACTIVE
      });
      
      expect(notificationsService.createListingNotification).toHaveBeenCalledWith(
        'user-123',
        expect.stringContaining('Test Listing')
      );
      
      expect(result).toEqual(createdListing);
    });
  });
  
  describe('getListings', () => {
    it('should get all listings without filters', async () => {
      // Setup
      const mockListingsResult = {
        listings: [
          {
            id: 'listing-123',
            title: 'Test Listing 1',
            price: 100,
            currency: 'USDC',
            sellerId: 'user-123',
            status: ListingStatus.ACTIVE
          },
          {
            id: 'listing-456',
            title: 'Test Listing 2',
            price: 200,
            currency: 'USDC',
            sellerId: 'user-456',
            status: ListingStatus.ACTIVE
          }
        ],
        total: 2
      };
      
      (listingsRepository.findAll as jest.Mock).mockResolvedValue(mockListingsResult);
      
      // Execute
      const result = await listingsService.getListings({});
      
      // Assert
      expect(listingsRepository.findAll).toHaveBeenCalledWith({});
      expect(result).toEqual(mockListingsResult);
    });
    
    it('should apply filters when provided', async () => {
      // Setup
      const filters = {
        category: 'electronics',
        status: ListingStatus.ACTIVE
      };
      
      const mockListingsResult = {
        listings: [
          {
            id: 'listing-123',
            title: 'Test Listing 1',
            price: 100,
            currency: 'USDC',
            category: 'electronics',
            sellerId: 'user-123',
            status: ListingStatus.ACTIVE
          }
        ],
        total: 1
      };
      
      (listingsRepository.findAll as jest.Mock).mockResolvedValue(mockListingsResult);
      
      // Execute
      const result = await listingsService.getListings(filters);
      
      // Assert
      expect(listingsRepository.findAll).toHaveBeenCalledWith(filters);
      expect(result).toEqual(mockListingsResult);
    });
  });
  
  describe('getListingById', () => {
    it('should return a listing by ID', async () => {
      // Setup
      const listingId = 'listing-123';
      
      const mockListing = {
        id: 'listing-123',
        title: 'Test Listing',
        description: 'This is a test listing',
        price: 100,
        currency: 'USDC',
        category: 'electronics',
        sellerId: 'user-123',
        status: ListingStatus.ACTIVE,
        createdAt: new Date()
      };
      
      (listingsRepository.findById as jest.Mock).mockResolvedValue(mockListing);
      
      // Execute
      const result = await listingsService.getListingById(listingId);
      
      // Assert
      expect(listingsRepository.findById).toHaveBeenCalledWith(listingId);
      expect(result).toEqual(mockListing);
    });
    
    it('should throw NotFoundError when listing does not exist', async () => {
      // Setup
      const listingId = 'nonexistent-listing';
      
      (listingsRepository.findById as jest.Mock).mockResolvedValue(null);
      
      // Execute & Assert
      await expect(
        listingsService.getListingById(listingId)
      ).rejects.toThrow('Listing not found');
    });
  });
  
  describe('updateListing', () => {
    it('should update a listing successfully when user is owner', async () => {
      // Setup
      const listingId = 'listing-123';
      const userId = 'user-123';
      const updateData = {
        title: 'Updated Title',
        price: 150
      };
      
      const existingListing = {
        id: 'listing-123',
        title: 'Test Listing',
        description: 'This is a test listing',
        price: 100,
        currency: 'USDC',
        category: 'electronics',
        sellerId: 'user-123',
        status: ListingStatus.ACTIVE,
        createdAt: new Date()
      };
      
      const updatedListing = {
        ...existingListing,
        title: 'Updated Title',
        price: 150,
        updatedAt: new Date()
      };
      
      (listingsRepository.findById as jest.Mock).mockResolvedValue(existingListing);
      (listingsRepository.update as jest.Mock).mockResolvedValue(updatedListing);
      
      // Execute
      const result = await listingsService.updateListing(listingId, userId, updateData);
      
      // Assert
      expect(listingsRepository.findById).toHaveBeenCalledWith(listingId);
      expect(listingsRepository.update).toHaveBeenCalledWith(listingId, updateData);
      
      expect(notificationsService.createListingNotification).toHaveBeenCalledWith(
        'user-123',
        expect.stringContaining('Updated Title')
      );
      expect(result).toEqual(updatedListing);
    });
    
    it('should throw error when user is not the owner', async () => {
      // Setup
      const listingId = 'listing-123';
      const userId = 'different-user';
      const updateData = {
        title: 'Updated Title'
      };
      
      const existingListing = {
        id: 'listing-123',
        title: 'Test Listing',
        sellerId: 'user-123', // Different from userId
        status: ListingStatus.ACTIVE
      };
      
      (listingsRepository.findById as jest.Mock).mockResolvedValue(existingListing);
      
      // Execute & Assert
      await expect(
        listingsService.updateListing(listingId, userId, updateData)
      ).rejects.toThrow(ForbiddenError);
      
      expect(listingsRepository.update).not.toHaveBeenCalled();
    });
    
    it('should throw error when trying to update a sold listing', async () => {
      // Setup
      const listingId = 'listing-123';
      const userId = 'user-123';
      const updateData = {
        title: 'Updated Title'
      };
      
      const existingListing = {
        id: 'listing-123',
        title: 'Test Listing',
        sellerId: 'user-123',
        status: ListingStatus.SOLD
      };
      
      (listingsRepository.findById as jest.Mock).mockResolvedValue(existingListing);
      
      // Execute & Assert
      await expect(
        listingsService.updateListing(listingId, userId, updateData)
      ).rejects.toThrow(BadRequestError);
      
      expect(listingsRepository.update).not.toHaveBeenCalled();
    });
  });
  
  describe('deleteListing', () => {
    it('should delete a listing successfully when user is owner', async () => {
      // Setup
      const listingId = 'listing-123';
      const userId = 'user-123';
      
      const existingListing = {
        id: 'listing-123',
        title: 'Test Listing',
        sellerId: 'user-123',
        status: ListingStatus.ACTIVE
      };
      
      (listingsRepository.findById as jest.Mock).mockResolvedValue(existingListing);
      (listingsRepository.deleteById as jest.Mock).mockResolvedValue(true);
      
      // Execute
      await listingsService.deleteListing(listingId, userId);
      
      // Assert
      expect(listingsRepository.findById).toHaveBeenCalledWith(listingId);
      expect(listingsRepository.deleteById).toHaveBeenCalledWith(listingId);
      expect(notificationsService.createListingNotification).toHaveBeenCalledWith(
        'user-123',
        expect.stringContaining('Test Listing')
      );
    });
    
    it('should throw error when user is not the owner', async () => {
      // Setup
      const listingId = 'listing-123';
      const userId = 'different-user';
      
      const existingListing = {
        id: 'listing-123',
        title: 'Test Listing',
        sellerId: 'user-123', // Different from userId
        status: ListingStatus.ACTIVE
      };
      
      (listingsRepository.findById as jest.Mock).mockResolvedValue(existingListing);
      
      // Execute & Assert
      await expect(
        listingsService.deleteListing(listingId, userId)
      ).rejects.toThrow(ForbiddenError);
      
      expect(listingsRepository.deleteById).not.toHaveBeenCalled();
    });
    
    it('should throw NotFoundError when listing does not exist', async () => {
      // Setup
      const listingId = 'nonexistent-listing';
      const userId = 'user-123';
      
      (listingsRepository.findById as jest.Mock).mockResolvedValue(null);
      
      // Execute & Assert
      await expect(
        listingsService.deleteListing(listingId, userId)
      ).rejects.toThrow('Listing not found');
      
      expect(listingsRepository.deleteById).not.toHaveBeenCalled();
    });
  });
  
  describe('markListingAsSold', () => {
    it('should mark a listing as sold successfully when user is owner', async () => {
      // Setup
      const listingId = 'listing-123';
      const userId = 'user-123';
      
      const existingListing = {
        id: 'listing-123',
        title: 'Test Listing',
        sellerId: 'user-123',
        status: ListingStatus.ACTIVE
      };
      
      const updatedListing = {
        ...existingListing,
        status: ListingStatus.SOLD,
        updatedAt: new Date()
      };
      
      (listingsRepository.findById as jest.Mock).mockResolvedValue(existingListing);
      (listingsRepository.update as jest.Mock).mockResolvedValue(updatedListing);
      
      // Execute
      const result = await listingsService.markListingAsSold(listingId, userId);
      
      // Assert
      expect(listingsRepository.findById).toHaveBeenCalledWith(listingId);
      expect(listingsRepository.update).toHaveBeenCalledWith(listingId, { status: ListingStatus.SOLD });
      expect(notificationsService.createListingNotification).toHaveBeenCalledWith(
        'user-123',
        expect.stringContaining('Test Listing')
      );
      expect(result).toEqual(updatedListing);
    });
    
    it('should throw error when user is not the owner', async () => {
      // Setup
      const listingId = 'listing-123';
      const userId = 'different-user';
      
      const existingListing = {
        id: 'listing-123',
        title: 'Test Listing',
        sellerId: 'user-123', // Different from userId
        status: ListingStatus.ACTIVE
      };
      
      (listingsRepository.findById as jest.Mock).mockResolvedValue(existingListing);
      
      // Execute & Assert
      await expect(
        listingsService.markListingAsSold(listingId, userId)
      ).rejects.toThrow(ForbiddenError);
      
      expect(listingsRepository.update).not.toHaveBeenCalled();
    });
    
    it('should throw error when listing is already sold', async () => {
      // Setup
      const listingId = 'listing-123';
      const userId = 'user-123';
      
      const existingListing = {
        id: 'listing-123',
        title: 'Test Listing',
        sellerId: 'user-123',
        status: ListingStatus.SOLD // Already sold
      };
      
      (listingsRepository.findById as jest.Mock).mockResolvedValue(existingListing);
      
      // Execute & Assert
      await expect(
        listingsService.markListingAsSold(listingId, userId)
      ).rejects.toThrow(BadRequestError);
      
      expect(listingsRepository.update).not.toHaveBeenCalled();
    });
  });
});
