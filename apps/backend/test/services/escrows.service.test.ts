// Move all jest.mock calls to the top first
jest.mock('../../src/db/escrows.repository');
jest.mock('../../src/db/listings.repository');
jest.mock('../../src/db/users.repository');
jest.mock('../../src/services/notifications.service');
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

// Mock the blockchain escrow service with a factory function
jest.mock('../../src/blockchain/escrow', () => {
  const mockImpl = {
    createEscrow: jest.fn(),
    fundEscrow: jest.fn(),
    releaseEscrow: jest.fn(),
    refundEscrow: jest.fn()
  };
  return {
    EscrowService: jest.fn(() => mockImpl)
  };
});

// Import modules after all mock declarations
import * as escrowsService from '../../src/services/escrows.service';
import * as escrowsRepository from '../../src/db/escrows.repository';
import * as listingsRepository from '../../src/db/listings.repository';
import * as usersRepository from '../../src/db/users.repository';
import * as notificationsService from '../../src/services/notifications.service';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../src/utils/errors';
import { EscrowStatus, ListingStatus } from '../../src/types';
import { EscrowService } from '../../src/blockchain/escrow';

// Get the mock blockchain service instance
const mockEscrowServiceInstance = new EscrowService();
const mockCreateEscrow = mockEscrowServiceInstance.createEscrow as jest.Mock;
const mockFundEscrow = mockEscrowServiceInstance.fundEscrow as jest.Mock;
const mockReleaseEscrow = mockEscrowServiceInstance.releaseEscrow as jest.Mock;
const mockRefundEscrow = mockEscrowServiceInstance.refundEscrow as jest.Mock;

