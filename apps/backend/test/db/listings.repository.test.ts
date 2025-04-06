import * as listingsRepository from '../../src/db/listings.repository';
import { query } from '../../src/db/index';
import { ListingStatus } from '../../src/types';

// Mock dependencies
jest.mock('../../src/db/index', () => ({
  query: jest.fn()
}));

describe('Listings Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('create', () => {
    it('should create a listing and return the created listing data', async () => {
      // Setup
      const listingData = {
        title: 'Test Listing',
        description: 'This is a test listing',
        price: 100,
        currency: 'USDC',
        category: 'electronics',
        sellerId: 'user-123',
        status: ListingStatus.ACTIVE
      };
      
      const mockQueryResult = {
        rows: [{
          id: 'listing-123',
          title: 'Test Listing',
          description: 'This is a test listing',
          price: 100,
          currency: 'USDC',
          category: 'electronics',
          seller_id: 'user-123',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date()
        }]
      };
      
      (query as jest.Mock).mockResolvedValue(mockQueryResult);
      
      // Execute
      const result = await listingsRepository.create(listingData);
      
      // Assert
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO listings'),
        expect.arrayContaining([
          'Test Listing',
          'This is a test listing',
          100,
          'USDC',
          'electronics',
          'user-123',
          ListingStatus.ACTIVE
        ])
      );
      
      expect(result).toEqual({
        id: 'listing-123',
        title: 'Test Listing',
        description: 'This is a test listing',
        price: 100,
        currency: 'USDC',
        category: 'electronics',
        sellerId: 'user-123',
        status: 'active',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });
    });
  });
  
  describe('findAll', () => {
    it('should return all listings without filters', async () => {
      // Setup
      const mockQueryResult = {
        rows: [
          {
            id: 'listing-123',
            title: 'Test Listing 1',
            price: 100,
            currency: 'USDC',
            seller_id: 'user-123',
            status: 'active',
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            id: 'listing-456',
            title: 'Test Listing 2',
            price: 200,
            currency: 'USDC',
            seller_id: 'user-456',
            status: 'active',
            created_at: new Date(),
            updated_at: new Date()
          }
        ]
      };
      
      const mockCountResult = {
        rows: [{ count: '2' }]
      };
      
      (query as jest.Mock)
        .mockResolvedValueOnce(mockQueryResult)
        .mockResolvedValueOnce(mockCountResult);
      
      // Execute
      const result = await listingsRepository.findAll({});
      
      // Assert
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM listings'),
        expect.arrayContaining([20, 0])
      );
      
      expect(result.listings).toHaveLength(2);
      expect(result.listings[0]).toEqual({
        id: 'listing-123',
        title: 'Test Listing 1',
        price: 100,
        currency: 'USDC',
        sellerId: 'user-123',
        status: 'active',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });
      expect(result.total).toBe(2);
    });
    
    it('should apply filters when provided', async () => {
      // Setup
      const filters = {
        category: 'electronics',
        status: ListingStatus.ACTIVE
      };
      
      const mockQueryResult = {
        rows: [
          {
            id: 'listing-123',
            title: 'Test Listing 1',
            price: 100,
            currency: 'USDC',
            category: 'electronics',
            seller_id: 'user-123',
            status: 'active',
            created_at: new Date(),
            updated_at: new Date()
          }
        ]
      };
      
      const mockCountResult = {
        rows: [{ count: '1' }]
      };
      
      (query as jest.Mock)
        .mockResolvedValueOnce(mockQueryResult)
        .mockResolvedValueOnce(mockCountResult);
      
      // Execute
      const result = await listingsRepository.findAll(filters);
      
      // Assert
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE'),
        expect.arrayContaining([20, 0, ListingStatus.ACTIVE, 'electronics'])
      );
      
      expect(result.listings).toHaveLength(1);
      expect(result.listings[0]).toEqual({
        id: 'listing-123',
        title: 'Test Listing 1',
        price: 100,
        currency: 'USDC',
        category: 'electronics',
        sellerId: 'user-123',
        status: 'active',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });
      expect(result.total).toBe(1);
    });
  });
  
  describe('findById', () => {
    it('should return a listing when found by ID', async () => {
      // Setup
      const listingId = 'listing-123';
      
      const mockQueryResult = {
        rows: [{
          id: 'listing-123',
          title: 'Test Listing',
          description: 'This is a test listing',
          price: 100,
          currency: 'USDC',
          category: 'electronics',
          seller_id: 'user-123',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date()
        }]
      };
      
      (query as jest.Mock).mockResolvedValue(mockQueryResult);
      
      // Execute
      const result = await listingsRepository.findById(listingId);
      
      // Assert
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM listings WHERE id = $1'),
        [listingId]
      );
      
      expect(result).toEqual({
        id: 'listing-123',
        title: 'Test Listing',
        description: 'This is a test listing',
        price: 100,
        currency: 'USDC',
        category: 'electronics',
        sellerId: 'user-123',
        status: 'active',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });
    });
    
    it('should return null when listing is not found by ID', async () => {
      // Setup
      const listingId = 'nonexistent-listing';
      
      const mockQueryResult = {
        rows: []
      };
      
      (query as jest.Mock).mockResolvedValue(mockQueryResult);
      
      // Execute
      const result = await listingsRepository.findById(listingId);
      
      // Assert
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM listings WHERE id = $1'),
        [listingId]
      );
      
      expect(result).toBeNull();
    });
  });
  
  describe('update', () => {
    it('should update a listing and return the updated listing data', async () => {
      // Setup
      const listingId = 'listing-123';
      const updateData = {
        title: 'Updated Title',
        price: 150
      };
      
      const mockQueryResult = {
        rows: [{
          id: 'listing-123',
          title: 'Updated Title',
          description: 'This is a test listing',
          price: 150,
          currency: 'USDC',
          category: 'electronics',
          seller_id: 'user-123',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date()
        }]
      };
      
      (query as jest.Mock).mockResolvedValue(mockQueryResult);
      
      // Execute
      const result = await listingsRepository.update(listingId, updateData);
      
      // Assert
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE listings'),
        expect.arrayContaining([listingId, 'Updated Title', 150])
      );
      
      expect(result).toEqual({
        id: 'listing-123',
        title: 'Updated Title',
        description: 'This is a test listing',
        price: 150,
        currency: 'USDC',
        category: 'electronics',
        sellerId: 'user-123',
        status: 'active',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });
    });
    
    it('should return null when listing to update is not found', async () => {
      // Setup
      const listingId = 'nonexistent-listing';
      const updateData = {
        title: 'Updated Title'
      };
      
      const mockQueryResult = {
        rows: []
      };
      
      (query as jest.Mock).mockResolvedValue(mockQueryResult);
      
      // Execute
      const result = await listingsRepository.update(listingId, updateData);
      
      // Assert
      expect(result).toBeNull();
    });
  });
  
  describe('deleteById', () => {
    it('should delete a listing and return true', async () => {
      // Setup
      const listingId = 'listing-123';
      
      const mockQueryResult = {
        rows: [{ id: 'listing-123' }]
      };
      
      (query as jest.Mock).mockResolvedValue(mockQueryResult);
      
      // Execute
      const result = await listingsRepository.deleteById(listingId);
      
      // Assert
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM listings WHERE id = $1'),
        [listingId]
      );
      
      expect(result).toBe(true);
    });
    
    it('should return false when listing to delete is not found', async () => {
      // Setup
      const listingId = 'nonexistent-listing';
      
      const mockQueryResult = {
        rows: []
      };
      
      (query as jest.Mock).mockResolvedValue(mockQueryResult);
      
      // Execute
      const result = await listingsRepository.deleteById(listingId);
      
      // Assert
      expect(result).toBe(false);
    });
  });
});
