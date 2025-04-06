import { Server } from 'http';
import { WebSocketService } from '../../src/services/websocket.service';
import { verifyToken } from '../../src/utils/jwt';
import { NotificationType } from '../../src/types';
import { Server as SocketIOServer } from 'socket.io';

// Mock dependencies
jest.mock('socket.io', () => {
  // Create a mock io server
  const mockIO: Record<string, any> = {
    use: jest.fn((fn, next): Record<string, any> => {
      if (next) next();
      return mockIO;
    }),
    on: jest.fn().mockReturnThis(),
    to: jest.fn().mockReturnThis(),
    emit: jest.fn().mockReturnThis()
  };
  
  return {
    Server: jest.fn().mockReturnValue(mockIO)
  };
});

jest.mock('../../src/utils/jwt', () => ({
  verifyToken: jest.fn().mockReturnValue({
    userId: 'user-123',
    walletAddress: 'wallet-123'
  })
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('WebSocketService', () => {
  let wsService: WebSocketService;
  let mockServer: Server;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset the singleton for each test
    // @ts-ignore: Accessing private property for testing
    WebSocketService['instance'] = undefined;
    
    // Create mock HTTP server
    mockServer = {} as Server;
    
    // Get singleton instance
    wsService = WebSocketService.getInstance();
  });
  
  describe('getInstance', () => {
    it('should return the same instance when called multiple times', () => {
      const instance1 = WebSocketService.getInstance();
      const instance2 = WebSocketService.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });
  
  describe('initialize', () => {
    it('should initialize socket.io server', () => {
      wsService.initialize(mockServer);
      expect(require('socket.io').Server).toHaveBeenCalledWith(mockServer, expect.any(Object));
    });
    
    it('should warn if already initialized', () => {
      const logger = require('../../src/utils/logger');
      
      // Initialize once
      wsService.initialize(mockServer);
      
      // Initialize again
      wsService.initialize(mockServer);
      
      expect(logger.warn).toHaveBeenCalledWith('WebSocket server already initialized');
    });
  });
  
  describe('sendNotification', () => {
    it('should emit notification to user room', () => {
      // Initialize WebSocket
      wsService.initialize(mockServer);
      
      // Set up test data
      const io = require('socket.io').Server() as SocketIOServer;
      // @ts-ignore: Accessing private property for testing
      wsService['io'] = io;
      // @ts-ignore: Accessing private property for testing
      wsService['userSockets'] = new Map([['user-123', new Set(['mock-socket-id'])]]);
      
      const notification = {
        id: 'notif-123',
        type: NotificationType.SYSTEM,
        message: 'Test notification',
        createdAt: new Date()
      };
      
      wsService.sendNotification('user-123', notification);
      
      expect(io.to).toHaveBeenCalledWith('user:user-123');
      expect(io.emit).toHaveBeenCalledWith('notification', notification);
    });
    
    it('should log warning if not initialized', () => {
      const logger = require('../../src/utils/logger');
      
      // Do not initialize WebSocket
      
      const notification = {
        id: 'notif-123',
        type: NotificationType.SYSTEM,
        message: 'Test notification',
        createdAt: new Date()
      };
      
      wsService.sendNotification('user-123', notification);
      
      expect(logger.warn).toHaveBeenCalledWith('WebSocket server not initialized');
    });
  });
  
  describe('broadcastNotification', () => {
    it('should emit notification to all users', () => {
      // Initialize WebSocket
      wsService.initialize(mockServer);
      
      // Set up test data
      const io = require('socket.io').Server() as SocketIOServer;
      // @ts-ignore: Accessing private property for testing
      wsService['io'] = io;
      
      const notification = {
        type: NotificationType.SYSTEM,
        message: 'Broadcast test'
      };
      
      wsService.broadcastNotification(notification);
      
      expect(io.emit).toHaveBeenCalledWith('notification', expect.objectContaining({
        type: NotificationType.SYSTEM,
        message: 'Broadcast test'
      }));
    });
  });
  
  describe('isUserConnected', () => {
    it('should return true if user is connected', () => {
      // Set up test data
      // @ts-ignore: Accessing private property for testing
      wsService['userSockets'] = new Map([['user-123', new Set(['mock-socket-id'])]]);
      
      expect(wsService.isUserConnected('user-123')).toBe(true);
    });
    
    it('should return false if user is not connected', () => {
      // Set up test data
      // @ts-ignore: Accessing private property for testing
      wsService['userSockets'] = new Map();
      
      expect(wsService.isUserConnected('user-123')).toBe(false);
    });
  });
  
  describe('getConnectedUsersCount', () => {
    it('should return the number of connected users', () => {
      // Start with empty map
      // @ts-ignore: Accessing private property for testing
      wsService['userSockets'] = new Map();
      expect(wsService.getConnectedUsersCount()).toBe(0);
      
      // Add a user
      // @ts-ignore: Accessing private property for testing
      wsService['userSockets'].set('user-123', new Set(['socket-123']));
      expect(wsService.getConnectedUsersCount()).toBe(1);
      
      // Add another user
      // @ts-ignore: Accessing private property for testing
      wsService['userSockets'].set('user-456', new Set(['socket-456']));
      expect(wsService.getConnectedUsersCount()).toBe(2);
    });
  });
});
