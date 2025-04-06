import { Request, Response } from 'express';
import * as usersController from '../../../src/api/controllers/users.controller';
import * as usersService from '../../../src/services/users.service';
import { generateToken } from '../../../src/utils/jwt';
import { BadRequestError, UnauthorizedError } from '../../../src/utils/errors';

// Mock dependencies
jest.mock('../../../src/services/users.service');
jest.mock('../../../src/utils/jwt');

describe('Users Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock;
  
  beforeEach(() => {
    mockRequest = {
      body: {},
      user: undefined
    };
    
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    mockNext = jest.fn();
    
    jest.clearAllMocks();
  });
  
  describe('authenticate', () => {
    it('should authenticate a new user successfully', async () => {
      // Setup
      mockRequest.body = {
        walletAddress: 'wallet123'
      };
      
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        walletAddress: 'wallet123',
        createdAt: new Date()
      };
      
      (usersService.authenticateUser as jest.Mock).mockResolvedValue({
        user: mockUser,
        token: 'mock-token'
      });
      
      // Execute
      await usersController.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(usersService.authenticateUser).toHaveBeenCalledWith('wallet123');
      
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          user: mockUser,
          token: 'mock-token'
        }
      });
    });
    
    it('should handle missing wallet address', async () => {
      // Setup
      mockRequest.body = {
        // Missing wallet address
      };
      
      // Execute
      await usersController.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(BadRequestError));
      expect(usersService.authenticateUser).not.toHaveBeenCalled();
    });
    
    it('should handle service errors', async () => {
      // Setup
      mockRequest.body = {
        walletAddress: 'wallet123'
      };
      
      const mockError = new Error('Service error');
      (usersService.authenticateUser as jest.Mock).mockRejectedValue(mockError);
      
      // Execute
      await usersController.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(mockError);
    });
  });
  
  describe('getProfile', () => {
    it('should return the user profile', async () => {
      // Setup
      mockRequest.user = {
        userId: 'user-123',
        walletAddress: 'wallet123'
      };
      
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        walletAddress: 'wallet123'
      };
      
      (usersService.getUserProfile as jest.Mock).mockResolvedValue(mockUser);
      
      // Execute
      await usersController.getProfile(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(usersService.getUserProfile).toHaveBeenCalledWith('user-123');
      
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { user: mockUser }
      });
    });
    
    it('should handle unauthenticated user', async () => {
      // Setup
      mockRequest.user = undefined;
      
      const mockError = new Error('User not authenticated');
      
      // Execute
      await usersController.getProfile(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(usersService.getUserProfile).not.toHaveBeenCalled();
    });
    
    it('should handle user not found', async () => {
      // Setup
      mockRequest.user = {
        userId: 'non-existent-user',
        walletAddress: 'wallet123'
      };
      
      (usersService.getUserProfile as jest.Mock).mockRejectedValue(
        new UnauthorizedError('User not found')
      );
      
      // Execute
      await usersController.getProfile(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });
  
  describe('updateProfile', () => {
    it('should update the user profile successfully', async () => {
      // Setup
      mockRequest.user = {
        userId: 'user-123',
        walletAddress: 'wallet123'
      };
      
      mockRequest.body = {
        username: 'updatedUser',
        profileImage: 'image-url'
      };
      
      const mockUpdatedUser = {
        id: 'user-123',
        username: 'updatedUser',
        email: 'test@example.com',
        walletAddress: 'wallet123',
        profileImage: 'image-url'
      };
      
      (usersService.updateUserProfile as jest.Mock).mockResolvedValue(mockUpdatedUser);
      
      // Execute
      await usersController.updateProfile(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(usersService.updateUserProfile).toHaveBeenCalledWith(
        'user-123',
        { username: 'updatedUser', profileImage: 'image-url' }
      );
      
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { user: mockUpdatedUser }
      });
    });
    
    it('should handle unauthenticated user', async () => {
      // Setup
      mockRequest.user = undefined;
      
      // Execute
      await usersController.updateProfile(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      
      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(usersService.updateUserProfile).not.toHaveBeenCalled();
    });
  });
});