describe('Escrows Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('createEscrow', () => {
    it('should create an escrow successfully', async () => {
      // Setup
      const buyerId = 'buyer-123';
      const listingId = 'listing-123';
      
      const mockBuyer = {
        id: buyerId,
        username: 'testbuyer',
        walletAddress: 'buyer-wallet-123'
      };
      
      const mockSeller = {
        id: 'seller-123',
        username: 'testseller',
        walletAddress: 'seller-wallet-123'
      };
      
      const mockListing = {
        id: listingId,
        title: 'Test Listing',
        price: 100,
        currency: 'USDC',
        sellerId: 'seller-123',
        status: ListingStatus.ACTIVE
      };
      
      const mockBlockchainEscrowResult = {
        escrowAddress: 'escrow-address-123',
        releaseTime: new Date(Date.now() + 86400000) // 24 hours from now
      };
      
      const mockEscrow = {
        id: 'escrow-123',
        listingId,
        buyerId,
        sellerId: 'seller-123',
        amount: 100,
        currency: 'USDC',
        status: EscrowStatus.CREATED,
        escrowAddress: 'escrow-address-123',
        releaseTime: mockBlockchainEscrowResult.releaseTime
      };
      
      // Mock repository responses
      (usersRepository.findById as jest.Mock)
        .mockImplementation((userId) => {
          if (userId === buyerId) return Promise.resolve(mockBuyer);
          if (userId === 'seller-123') return Promise.resolve(mockSeller);
          return Promise.resolve(null);
        });
      
      (listingsRepository.findById as jest.Mock).mockResolvedValue(mockListing);
      
      mockCreateEscrow.mockResolvedValue(mockBlockchainEscrowResult);
      
      (escrowsRepository.create as jest.Mock).mockResolvedValue(mockEscrow);
      
      // Execute
      const result = await escrowsService.createEscrow(buyerId, listingId);
      
      // Assert
      expect(usersRepository.findById).toHaveBeenCalledWith(buyerId);
      expect(listingsRepository.findById).toHaveBeenCalledWith(listingId);
      expect(usersRepository.findById).toHaveBeenCalledWith('seller-123');
      
      expect(mockCreateEscrow).toHaveBeenCalledWith(
        'buyer-wallet-123',
        'seller-wallet-123',
        100
      );
      
      expect(escrowsRepository.create).toHaveBeenCalledWith({
        listingId,
        buyerId,
        sellerId: 'seller-123',
        amount: 100,
        currency: 'USDC',
        status: EscrowStatus.CREATED,
        escrowAddress: 'escrow-address-123',
        releaseTime: expect.any(Date)
      });
      
      expect(notificationsService.createEscrowNotification).toHaveBeenCalledTimes(2);
      
      expect(result).toEqual(mockEscrow);
    });
    
    it('should throw error if buyer not found', async () => {
      // Setup
      const buyerId = 'nonexistent-buyer';
      const listingId = 'listing-123';
      
      (usersRepository.findById as jest.Mock).mockResolvedValue(null);
      
      // Execute & Assert
      await expect(escrowsService.createEscrow(buyerId, listingId)).rejects.toThrow(NotFoundError);
      expect(escrowsRepository.create).not.toHaveBeenCalled();
    });
    
    it('should throw error if listing not found', async () => {
      // Setup
      const buyerId = 'buyer-123';
      const listingId = 'nonexistent-listing';
      
      const mockBuyer = {
        id: 'buyer-123',
        username: 'testbuyer',
        walletAddress: 'buyer-wallet-123'
      };
      
      (usersRepository.findById as jest.Mock).mockResolvedValue(mockBuyer);
      (listingsRepository.findById as jest.Mock).mockResolvedValue(null);
      
      // Execute & Assert
      await expect(escrowsService.createEscrow(buyerId, listingId)).rejects.toThrow(NotFoundError);
      expect(escrowsRepository.create).not.toHaveBeenCalled();
    });
    
    it('should throw error if listing is not active', async () => {
      // Setup
      const buyerId = 'buyer-123';
      const listingId = 'listing-123';
      
      const mockBuyer = {
        id: 'buyer-123',
        username: 'testbuyer',
        walletAddress: 'buyer-wallet-123'
      };
      
      const mockListing = {
        id: 'listing-123',
        title: 'Test Listing',
        price: 100,
        currency: 'USDC',
        sellerId: 'seller-123',
        status: ListingStatus.SOLD
      };
      
      (usersRepository.findById as jest.Mock).mockResolvedValue(mockBuyer);
      (listingsRepository.findById as jest.Mock).mockResolvedValue(mockListing);
      
      // Execute & Assert
      await expect(escrowsService.createEscrow(buyerId, listingId)).rejects.toThrow(BadRequestError);
      expect(escrowsRepository.create).not.toHaveBeenCalled();
    });
    
    it('should throw error if buyer tries to buy their own listing', async () => {
      // Setup
      const buyerId = 'seller-123';
      const listingId = 'listing-123';
      
      const mockBuyerSeller = {
        id: 'seller-123',
        username: 'testseller',
        walletAddress: 'seller-wallet-123'
      };
      
      const mockListing = {
        id: 'listing-123',
        title: 'Test Listing',
        price: 100,
        currency: 'USDC',
        sellerId: 'seller-123',
        status: ListingStatus.ACTIVE
      };
      
      (usersRepository.findById as jest.Mock).mockResolvedValue(mockBuyerSeller);
      (listingsRepository.findById as jest.Mock).mockResolvedValue(mockListing);
      
      // Execute & Assert
      await expect(escrowsService.createEscrow(buyerId, listingId)).rejects.toThrow(BadRequestError);
      expect(escrowsRepository.create).not.toHaveBeenCalled();
    });
  });
  
  describe('getEscrowById', () => {
    it('should return an escrow when user is the buyer', async () => {
      // Setup
      const escrowId = 'escrow-123';
      const userId = 'buyer-123';
      
      const mockEscrow = {
        id: 'escrow-123',
        listingId: 'listing-123',
        buyerId: 'buyer-123',
        sellerId: 'seller-123',
        amount: 100,
        currency: 'USDC',
        status: EscrowStatus.CREATED
      };
      
      (escrowsRepository.findById as jest.Mock).mockResolvedValue(mockEscrow);
      
      // Execute
      const result = await escrowsService.getEscrowById(escrowId, userId);
      
      // Assert
      expect(escrowsRepository.findById).toHaveBeenCalledWith(escrowId);
      expect(result).toEqual(mockEscrow);
    });
    
    it('should return an escrow when user is the seller', async () => {
      // Setup
      const escrowId = 'escrow-123';
      const userId = 'seller-123';
      
      const mockEscrow = {
        id: 'escrow-123',
        listingId: 'listing-123',
        buyerId: 'buyer-123',
        sellerId: 'seller-123',
        amount: 100,
        currency: 'USDC',
        status: EscrowStatus.CREATED
      };
      
      (escrowsRepository.findById as jest.Mock).mockResolvedValue(mockEscrow);
      
      // Execute
      const result = await escrowsService.getEscrowById(escrowId, userId);
      
      // Assert
      expect(escrowsRepository.findById).toHaveBeenCalledWith(escrowId);
      expect(result).toEqual(mockEscrow);
    });
    
    it('should throw error if escrow not found', async () => {
      // Setup
      const escrowId = 'nonexistent-escrow';
      const userId = 'buyer-123';
      
      (escrowsRepository.findById as jest.Mock).mockResolvedValue(null);
      
      // Execute & Assert
      await expect(escrowsService.getEscrowById(escrowId, userId)).rejects.toThrow(NotFoundError);
    });
    
    it('should throw error if user is neither buyer nor seller', async () => {
      // Setup
      const escrowId = 'escrow-123';
      const userId = 'unrelated-user';
      
      const mockEscrow = {
        id: 'escrow-123',
        listingId: 'listing-123',
        buyerId: 'buyer-123',
        sellerId: 'seller-123',
        amount: 100,
        currency: 'USDC',
        status: EscrowStatus.CREATED
      };
      
      (escrowsRepository.findById as jest.Mock).mockResolvedValue(mockEscrow);
      
      // Execute & Assert
      await expect(escrowsService.getEscrowById(escrowId, userId)).rejects.toThrow(ForbiddenError);
    });
  });
  
  describe('getUserEscrows', () => {
    it('should return escrows for a user', async () => {
      // Setup
      const userId = 'user-123';
      const options = {
        role: 'buyer' as const,
        status: EscrowStatus.CREATED,
        limit: 10,
        offset: 0
      };
      
      const mockResult = {
        escrows: [
          {
            id: 'escrow-123',
            listingId: 'listing-123',
            buyerId: 'user-123',
            sellerId: 'seller-123',
            amount: 100,
            currency: 'USDC',
            status: EscrowStatus.CREATED
          }
        ],
        total: 1
      };
      
      (escrowsRepository.findByUserId as jest.Mock).mockResolvedValue(mockResult);
      
      // Execute
      const result = await escrowsService.getUserEscrows(userId, options);
      
      // Assert
      expect(escrowsRepository.findByUserId).toHaveBeenCalledWith(userId, options);
      expect(result).toEqual(mockResult);
    });
    
    it('should use default options if none provided', async () => {
      // Setup
      const userId = 'user-123';
      
      const mockResult = {
        escrows: [
          {
            id: 'escrow-123',
            listingId: 'listing-123',
            buyerId: 'user-123',
            sellerId: 'seller-123',
            amount: 100,
            currency: 'USDC',
            status: EscrowStatus.CREATED
          }
        ],
        total: 1
      };
      
      (escrowsRepository.findByUserId as jest.Mock).mockResolvedValue(mockResult);
      
      // Execute
      const result = await escrowsService.getUserEscrows(userId);
      
      // Assert
      expect(escrowsRepository.findByUserId).toHaveBeenCalledWith(userId, {});
      expect(result).toEqual(mockResult);
    });
  });
  
  describe('fundEscrow', () => {
    it('should fund an escrow successfully', async () => {
      // Setup
      const escrowId = 'escrow-123';
      const buyerId = 'buyer-123';
      const buyerPrivateKey = 'private-key-123';
      
      const mockEscrow = {
        id: 'escrow-123',
        listingId: 'listing-123',
        buyerId: 'buyer-123',
        sellerId: 'seller-123',
        amount: 100,
        currency: 'USDC',
        status: EscrowStatus.CREATED,
        escrowAddress: 'escrow-address-123'
      };
      
      const mockListing = {
        id: 'listing-123',
        title: 'Test Listing',
        sellerId: 'seller-123'
      };
      
      const mockBlockchainFundResult = {
        transactionSignature: 'tx-signature-123'
      };
      
      const mockUpdatedEscrow = {
        ...mockEscrow,
        status: EscrowStatus.FUNDED,
        transactionId: 'tx-signature-123'
      };
      
      (escrowsRepository.findById as jest.Mock).mockResolvedValue(mockEscrow);
      (listingsRepository.findById as jest.Mock).mockResolvedValue(mockListing);
      mockFundEscrow.mockResolvedValue(mockBlockchainFundResult);
      (escrowsRepository.updateStatus as jest.Mock).mockResolvedValue(mockUpdatedEscrow);
      
      // Execute
      const result = await escrowsService.fundEscrow(escrowId, buyerId, buyerPrivateKey);
      
      // Assert
      expect(escrowsRepository.findById).toHaveBeenCalledWith(escrowId);
      expect(mockFundEscrow).toHaveBeenCalledWith(
        'escrow-address-123',
        100,
        buyerPrivateKey
      );
      expect(escrowsRepository.updateStatus).toHaveBeenCalledWith(
        escrowId,
        EscrowStatus.FUNDED,
        'tx-signature-123'
      );
      expect(notificationsService.createTransactionNotification).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockUpdatedEscrow);
    });
    
    it('should throw error if escrow not found', async () => {
      // Setup
      const escrowId = 'nonexistent-escrow';
      const buyerId = 'buyer-123';
      const buyerPrivateKey = 'private-key-123';
      
      (escrowsRepository.findById as jest.Mock).mockResolvedValue(null);
      
      // Execute & Assert
      await expect(escrowsService.fundEscrow(escrowId, buyerId, buyerPrivateKey)).rejects.toThrow(NotFoundError);
      expect(mockFundEscrow).not.toHaveBeenCalled();
    });
    
    it('should throw error if user is not the buyer', async () => {
      // Setup
      const escrowId = 'escrow-123';
      const buyerId = 'not-the-buyer';
      const buyerPrivateKey = 'private-key-123';
      
      const mockEscrow = {
        id: 'escrow-123',
        listingId: 'listing-123',
        buyerId: 'buyer-123', // Different from the provided buyerId
        sellerId: 'seller-123',
        amount: 100,
        currency: 'USDC',
        status: EscrowStatus.CREATED,
        escrowAddress: 'escrow-address-123'
      };
      
      (escrowsRepository.findById as jest.Mock).mockResolvedValue(mockEscrow);
      
      // Execute & Assert
      await expect(escrowsService.fundEscrow(escrowId, buyerId, buyerPrivateKey)).rejects.toThrow(ForbiddenError);
      expect(mockFundEscrow).not.toHaveBeenCalled();
    });
    
    it('should throw error if escrow is not in CREATED state', async () => {
      // Setup
      const escrowId = 'escrow-123';
      const buyerId = 'buyer-123';
      const buyerPrivateKey = 'private-key-123';
      
      const mockEscrow = {
        id: 'escrow-123',
        listingId: 'listing-123',
        buyerId: 'buyer-123',
        sellerId: 'seller-123',
        amount: 100,
        currency: 'USDC',
        status: EscrowStatus.FUNDED, // Already funded
        escrowAddress: 'escrow-address-123'
      };
      
      (escrowsRepository.findById as jest.Mock).mockResolvedValue(mockEscrow);
      
      // Execute & Assert
      await expect(escrowsService.fundEscrow(escrowId, buyerId, buyerPrivateKey)).rejects.toThrow(BadRequestError);
      expect(mockFundEscrow).not.toHaveBeenCalled();
    });
  });
  
  describe('releaseEscrow', () => {
    it('should release an escrow successfully', async () => {
      // Setup
      const escrowId = 'escrow-123';
      const sellerId = 'seller-123';
      
      const mockEscrow = {
        id: 'escrow-123',
        listingId: 'listing-123',
        buyerId: 'buyer-123',
        sellerId: 'seller-123',
        amount: 100,
        currency: 'USDC',
        status: EscrowStatus.FUNDED,
        escrowAddress: 'escrow-address-123'
      };
      
      const mockSeller = {
        id: 'seller-123',
        walletAddress: 'seller-wallet-123'
      };
      
      const mockListing = {
        id: 'listing-123',
        title: 'Test Listing',
        sellerId: 'seller-123'
      };
      
      const mockBlockchainReleaseResult = {
        transactionSignature: 'tx-signature-123'
      };
      
      const mockUpdatedEscrow = {
        ...mockEscrow,
        status: EscrowStatus.RELEASED,
        transactionId: 'tx-signature-123'
      };
      
      (escrowsRepository.findById as jest.Mock).mockResolvedValue(mockEscrow);
      (usersRepository.findById as jest.Mock).mockResolvedValue(mockSeller);
      (listingsRepository.findById as jest.Mock).mockResolvedValue(mockListing);
      mockReleaseEscrow.mockResolvedValue(mockBlockchainReleaseResult);
      (escrowsRepository.updateStatus as jest.Mock).mockResolvedValue(mockUpdatedEscrow);
      
      // Execute
      const result = await escrowsService.releaseEscrow(escrowId, sellerId);
      
      // Assert
      expect(escrowsRepository.findById).toHaveBeenCalledWith(escrowId);
      expect(usersRepository.findById).toHaveBeenCalledWith(sellerId);
      expect(mockReleaseEscrow).toHaveBeenCalledWith(
        'escrow-address-123',
        'seller-wallet-123'
      );
      expect(escrowsRepository.updateStatus).toHaveBeenCalledWith(
        escrowId,
        EscrowStatus.RELEASED,
        'tx-signature-123'
      );
      expect(listingsRepository.update).toHaveBeenCalledWith('listing-123', { status: ListingStatus.SOLD });
      expect(notificationsService.createTransactionNotification).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockUpdatedEscrow);
    });
    
    it('should throw error if escrow not found', async () => {
      // Setup
      const escrowId = 'nonexistent-escrow';
      const sellerId = 'seller-123';
      
      (escrowsRepository.findById as jest.Mock).mockResolvedValue(null);
      
      // Execute & Assert
      await expect(escrowsService.releaseEscrow(escrowId, sellerId)).rejects.toThrow(NotFoundError);
      expect(mockReleaseEscrow).not.toHaveBeenCalled();
    });
    
    it('should throw error if user is not the seller', async () => {
      // Setup
      const escrowId = 'escrow-123';
      const sellerId = 'not-the-seller';
      
      const mockEscrow = {
        id: 'escrow-123',
        listingId: 'listing-123',
        buyerId: 'buyer-123',
        sellerId: 'seller-123', // Different from the provided sellerId
        amount: 100,
        currency: 'USDC',
        status: EscrowStatus.FUNDED,
        escrowAddress: 'escrow-address-123'
      };
      
      (escrowsRepository.findById as jest.Mock).mockResolvedValue(mockEscrow);
      
      // Execute & Assert
      await expect(escrowsService.releaseEscrow(escrowId, sellerId)).rejects.toThrow(ForbiddenError);
      expect(mockReleaseEscrow).not.toHaveBeenCalled();
    });
    
    it('should throw error if escrow is not in FUNDED state', async () => {
      // Setup
      const escrowId = 'escrow-123';
      const sellerId = 'seller-123';
      
      const mockEscrow = {
        id: 'escrow-123',
        listingId: 'listing-123',
        buyerId: 'buyer-123',
        sellerId: 'seller-123',
        amount: 100,
        currency: 'USDC',
        status: EscrowStatus.CREATED, // Not funded yet
        escrowAddress: 'escrow-address-123'
      };
      
      (escrowsRepository.findById as jest.Mock).mockResolvedValue(mockEscrow);
      
      // Execute & Assert
      await expect(escrowsService.releaseEscrow(escrowId, sellerId)).rejects.toThrow(BadRequestError);
      expect(mockReleaseEscrow).not.toHaveBeenCalled();
    });
  });
  
  describe('refundEscrow', () => {
    it('should refund an escrow successfully', async () => {
      // Setup
      const escrowId = 'escrow-123';
      const sellerId = 'seller-123';
      
      const mockEscrow = {
        id: 'escrow-123',
        listingId: 'listing-123',
        buyerId: 'buyer-123',
        sellerId: 'seller-123',
        amount: 100,
        currency: 'USDC',
        status: EscrowStatus.FUNDED,
        escrowAddress: 'escrow-address-123'
      };
      
      const mockBuyer = {
        id: 'buyer-123',
        walletAddress: 'buyer-wallet-123'
      };
      
      const mockListing = {
        id: 'listing-123',
        title: 'Test Listing',
        sellerId: 'seller-123'
      };
      
      const mockBlockchainRefundResult = {
        transactionSignature: 'tx-signature-123'
      };
      
      const mockUpdatedEscrow = {
        ...mockEscrow,
        status: EscrowStatus.REFUNDED,
        transactionId: 'tx-signature-123'
      };
      
      (escrowsRepository.findById as jest.Mock).mockResolvedValue(mockEscrow);
      (usersRepository.findById as jest.Mock).mockResolvedValue(mockBuyer);
      (listingsRepository.findById as jest.Mock).mockResolvedValue(mockListing);
      mockRefundEscrow.mockResolvedValue(mockBlockchainRefundResult);
      (escrowsRepository.updateStatus as jest.Mock).mockResolvedValue(mockUpdatedEscrow);
      
      // Execute
      const result = await escrowsService.refundEscrow(escrowId, sellerId);
      
      // Assert
      expect(escrowsRepository.findById).toHaveBeenCalledWith(escrowId);
      expect(usersRepository.findById).toHaveBeenCalledWith('buyer-123');
      expect(mockRefundEscrow).toHaveBeenCalledWith(
        'escrow-address-123',
        'buyer-wallet-123'
      );
      expect(escrowsRepository.updateStatus).toHaveBeenCalledWith(
        escrowId,
        EscrowStatus.REFUNDED,
        'tx-signature-123'
      );
      expect(notificationsService.createTransactionNotification).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockUpdatedEscrow);
    });
    
    it('should throw error if escrow not found', async () => {
      // Setup
      const escrowId = 'nonexistent-escrow';
      const sellerId = 'seller-123';
      
      (escrowsRepository.findById as jest.Mock).mockResolvedValue(null);
      
      // Execute & Assert
      await expect(escrowsService.refundEscrow(escrowId, sellerId)).rejects.toThrow(NotFoundError);
      expect(mockRefundEscrow).not.toHaveBeenCalled();
    });
    
    it('should throw error if user is not the seller', async () => {
      // Setup
      const escrowId = 'escrow-123';
      const sellerId = 'not-the-seller';
      
      const mockEscrow = {
        id: 'escrow-123',
        listingId: 'listing-123',
        buyerId: 'buyer-123',
        sellerId: 'seller-123', // Different from the provided sellerId
        amount: 100,
        currency: 'USDC',
        status: EscrowStatus.FUNDED,
        escrowAddress: 'escrow-address-123'
      };
      
      (escrowsRepository.findById as jest.Mock).mockResolvedValue(mockEscrow);
      
      // Execute & Assert
      await expect(escrowsService.refundEscrow(escrowId, sellerId)).rejects.toThrow(ForbiddenError);
      expect(mockRefundEscrow).not.toHaveBeenCalled();
    });
    
    it('should throw error if escrow is not in FUNDED state', async () => {
      // Setup
      const escrowId = 'escrow-123';
      const sellerId = 'seller-123';
      
      const mockEscrow = {
        id: 'escrow-123',
        listingId: 'listing-123',
        buyerId: 'buyer-123',
        sellerId: 'seller-123',
        amount: 100,
        currency: 'USDC',
        status: EscrowStatus.CREATED, // Not funded yet
        escrowAddress: 'escrow-address-123'
      };
      
      (escrowsRepository.findById as jest.Mock).mockResolvedValue(mockEscrow);
      
      // Execute & Assert
      await expect(escrowsService.refundEscrow(escrowId, sellerId)).rejects.toThrow(BadRequestError);
      expect(mockRefundEscrow).not.toHaveBeenCalled();
    });
  });
});
