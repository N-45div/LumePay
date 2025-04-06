import * as usersService from '../../src/services/users.service';
import * as usersRepository from '../../src/db/users.repository';
import { generateToken } from '../../src/utils/jwt';
import { BadRequestError, NotFoundError } from '../../src/utils/errors';

// Mock dependencies
jest.mock('../../src/db/users.repository');
jest.mock('../../src/utils/jwt');

describe('Users Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('authenticateUser', () => {
    it('should authenticate an existing user with wallet address', async () => {
      // Setup
      const walletAddress = 'wallet123';
      
      const existingUser = {
        id: 'user-123',
        username: 'testuser',
        walletAddress: 'wallet123',
        profileImage: null,
        reputationScore: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const token = 'jwt-token-123';
      
      (usersRepository.findByWalletAddress as jest.Mock).mockResolvedValue(existingUser);
      (generateToken as jest.Mock).mockReturnValue(token);
      
      // Execute
      const result = await usersService.authenticateUser(walletAddress);
      
      // Assert
      expect(usersRepository.findByWalletAddress).toHaveBeenCalledWith(walletAddress);
      expect(generateToken).toHaveBeenCalledWith({
        userId: existingUser.id,
        walletAddress: existingUser.walletAddress
      });
      
      expect(result).toEqual({
        user: existingUser,
        token
      });
    });
    
    it('should create a new user if wallet address not found', async () => {
      // Setup
      const walletAddress = 'new-wallet123';
      
      const newUser = {
        id: 'user-456',
        username: null,
        walletAddress: 'new-wallet123',
        profileImage: null,
        reputationScore: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const token = 'jwt-token-456';
      
      (usersRepository.findByWalletAddress as jest.Mock).mockResolvedValue(null);
      (usersRepository.create as jest.Mock).mockResolvedValue(newUser);
      (generateToken as jest.Mock).mockReturnValue(token);
      
      // Execute
      const result = await usersService.authenticateUser(walletAddress);
      
      // Assert
      expect(usersRepository.findByWalletAddress).toHaveBeenCalledWith(walletAddress);
      expect(usersRepository.create).toHaveBeenCalledWith(walletAddress);
      expect(generateToken).toHaveBeenCalledWith({
        userId: newUser.id,
        walletAddress: newUser.walletAddress
      });
      
      expect(result).toEqual({
        user: newUser,
        token
      });
    });
  });
  
  describe('getUserProfile', () => {
    it('should return a user profile by ID', async () => {
      // Setup
      const userId = 'user-123';
      
      const user = {
        id: 'user-123',
        username: 'testuser',
        walletAddress: 'wallet123',
        profileImage: 'profile.jpg',
        reputationScore: 4.5,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      (usersRepository.findById as jest.Mock).mockResolvedValue(user);
      
      // Execute
      const result = await usersService.getUserProfile(userId);
      
      // Assert
      expect(usersRepository.findById).toHaveBeenCalledWith(userId);
      expect(result).toEqual(user);
    });
    
    it('should throw NotFoundError if user not found', async () => {
      // Setup
      const userId = 'nonexistent-user';
      
      (usersRepository.findById as jest.Mock).mockResolvedValue(null);
      
      // Execute & Assert
      await expect(usersService.getUserProfile(userId)).rejects.toThrow(NotFoundError);
    });
  });
  
  describe('updateUserProfile', () => {
    it('should update user profile successfully', async () => {
      // Setup
      const userId = 'user-123';
      const updateData = {
        username: 'updatedUsername',
        profileImage: 'new-profile.jpg'
      };
      
      const existingUser = {
        id: 'user-123',
        username: 'testuser',
        walletAddress: 'wallet123',
        profileImage: 'old-profile.jpg',
        reputationScore: 4.5,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const updatedUser = {
        ...existingUser,
        username: 'updatedUsername',
        profileImage: 'new-profile.jpg'
      };
      
      (usersRepository.findById as jest.Mock).mockResolvedValue(existingUser);
      (usersRepository.updateProfile as jest.Mock).mockResolvedValue(updatedUser);
      
      // Execute
      const result = await usersService.updateUserProfile(userId, updateData);
      
      // Assert
      expect(usersRepository.findById).toHaveBeenCalledWith(userId);
      expect(usersRepository.updateProfile).toHaveBeenCalledWith(userId, updateData);
      expect(result).toEqual(updatedUser);
    });
    
    it('should throw NotFoundError if user not found', async () => {
      // Setup
      const userId = 'nonexistent-user';
      const updateData = {
        username: 'updatedUsername'
      };
      
      (usersRepository.findById as jest.Mock).mockResolvedValue(null);
      
      // Execute & Assert
      await expect(usersService.updateUserProfile(userId, updateData)).rejects.toThrow(NotFoundError);
      expect(usersRepository.updateProfile).not.toHaveBeenCalled();
    });
    
    it('should throw BadRequestError if username is too short', async () => {
      // Setup
      const userId = 'user-123';
      const updateData = {
        username: 'ab', // Less than 3 characters
        profileImage: 'new-profile.jpg'
      };
      
      const existingUser = {
        id: 'user-123',
        username: 'testuser',
        walletAddress: 'wallet123',
        profileImage: 'old-profile.jpg',
        reputationScore: 4.5,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      (usersRepository.findById as jest.Mock).mockResolvedValue(existingUser);
      
      // Execute & Assert
      await expect(usersService.updateUserProfile(userId, updateData)).rejects.toThrow(BadRequestError);
      expect(usersRepository.updateProfile).not.toHaveBeenCalled();
    });
  });
  
  describe('calculateReputationScore', () => {
    it('should return the reputation score for a user', async () => {
      // Setup
      const userId = 'user-123';
      
      const user = {
        id: 'user-123',
        username: 'testuser',
        walletAddress: 'wallet123',
        profileImage: 'profile.jpg',
        reputationScore: 4.5,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      (usersRepository.findById as jest.Mock).mockResolvedValue(user);
      
      // Execute
      const result = await usersService.calculateReputationScore(userId);
      
      // Assert
      expect(usersRepository.findById).toHaveBeenCalledWith(userId);
      expect(result).toEqual(4.5);
    });
    
    it('should throw NotFoundError if user not found', async () => {
      // Setup
      const userId = 'nonexistent-user';
      
      (usersRepository.findById as jest.Mock).mockResolvedValue(null);
      
      // Execute & Assert
      await expect(usersService.calculateReputationScore(userId)).rejects.toThrow(NotFoundError);
    });
  });
});
