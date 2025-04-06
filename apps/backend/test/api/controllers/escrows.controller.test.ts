import { Request, Response } from 'express';
import * as escrowsController from '../../../src/api/controllers/escrows.controller';
import * as escrowsService from '../../../src/services/escrows.service';
import { BadRequestError, UnauthorizedError, ForbiddenError, NotFoundError } from '../../../src/utils/errors';
import { EscrowStatus } from '../../../src/types';

// Mock dependencies
jest.mock('../../../src/services/escrows.service');

describe('Escrows Controller', () => {
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
  
  describe('createEscrow', () => {
    it('should create an escrow successfully', async () => {
      // Setup
      mockRequest.body = {
        listingId: 'listing-123'
      };
      
      const mockEscrow = {
        id: 'escrow-123',
        listingId: 'listing-123',
        buyerId: 'user-123',
        sellerId: 'user-456',
        amount: 100,
        currency: 'USDC',
        status: 'created',
        createdAt: new Date()
      };
      
      (escrowsService.createEscrow as jest.Mock).mockResolvedValue(mockEscrow);
      
      // Execute
      await escrowsController.createEscrow(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(escrowsService.createEscrow).toHaveBeenCalledWith('user-123', 'listing-123');
      
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { escrow: mockEscrow }
      });
    });
    
    it('should handle missing required fields', async () => {
      // Setup
      mockRequest.body = {
        // Missing listingId
      };
      
      // Execute
      await escrowsController.createEscrow(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(BadRequestError));
      expect(escrowsService.createEscrow).not.toHaveBeenCalled();
    });
    
    it('should handle unauthenticated user', async () => {
      // Setup
      mockRequest.user = undefined;
      mockRequest.body = {
        listingId: 'listing-123'
      };
      
      // Execute
      await escrowsController.createEscrow(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(escrowsService.createEscrow).not.toHaveBeenCalled();
    });
    
    it('should handle service errors', async () => {
      // Setup
      mockRequest.body = {
        listingId: 'listing-123'
      };
      
      const mockError = new Error('Service error');
      (escrowsService.createEscrow as jest.Mock).mockRejectedValue(mockError);
      
      // Execute
      await escrowsController.createEscrow(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(mockError);
    });
  });
  
  describe('getUserEscrows', () => {
    it('should get all escrows for a user successfully', async () => {
      // Setup
      mockRequest.query = {
        role: 'buyer',
        status: EscrowStatus.CREATED
      };
      
      const mockEscrows = [
        {
          id: 'escrow-123',
          listingId: 'listing-123',
          buyerId: 'user-123',
          sellerId: 'user-456',
          amount: 100,
          currency: 'USDC',
          status: 'created'
        },
        {
          id: 'escrow-456',
          listingId: 'listing-456',
          buyerId: 'user-123',
          sellerId: 'user-789',
          amount: 200,
          currency: 'USDC',
          status: 'created'
        }
      ];
      
      const mockResult = {
        escrows: mockEscrows,
        total: 2
      };
      
      (escrowsService.getUserEscrows as jest.Mock).mockResolvedValue(mockResult);
      
      // Execute
      await escrowsController.getUserEscrows(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(escrowsService.getUserEscrows).toHaveBeenCalledWith('user-123', {
        role: 'buyer',
        status: EscrowStatus.CREATED,
        limit: undefined,
        offset: undefined
      });
      
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          escrows: mockEscrows,
          total: 2,
          limit: 20,
          offset: 0
        }
      });
    });
    
    it('should handle unauthenticated user', async () => {
      // Setup
      mockRequest.user = undefined;
      
      // Execute
      await escrowsController.getUserEscrows(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(escrowsService.getUserEscrows).not.toHaveBeenCalled();
    });
    
    it('should handle service errors', async () => {
      // Setup
      const mockError = new Error('Service error');
      (escrowsService.getUserEscrows as jest.Mock).mockRejectedValue(mockError);
      
      // Execute
      await escrowsController.getUserEscrows(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(mockError);
    });
  });
  
  describe('getEscrowById', () => {
    it('should get an escrow by ID successfully', async () => {
      // Setup
      mockRequest.params = {
        id: 'escrow-123'
      };
      
      const mockEscrow = {
        id: 'escrow-123',
        listingId: 'listing-123',
        buyerId: 'user-123',
        sellerId: 'user-456',
        amount: 100,
        currency: 'USDC',
        status: 'created',
        createdAt: new Date()
      };
      
      (escrowsService.getEscrowById as jest.Mock).mockResolvedValue(mockEscrow);
      
      // Execute
      await escrowsController.getEscrowById(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(escrowsService.getEscrowById).toHaveBeenCalledWith('escrow-123', 'user-123');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { escrow: mockEscrow }
      });
    });
    
    it('should handle service errors', async () => {
      // Setup
      mockRequest.params = {
        id: 'escrow-123'
      };
      
      const mockError = new Error('Service error');
      (escrowsService.getEscrowById as jest.Mock).mockRejectedValue(mockError);
      
      // Execute
      await escrowsController.getEscrowById(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(mockError);
    });
  });
  
  describe('fundEscrow', () => {
    it('should fund an escrow successfully', async () => {
      // Setup
      mockRequest.params = {
        id: 'escrow-123'
      };
      
      mockRequest.body = {
        privateKey: 'private-key-123'
      };
      
      const mockEscrow = {
        id: 'escrow-123',
        listingId: 'listing-123',
        buyerId: 'user-123',
        sellerId: 'user-456',
        amount: 100,
        currency: 'USDC',
        status: 'funded',
        transactionId: 'tx-123',
        updatedAt: new Date()
      };
      
      (escrowsService.fundEscrow as jest.Mock).mockResolvedValue(mockEscrow);
      
      // Execute
      await escrowsController.fundEscrow(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(escrowsService.fundEscrow).toHaveBeenCalledWith('escrow-123', 'user-123', 'private-key-123');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { escrow: mockEscrow }
      });
    });
    
    it('should handle missing private key', async () => {
      // Setup
      mockRequest.params = {
        id: 'escrow-123'
      };
      
      mockRequest.body = {
        // Missing privateKey
      };
      
      // Execute
      await escrowsController.fundEscrow(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(BadRequestError));
      expect(escrowsService.fundEscrow).not.toHaveBeenCalled();
    });
    
    it('should handle unauthenticated user', async () => {
      // Setup
      mockRequest.user = undefined;
      mockRequest.params = {
        id: 'escrow-123'
      };
      mockRequest.body = {
        privateKey: 'private-key-123'
      };
      
      // Execute
      await escrowsController.fundEscrow(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(escrowsService.fundEscrow).not.toHaveBeenCalled();
    });
    
    it('should handle service errors', async () => {
      // Setup
      mockRequest.params = {
        id: 'escrow-123'
      };
      mockRequest.body = {
        privateKey: 'private-key-123'
      };
      
      const mockError = new ForbiddenError('Not authorized to fund this escrow');
      (escrowsService.fundEscrow as jest.Mock).mockRejectedValue(mockError);
      
      // Execute
      await escrowsController.fundEscrow(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(mockError);
    });
  });
  
  describe('releaseEscrow', () => {
    it('should release an escrow successfully', async () => {
      // Setup
      mockRequest.params = {
        id: 'escrow-123'
      };
      
      const mockEscrow = {
        id: 'escrow-123',
        listingId: 'listing-123',
        buyerId: 'user-456',
        sellerId: 'user-123',
        amount: 100,
        currency: 'USDC',
        status: 'released',
        updatedAt: new Date()
      };
      
      (escrowsService.releaseEscrow as jest.Mock).mockResolvedValue(mockEscrow);
      
      // Execute
      await escrowsController.releaseEscrow(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(escrowsService.releaseEscrow).toHaveBeenCalledWith('escrow-123', 'user-123');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { escrow: mockEscrow }
      });
    });
    
    it('should handle unauthenticated user', async () => {
      // Setup
      mockRequest.user = undefined;
      mockRequest.params = {
        id: 'escrow-123'
      };
      
      // Execute
      await escrowsController.releaseEscrow(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(escrowsService.releaseEscrow).not.toHaveBeenCalled();
    });
    
    it('should handle service errors', async () => {
      // Setup
      mockRequest.params = {
        id: 'escrow-123'
      };
      
      const mockError = new ForbiddenError('Not authorized to release this escrow');
      (escrowsService.releaseEscrow as jest.Mock).mockRejectedValue(mockError);
      
      // Execute
      await escrowsController.releaseEscrow(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(mockError);
    });
  });
  
  describe('refundEscrow', () => {
    it('should refund an escrow successfully', async () => {
      // Setup
      mockRequest.params = {
        id: 'escrow-123'
      };
      
      const mockEscrow = {
        id: 'escrow-123',
        listingId: 'listing-123',
        buyerId: 'user-456',
        sellerId: 'user-123',
        amount: 100,
        currency: 'USDC',
        status: 'refunded',
        updatedAt: new Date()
      };
      
      (escrowsService.refundEscrow as jest.Mock).mockResolvedValue(mockEscrow);
      
      // Execute
      await escrowsController.refundEscrow(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(escrowsService.refundEscrow).toHaveBeenCalledWith('escrow-123', 'user-123');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { escrow: mockEscrow }
      });
    });
    
    it('should handle unauthenticated user', async () => {
      // Setup
      mockRequest.user = undefined;
      mockRequest.params = {
        id: 'escrow-123'
      };
      
      // Execute
      await escrowsController.refundEscrow(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(escrowsService.refundEscrow).not.toHaveBeenCalled();
    });
    
    it('should handle service errors', async () => {
      // Setup
      mockRequest.params = {
        id: 'escrow-123'
      };
      
      const mockError = new ForbiddenError('Not authorized to refund this escrow');
      (escrowsService.refundEscrow as jest.Mock).mockRejectedValue(mockError);
      
      // Execute
      await escrowsController.refundEscrow(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(mockError);
    });
  });
});
