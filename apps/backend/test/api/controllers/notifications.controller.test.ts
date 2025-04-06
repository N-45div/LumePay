import { Request, Response } from 'express';
import { 
  getNotifications, 
  getNotificationCount, 
  markAsRead, 
  markAllAsRead 
} from '../../../src/api/controllers/notifications.controller';
import * as notificationsService from '../../../src/services/notifications.service';
import { UnauthorizedError, NotFoundError } from '../../../src/utils/errors';
import { NotificationType } from '../../../src/types';

// Mock the notifications service
jest.mock('../../../src/services/notifications.service');

describe('Notifications Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockRequest = {
      user: {
        userId: 'user-123',
        walletAddress: 'wallet-123'
      },
      params: {}
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('getNotifications', () => {
    it('should return notifications for the authenticated user', async () => {
      const mockNotifications = [
        {
          id: 'notif-1',
          userId: 'user-123',
          type: NotificationType.SYSTEM,
          message: 'Test notification 1',
          isRead: false,
          createdAt: new Date()
        }
      ];

      (notificationsService.getNotifications as jest.Mock).mockResolvedValue(mockNotifications);

      await getNotifications(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(notificationsService.getNotifications).toHaveBeenCalledWith('user-123');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockNotifications
      });
    });

    it('should call next with UnauthorizedError if user is not authenticated', async () => {
      mockRequest.user = undefined;

      await getNotifications(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(UnauthorizedError));
      expect(notificationsService.getNotifications).not.toHaveBeenCalled();
    });

    it('should call next with error if service throws an error', async () => {
      const error = new Error('Service error');
      (notificationsService.getNotifications as jest.Mock).mockRejectedValue(error);

      await getNotifications(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getNotificationCount', () => {
    it('should return the unread notification count', async () => {
      const count = 5;
      (notificationsService.getUnreadCount as jest.Mock).mockResolvedValue(count);

      await getNotificationCount(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(notificationsService.getUnreadCount).toHaveBeenCalledWith('user-123');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { count }
      });
    });

    it('should call next with UnauthorizedError if user is not authenticated', async () => {
      mockRequest.user = undefined;

      await getNotificationCount(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(UnauthorizedError));
      expect(notificationsService.getUnreadCount).not.toHaveBeenCalled();
    });
  });

  describe('markAsRead', () => {
    it('should mark a notification as read', async () => {
      mockRequest.params = { id: 'notif-123' };
      
      await markAsRead(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(notificationsService.markAsRead).toHaveBeenCalledWith('notif-123', 'user-123');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { message: 'Notification marked as read' }
      });
    });

    it('should call next with UnauthorizedError if user is not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { id: 'notif-123' };

      await markAsRead(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(UnauthorizedError));
      expect(notificationsService.markAsRead).not.toHaveBeenCalled();
    });

    it('should call next with error if service throws NotFoundError', async () => {
      mockRequest.params = { id: 'non-existent-id' };
      const error = new NotFoundError('Notification not found');
      (notificationsService.markAsRead as jest.Mock).mockRejectedValue(error);

      await markAsRead(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', async () => {
      await markAllAsRead(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(notificationsService.markAllAsRead).toHaveBeenCalledWith('user-123');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { message: 'All notifications marked as read' }
      });
    });

    it('should call next with UnauthorizedError if user is not authenticated', async () => {
      mockRequest.user = undefined;

      await markAllAsRead(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(UnauthorizedError));
      expect(notificationsService.markAllAsRead).not.toHaveBeenCalled();
    });
  });
});
