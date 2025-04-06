import { Pool } from 'pg';
import { EscrowStatus } from '../../src/types';

// Move all jest.mock calls to the top
jest.mock('../../src/db/index', () => {
  return {
    query: jest.fn()
  };
});

// Then import our mocked modules after the jest.mock calls
import * as escrowsRepository from '../../src/db/escrows.repository';
import { query } from '../../src/db/index';

// Cast the query to a jest.Mock to use it in our tests
const mockQuery = query as jest.Mock;

describe('Escrows Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create an escrow successfully', async () => {
      // Setup
      const escrowData = {
        listingId: 'listing-123',
        buyerId: 'buyer-123',
        sellerId: 'seller-123',
        amount: 100,
        currency: 'USDC',
        status: EscrowStatus.CREATED,
        escrowAddress: 'escrow-address-123',
        releaseTime: new Date()
      };

      const mockResult = {
        rows: [{
          id: 'escrow-123',
          listing_id: escrowData.listingId,
          buyer_id: escrowData.buyerId,
          seller_id: escrowData.sellerId,
          amount: escrowData.amount,
          currency: escrowData.currency,
          status: escrowData.status,
          escrow_address: escrowData.escrowAddress,
          release_time: escrowData.releaseTime,
          created_at: new Date(),
          updated_at: new Date(),
          transaction_signature: null
        }]
      };

      mockQuery.mockResolvedValueOnce(mockResult);

      // Execute
      const result = await escrowsRepository.create(escrowData);

      // Assert
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO escrows'),
        expect.arrayContaining([
          escrowData.listingId,
          escrowData.buyerId,
          escrowData.sellerId,
          escrowData.amount,
          escrowData.currency,
          escrowData.status,
          escrowData.escrowAddress,
          escrowData.releaseTime
        ])
      );
      expect(result).toEqual({
        id: 'escrow-123',
        listingId: escrowData.listingId,
        buyerId: escrowData.buyerId,
        sellerId: escrowData.sellerId,
        amount: escrowData.amount,
        currency: escrowData.currency,
        status: escrowData.status,
        escrowAddress: escrowData.escrowAddress,
        releaseTime: escrowData.releaseTime,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        transactionSignature: null
      });
    });
  });

  describe('findById', () => {
    it('should find an escrow by id', async () => {
      // Setup
      const escrowId = 'escrow-123';
      const mockResult = {
        rows: [{
          id: escrowId,
          listing_id: 'listing-123',
          buyer_id: 'buyer-123',
          seller_id: 'seller-123',
          amount: 100,
          currency: 'USDC',
          status: EscrowStatus.CREATED,
          escrow_address: 'escrow-address-123',
          release_time: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
          transaction_signature: null
        }]
      };

      mockQuery.mockResolvedValueOnce(mockResult);

      // Execute
      const result = await escrowsRepository.findById(escrowId);

      // Assert
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM escrows WHERE id = $1'),
        [escrowId]
      );
      expect(result).toEqual({
        id: escrowId,
        listingId: 'listing-123',
        buyerId: 'buyer-123',
        sellerId: 'seller-123',
        amount: 100,
        currency: 'USDC',
        status: EscrowStatus.CREATED,
        escrowAddress: 'escrow-address-123',
        releaseTime: expect.any(Date),
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        transactionSignature: null
      });
    });

    it('should return null if escrow not found', async () => {
      // Setup
      const escrowId = 'nonexistent-escrow';
      const mockResult = {
        rows: []
      };

      mockQuery.mockResolvedValueOnce(mockResult);

      // Execute
      const result = await escrowsRepository.findById(escrowId);

      // Assert
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM escrows WHERE id = $1'),
        [escrowId]
      );
      expect(result).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('should find escrows by user id as buyer', async () => {
      // Setup
      const userId = 'buyer-123';
      const options = {
        role: 'buyer' as const,
        status: EscrowStatus.CREATED,
        limit: 10,
        offset: 0
      };

      const mockEscrows = [
        {
          id: 'escrow-123',
          listing_id: 'listing-123',
          buyer_id: userId,
          seller_id: 'seller-123',
          amount: 100,
          currency: 'USDC',
          status: EscrowStatus.CREATED,
          escrow_address: 'escrow-address-123',
          release_time: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
          transaction_signature: null
        }
      ];

      const mockCountResult = {
        rows: [{ count: '1' }]
      };

      const mockEscrowsResult = {
        rows: mockEscrows
      };

      mockQuery.mockResolvedValueOnce(mockEscrowsResult)
               .mockResolvedValueOnce(mockCountResult);

      // Execute
      const result = await escrowsRepository.findByUserId(userId, options);

      // Assert
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('SELECT * FROM escrows'),
        expect.arrayContaining([userId])
      );
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('SELECT COUNT(*)'),
        expect.arrayContaining([userId])
      );
      expect(result).toEqual({
        escrows: [{
          id: 'escrow-123',
          listingId: 'listing-123',
          buyerId: userId,
          sellerId: 'seller-123',
          amount: 100,
          currency: 'USDC',
          status: EscrowStatus.CREATED,
          escrowAddress: 'escrow-address-123',
          releaseTime: expect.any(Date),
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
          transactionSignature: null
        }],
        total: 1
      });
    });

    it('should find escrows by user id as seller', async () => {
      // Setup
      const userId = 'seller-123';
      const options = {
        role: 'seller' as const,
        limit: 10,
        offset: 0
      };

      const mockEscrows = [
        {
          id: 'escrow-123',
          listing_id: 'listing-123',
          buyer_id: 'buyer-123',
          seller_id: userId,
          amount: 100,
          currency: 'USDC',
          status: EscrowStatus.CREATED,
          escrow_address: 'escrow-address-123',
          release_time: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
          transaction_signature: null
        }
      ];

      const mockCountResult = {
        rows: [{ count: '1' }]
      };

      const mockEscrowsResult = {
        rows: mockEscrows
      };

      mockQuery.mockResolvedValueOnce(mockEscrowsResult)
               .mockResolvedValueOnce(mockCountResult);

      // Execute
      const result = await escrowsRepository.findByUserId(userId, options);

      // Assert
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('SELECT * FROM escrows'),
        expect.arrayContaining([userId])
      );
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('SELECT COUNT(*)'),
        expect.arrayContaining([userId])
      );
      expect(result).toEqual({
        escrows: [{
          id: 'escrow-123',
          listingId: 'listing-123',
          buyerId: 'buyer-123',
          sellerId: userId,
          amount: 100,
          currency: 'USDC',
          status: EscrowStatus.CREATED,
          escrowAddress: 'escrow-address-123',
          releaseTime: expect.any(Date),
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
          transactionSignature: null
        }],
        total: 1
      });
    });

    it('should use default options if none provided', async () => {
      // Setup
      const userId = 'buyer-123';

      const mockEscrows = [
        {
          id: 'escrow-123',
          listing_id: 'listing-123',
          buyer_id: userId,
          seller_id: 'seller-123',
          amount: 100,
          currency: 'USDC',
          status: EscrowStatus.CREATED,
          escrow_address: 'escrow-address-123',
          release_time: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
          transaction_signature: null
        }
      ];

      const mockCountResult = {
        rows: [{ count: '1' }]
      };

      const mockEscrowsResult = {
        rows: mockEscrows
      };

      mockQuery.mockResolvedValueOnce(mockEscrowsResult)
               .mockResolvedValueOnce(mockCountResult);

      // Execute
      const result = await escrowsRepository.findByUserId(userId);

      // Assert
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('SELECT * FROM escrows'),
        expect.arrayContaining([userId])
      );
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('SELECT COUNT(*)'),
        expect.arrayContaining([userId])
      );
      expect(result).toEqual({
        escrows: [{
          id: 'escrow-123',
          listingId: 'listing-123',
          buyerId: userId,
          sellerId: 'seller-123',
          amount: 100,
          currency: 'USDC',
          status: EscrowStatus.CREATED,
          escrowAddress: 'escrow-address-123',
          releaseTime: expect.any(Date),
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
          transactionSignature: null
        }],
        total: 1
      });
    });
  });

  describe('updateStatus', () => {
    it('should update escrow status successfully', async () => {
      // Setup
      const escrowId = 'escrow-123';
      const newStatus = EscrowStatus.FUNDED;
      const transactionSignature = 'tx-signature-123';

      const mockResult = {
        rows: [{
          id: escrowId,
          listing_id: 'listing-123',
          buyer_id: 'buyer-123',
          seller_id: 'seller-123',
          amount: 100,
          currency: 'USDC',
          status: newStatus,
          escrow_address: 'escrow-address-123',
          release_time: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
          transaction_signature: transactionSignature
        }]
      };

      mockQuery.mockResolvedValueOnce(mockResult);

      // Execute
      const result = await escrowsRepository.updateStatus(escrowId, newStatus, transactionSignature);

      // Assert
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE escrows'),
        expect.arrayContaining([escrowId, newStatus, transactionSignature])
      );
      expect(result).toEqual({
        id: escrowId,
        listingId: 'listing-123',
        buyerId: 'buyer-123',
        sellerId: 'seller-123',
        amount: 100,
        currency: 'USDC',
        status: newStatus,
        escrowAddress: 'escrow-address-123',
        releaseTime: expect.any(Date),
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        transactionSignature: transactionSignature
      });
    });

    it('should update escrow status without transaction signature', async () => {
      // Setup
      const escrowId = 'escrow-123';
      const newStatus = EscrowStatus.CANCELED;

      const mockResult = {
        rows: [{
          id: escrowId,
          listing_id: 'listing-123',
          buyer_id: 'buyer-123',
          seller_id: 'seller-123',
          amount: 100,
          currency: 'USDC',
          status: newStatus,
          escrow_address: 'escrow-address-123',
          release_time: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
          transaction_signature: null
        }]
      };

      mockQuery.mockResolvedValueOnce(mockResult);

      // Execute
      const result = await escrowsRepository.updateStatus(escrowId, newStatus);

      // Assert
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE escrows'),
        expect.arrayContaining([escrowId, newStatus])
      );
      expect(result).toEqual({
        id: escrowId,
        listingId: 'listing-123',
        buyerId: 'buyer-123',
        sellerId: 'seller-123',
        amount: 100,
        currency: 'USDC',
        status: newStatus,
        escrowAddress: 'escrow-address-123',
        releaseTime: expect.any(Date),
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        transactionSignature: null
      });
    });
  });
});
