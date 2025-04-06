import * as usersRepository from '../../src/db/users.repository';
import { query } from '../../src/db/index';

// Mock dependencies
jest.mock('../../src/db/index', () => ({
  query: jest.fn()
}));

describe('Users Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('create', () => {
    it('should create a user and return the created user data', async () => {
      // Setup
      const walletAddress = 'wallet123';
      const username = 'testuser';
      
      const mockQueryResult = {
        rows: [{
          id: 'user-123',
          username: 'testuser',
          wallet_address: 'wallet123',
          profile_image: null,
          reputation_score: '0',
          created_at: new Date(),
          updated_at: new Date()
        }]
      };
      
      (query as jest.Mock).mockResolvedValue(mockQueryResult);
      
      // Execute
      const result = await usersRepository.create(walletAddress, username);
      
      // Assert
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining([
          'wallet123',
          'testuser'
        ])
      );
      
      expect(result).toEqual({
        id: 'user-123',
        username: 'testuser',
        walletAddress: 'wallet123',
        profileImage: null,
        reputationScore: 0,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });
    });
  });
  
  describe('findById', () => {
    it('should return a user when found by ID', async () => {
      // Setup
      const userId = 'user-123';
      
      const mockQueryResult = {
        rows: [{
          id: 'user-123',
          username: 'testuser',
          wallet_address: 'wallet123',
          profile_image: null,
          reputation_score: '0',
          created_at: new Date(),
          updated_at: new Date()
        }]
      };
      
      (query as jest.Mock).mockResolvedValue(mockQueryResult);
      
      // Execute
      const result = await usersRepository.findById(userId);
      
      // Assert
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM users WHERE id = $1'),
        [userId]
      );
      
      expect(result).toEqual({
        id: 'user-123',
        username: 'testuser',
        walletAddress: 'wallet123',
        profileImage: null,
        reputationScore: 0,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });
    });
    
    it('should return null when user is not found by ID', async () => {
      // Setup
      const userId = 'nonexistent-user';
      
      const mockQueryResult = {
        rows: []
      };
      
      (query as jest.Mock).mockResolvedValue(mockQueryResult);
      
      // Execute
      const result = await usersRepository.findById(userId);
      
      // Assert
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM users WHERE id = $1'),
        [userId]
      );
      
      expect(result).toBeNull();
    });
  });
  
  describe('findByWalletAddress', () => {
    it('should return a user when found by wallet address', async () => {
      // Setup
      const walletAddress = 'wallet123';
      
      const mockQueryResult = {
        rows: [{
          id: 'user-123',
          username: 'testuser',
          wallet_address: 'wallet123',
          profile_image: null,
          reputation_score: '0',
          created_at: new Date(),
          updated_at: new Date()
        }]
      };
      
      (query as jest.Mock).mockResolvedValue(mockQueryResult);
      
      // Execute
      const result = await usersRepository.findByWalletAddress(walletAddress);
      
      // Assert
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM users WHERE wallet_address = $1'),
        [walletAddress]
      );
      
      expect(result).toEqual({
        id: 'user-123',
        username: 'testuser',
        walletAddress: 'wallet123',
        profileImage: null,
        reputationScore: 0,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });
    });
    
    it('should return null when user is not found by wallet address', async () => {
      // Setup
      const walletAddress = 'nonexistent-wallet';
      
      const mockQueryResult = {
        rows: []
      };
      
      (query as jest.Mock).mockResolvedValue(mockQueryResult);
      
      // Execute
      const result = await usersRepository.findByWalletAddress(walletAddress);
      
      // Assert
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM users WHERE wallet_address = $1'),
        [walletAddress]
      );
      
      expect(result).toBeNull();
    });
  });
  
  describe('updateProfile', () => {
    it('should update user profile data successfully', async () => {
      // Setup
      const userId = 'user-123';
      const updateData = {
        username: 'updatedUser',
        profileImage: 'profile-image-url'
      };
      
      const mockQueryResult = {
        rows: [{
          id: 'user-123',
          username: 'updatedUser',
          wallet_address: 'wallet123',
          profile_image: 'profile-image-url',
          reputation_score: '0',
          created_at: new Date(),
          updated_at: new Date()
        }]
      };
      
      (query as jest.Mock).mockResolvedValue(mockQueryResult);
      
      // Execute
      const result = await usersRepository.updateProfile(userId, updateData);
      
      // Assert
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users'),
        expect.arrayContaining([
          userId,
          updateData.username,
          updateData.profileImage
        ])
      );
      
      expect(result).toEqual({
        id: 'user-123',
        username: 'updatedUser',
        walletAddress: 'wallet123',
        profileImage: 'profile-image-url',
        reputationScore: 0,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });
    });
  });
  
  describe('updateReputationScore', () => {
    it('should update user reputation score', async () => {
      // Setup
      const userId = 'user-123';
      const newScore = 4.5;
      
      const mockQueryResult = {
        rows: [{
          id: 'user-123',
          username: 'testuser',
          wallet_address: 'wallet123',
          profile_image: null,
          reputation_score: '4.5',
          created_at: new Date(),
          updated_at: new Date()
        }]
      };
      
      (query as jest.Mock).mockResolvedValue(mockQueryResult);
      
      // Execute
      await usersRepository.updateReputationScore(userId, newScore);
      
      // Assert
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET reputation_score = $2'),
        expect.arrayContaining([userId, newScore])
      );
    });
  });
});
