import { Request, Response } from 'express';
import * as listingsController from '../../../src/api/controllers/listings.controller';
import * as listingsService from '../../../src/services/listings.service';
import { BadRequestError, UnauthorizedError, ForbiddenError, NotFoundError } from '../../../src/utils/errors';
import { ListingStatus } from '../../../src/types';

// Mock dependencies
jest.mock('../../../src/services/listings.service');

describe('Listings Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock;
  
  beforeEach(() => {
    mockRequest = {
      body: {},
      params: {},
      query: {},
      user: {
        userId: 'user-123',
        walletAddress: 'wallet-123'
      }
    };
    
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn()
    };
    
    mockNext = jest.fn();
    
    jest.clearAllMocks();
  });
  
  describe('createListing', () => {
    it('should create a listing successfully', async () => {
      // Setup
      mockRequest.body = {
        title: 'Test Listing',
        description: 'This is a test listing',
        price: '100',
        currency: 'USDC',
        category: 'electronics',
        images: ['image1.jpg', 'image2.jpg']
      };
      
      const mockListing = {
        id: 'listing-123',
        title: 'Test Listing',
        description: 'This is a test listing',
        price: 100,
        currency: 'USDC',
        category: 'electronics',
        sellerId: 'user-123',
        status: 'active',
        images: ['image1.jpg', 'image2.jpg'],
        createdAt: new Date()
      };
      
      (listingsService.createListing as jest.Mock).mockResolvedValue(mockListing);
      
      // Execute
      await listingsController.createListing(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(listingsService.createListing).toHaveBeenCalledWith('user-123', {
        title: 'Test Listing',
        description: 'This is a test listing',
        price: 100,
        currency: 'USDC',
        category: 'electronics',
        images: ['image1.jpg', 'image2.jpg']
      });
      
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { listing: mockListing }
      });
    });
    
    it('should handle missing required fields', async () => {
      // Setup
      mockRequest.body = {
        // Missing title and price
        description: 'This is a test listing',
        currency: 'USDC',
        category: 'electronics'
      };
      
      // Execute
      await listingsController.createListing(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(BadRequestError));
      expect(listingsService.createListing).not.toHaveBeenCalled();
    });
    
    it('should handle unauthenticated user', async () => {
      // Setup
      mockRequest.user = undefined;
      mockRequest.body = {
        title: 'Test Listing',
        description: 'This is a test listing',
        price: '100',
        currency: 'USDC',
        category: 'electronics'
      };
      
      // Execute
      await listingsController.createListing(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(listingsService.createListing).not.toHaveBeenCalled();
    });
    
    it('should handle service errors', async () => {
      // Setup
      mockRequest.body = {
        title: 'Test Listing',
        description: 'This is a test listing',
        price: '100',
        currency: 'USDC',
        category: 'electronics'
      };
      
      const mockError = new Error('Service error');
      (listingsService.createListing as jest.Mock).mockRejectedValue(mockError);
      
      // Execute
      await listingsController.createListing(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(mockError);
    });
  });
  
  describe('getListings', () => {
    it('should get all listings successfully', async () => {
      // Setup
      const mockListings = [
        {
          id: 'listing-123',
          title: 'Test Listing 1',
          price: 100,
          currency: 'USDC',
          sellerId: 'user-123',
          status: 'active'
        },
        {
          id: 'listing-456',
          title: 'Test Listing 2',
          price: 200,
          currency: 'USDC',
          sellerId: 'user-456',
          status: 'active'
        }
      ];
      
      const mockResult = {
        listings: mockListings,
        total: 2
      };
      
      (listingsService.getListings as jest.Mock).mockResolvedValue(mockResult);
      
      // Execute
      await listingsController.getListings(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(listingsService.getListings).toHaveBeenCalledWith({
        limit: undefined,
        offset: undefined,
        status: undefined,
        sellerId: undefined,
        category: undefined
      });
      
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          listings: mockListings,
          total: 2,
          limit: 20,
          offset: 0
        }
      });
    });
    
    it('should apply filters when provided', async () => {
      // Setup
      mockRequest.query = {
        category: 'electronics',
        status: ListingStatus.ACTIVE,
        limit: '10',
        offset: '20'
      };
      
      const mockListings = [
        {
          id: 'listing-123',
          title: 'Test Listing 1',
          price: 100,
          currency: 'USDC',
          category: 'electronics',
          sellerId: 'user-123',
          status: 'active'
        }
      ];
      
      const mockResult = {
        listings: mockListings,
        total: 1
      };
      
      (listingsService.getListings as jest.Mock).mockResolvedValue(mockResult);
      
      // Execute
      await listingsController.getListings(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(listingsService.getListings).toHaveBeenCalledWith({
        category: 'electronics',
        status: ListingStatus.ACTIVE,
        limit: 10,
        offset: 20,
        sellerId: undefined
      });
      
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          listings: mockListings,
          total: 1,
          limit: 10,
          offset: 20
        }
      });
    });
    
    it('should handle service errors', async () => {
      // Setup
      const mockError = new Error('Service error');
      (listingsService.getListings as jest.Mock).mockRejectedValue(mockError);
      
      // Execute
      await listingsController.getListings(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(mockError);
    });
  });
  
  describe('getListingById', () => {
    it('should get a listing by ID successfully', async () => {
      // Setup
      mockRequest.params = {
        id: 'listing-123'
      };
      
      const mockListing = {
        id: 'listing-123',
        title: 'Test Listing',
        description: 'This is a test listing',
        price: 100,
        currency: 'USDC',
        category: 'electronics',
        sellerId: 'user-123',
        status: 'active',
        createdAt: new Date()
      };
      
      (listingsService.getListingById as jest.Mock).mockResolvedValue(mockListing);
      
      // Execute
      await listingsController.getListingById(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(listingsService.getListingById).toHaveBeenCalledWith('listing-123');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { listing: mockListing }
      });
    });
    
    it('should handle service errors', async () => {
      // Setup
      mockRequest.params = {
        id: 'listing-123'
      };
      
      const mockError = new Error('Service error');
      (listingsService.getListingById as jest.Mock).mockRejectedValue(mockError);
      
      // Execute
      await listingsController.getListingById(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(mockError);
    });
  });
  
  describe('updateListing', () => {
    it('should update a listing successfully', async () => {
      // Setup
      mockRequest.params = {
        id: 'listing-123'
      };
      
      mockRequest.body = {
        title: 'Updated Title',
        price: '150'
      };
      
      const mockListing = {
        id: 'listing-123',
        title: 'Updated Title',
        description: 'This is a test listing',
        price: 150,
        currency: 'USDC',
        category: 'electronics',
        sellerId: 'user-123',
        status: 'active',
        updatedAt: new Date()
      };
      
      (listingsService.updateListing as jest.Mock).mockResolvedValue(mockListing);
      
      // Execute
      await listingsController.updateListing(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(listingsService.updateListing).toHaveBeenCalledWith(
        'listing-123',
        'user-123',
        {
          title: 'Updated Title',
          price: 150,
          description: undefined,
          currency: undefined,
          category: undefined,
          images: undefined
        }
      );
      
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { listing: mockListing }
      });
    });
    
    it('should handle unauthenticated user', async () => {
      // Setup
      mockRequest.user = undefined;
      mockRequest.params = {
        id: 'listing-123'
      };
      
      mockRequest.body = {
        title: 'Updated Title'
      };
      
      // Execute
      await listingsController.updateListing(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(listingsService.updateListing).not.toHaveBeenCalled();
    });
    
    it('should handle service errors', async () => {
      // Setup
      mockRequest.params = {
        id: 'listing-123'
      };
      
      mockRequest.body = {
        title: 'Updated Title'
      };
      
      const mockError = new ForbiddenError('Not the owner of the listing');
      (listingsService.updateListing as jest.Mock).mockRejectedValue(mockError);
      
      // Execute
      await listingsController.updateListing(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(mockError);
    });
  });
  
  describe('deleteListing', () => {
    it('should delete a listing successfully', async () => {
      // Setup
      mockRequest.params = {
        id: 'listing-123'
      };
      
      (listingsService.deleteListing as jest.Mock).mockResolvedValue(true);
      
      // Execute
      await listingsController.deleteListing(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(listingsService.deleteListing).toHaveBeenCalledWith('listing-123', 'user-123');
      expect(mockResponse.status).toHaveBeenCalledWith(204);
      expect(mockResponse.send).toHaveBeenCalled();
    });
    
    it('should handle unauthenticated user', async () => {
      // Setup
      mockRequest.user = undefined;
      mockRequest.params = {
        id: 'listing-123'
      };
      
      // Execute
      await listingsController.deleteListing(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(listingsService.deleteListing).not.toHaveBeenCalled();
    });
    
    it('should handle service errors', async () => {
      // Setup
      mockRequest.params = {
        id: 'listing-123'
      };
      
      const mockError = new ForbiddenError('Not the owner of the listing');
      (listingsService.deleteListing as jest.Mock).mockRejectedValue(mockError);
      
      // Execute
      await listingsController.deleteListing(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(mockError);
    });
  });

  describe('markListingAsSold', () => {
    it('should mark a listing as sold successfully', async () => {
      // Setup
      mockRequest.params = {
        id: 'listing-123'
      };
      
      const mockListing = {
        id: 'listing-123',
        title: 'Test Listing',
        description: 'This is a test listing',
        price: 100,
        currency: 'USDC',
        category: 'electronics',
        sellerId: 'user-123',
        status: 'sold',
        updatedAt: new Date()
      };
      
      (listingsService.markListingAsSold as jest.Mock).mockResolvedValue(mockListing);
      
      // Execute
      await listingsController.markListingAsSold(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(listingsService.markListingAsSold).toHaveBeenCalledWith('listing-123', 'user-123');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { listing: mockListing }
      });
    });
    
    it('should handle unauthenticated user', async () => {
      // Setup
      mockRequest.user = undefined;
      mockRequest.params = {
        id: 'listing-123'
      };
      
      // Execute
      await listingsController.markListingAsSold(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(listingsService.markListingAsSold).not.toHaveBeenCalled();
    });
    
    it('should handle service errors', async () => {
      // Setup
      mockRequest.params = {
        id: 'listing-123'
      };
      
      const mockError = new ForbiddenError('Not the owner of the listing');
      (listingsService.markListingAsSold as jest.Mock).mockRejectedValue(mockError);
      
      // Execute
      await listingsController.markListingAsSold(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(mockError);
    });
  });
});
