import * as notificationsService from '../../src/services/notifications.service';
import * as notificationsRepository from '../../src/db/notifications.repository';
import { NotificationType } from '../../src/types';
import { NotFoundError } from '../../src/utils/errors';

// Mock the repository layer
jest.mock('../../src/db/notifications.repository');
// Mock the logger
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

describe('Notifications Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getNotifications', () => {
    it('should return notifications for a user', async () => {
      const userId = 'user-123';
      const mockNotifications = [
        {
          id: 'notif-1',
          userId,
          type: NotificationType.SYSTEM,
          message: 'Test notification 1',
          isRead: false,
          createdAt: new Date(),
        },
        {
          id: 'notif-2',
          userId,
          type: NotificationType.TRANSACTION,
          message: 'Test notification 2',
          isRead: true,
          createdAt: new Date(),
        },
      ];

      (notificationsRepository.getNotificationsByUserId as jest.Mock).mockResolvedValue(mockNotifications);

      const result = await notificationsService.getNotifications(userId);

      expect(notificationsRepository.getNotificationsByUserId).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockNotifications);
    });
  });

  describe('getUnreadCount', () => {
    it('should return the count of unread notifications', async () => {
      const userId = 'user-123';
      const unreadCount = 5;

      (notificationsRepository.getUnreadNotificationCount as jest.Mock).mockResolvedValue(unreadCount);

      const result = await notificationsService.getUnreadCount(userId);

      expect(notificationsRepository.getUnreadNotificationCount).toHaveBeenCalledWith(userId);
      expect(result).toBe(unreadCount);
    });
  });

  describe('markAsRead', () => {
    it('should mark a notification as read', async () => {
      const notificationId = 'notif-123';
      const userId = 'user-123';

      (notificationsRepository.markNotificationAsRead as jest.Mock).mockResolvedValue(true);

      await notificationsService.markAsRead(notificationId, userId);

      expect(notificationsRepository.markNotificationAsRead).toHaveBeenCalledWith(notificationId, userId);
    });

    it('should throw NotFoundError if notification does not exist', async () => {
      const notificationId = 'notif-123';
      const userId = 'user-123';

      (notificationsRepository.markNotificationAsRead as jest.Mock).mockResolvedValue(false);

      await expect(notificationsService.markAsRead(notificationId, userId))
        .rejects.toThrow(NotFoundError);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', async () => {
      const userId = 'user-123';

      (notificationsRepository.markAllNotificationsAsRead as jest.Mock).mockResolvedValue(true);

      await notificationsService.markAllAsRead(userId);

      expect(notificationsRepository.markAllNotificationsAsRead).toHaveBeenCalledWith(userId);
    });
  });

  describe('createNotification', () => {
    it('should create a new notification', async () => {
      const userId = 'user-123';
      const type = NotificationType.SYSTEM;
      const message = 'Test notification';
      
      const mockNotification = {
        id: 'notif-123',
        userId,
        type,
        message,
        isRead: false,
        createdAt: new Date(),
      };

      (notificationsRepository.createNotification as jest.Mock).mockResolvedValue(mockNotification);

      const result = await notificationsService.createNotification(userId, type, message);

      expect(notificationsRepository.createNotification).toHaveBeenCalledWith({
        userId,
        type,
        message,
        isRead: false,
      });
      expect(result).toEqual(mockNotification);
    });
  });

  describe('createTransactionNotification', () => {
    it('should create a transaction notification', async () => {
      const userId = 'user-123';
      const message = 'Transaction completed';
      
      const mockNotification = {
        id: 'notif-123',
        userId,
        type: NotificationType.TRANSACTION,
        message,
        isRead: false,
        createdAt: new Date(),
      };

      (notificationsRepository.createNotification as jest.Mock).mockResolvedValue(mockNotification);

      const result = await notificationsService.createTransactionNotification(userId, message);

      expect(notificationsRepository.createNotification).toHaveBeenCalledWith({
        userId,
        type: NotificationType.TRANSACTION,
        message,
        isRead: false,
      });
      expect(result).toEqual(mockNotification);
    });
  });

  describe('createEscrowNotification', () => {
    it('should create an escrow notification', async () => {
      const userId = 'user-123';
      const message = 'Escrow created';
      
      const mockNotification = {
        id: 'notif-123',
        userId,
        type: NotificationType.ESCROW,
        message,
        isRead: false,
        createdAt: new Date(),
      };

      (notificationsRepository.createNotification as jest.Mock).mockResolvedValue(mockNotification);

      const result = await notificationsService.createEscrowNotification(userId, message);

      expect(notificationsRepository.createNotification).toHaveBeenCalledWith({
        userId,
        type: NotificationType.ESCROW,
        message,
        isRead: false,
      });
      expect(result).toEqual(mockNotification);
    });
  });

  describe('createListingNotification', () => {
    it('should create a listing notification', async () => {
      const userId = 'user-123';
      const message = 'Listing created';
      
      const mockNotification = {
        id: 'notif-123',
        userId,
        type: NotificationType.LISTING,
        message,
        isRead: false,
        createdAt: new Date(),
      };

      (notificationsRepository.createNotification as jest.Mock).mockResolvedValue(mockNotification);

      const result = await notificationsService.createListingNotification(userId, message);

      expect(notificationsRepository.createNotification).toHaveBeenCalledWith({
        userId,
        type: NotificationType.LISTING,
        message,
        isRead: false,
      });
      expect(result).toEqual(mockNotification);
    });
  });

  describe('createSystemNotification', () => {
    it('should create a system notification', async () => {
      const userId = 'user-123';
      const message = 'System maintenance';
      
      const mockNotification = {
        id: 'notif-123',
        userId,
        type: NotificationType.SYSTEM,
        message,
        isRead: false,
        createdAt: new Date(),
      };

      (notificationsRepository.createNotification as jest.Mock).mockResolvedValue(mockNotification);

      const result = await notificationsService.createSystemNotification(userId, message);

      expect(notificationsRepository.createNotification).toHaveBeenCalledWith({
        userId,
        type: NotificationType.SYSTEM,
        message,
        isRead: false,
      });
      expect(result).toEqual(mockNotification);
    });
  });

  describe('createDisputeNotification', () => {
    it('should create a dispute notification', async () => {
      const userId = 'user-123';
      const message = 'Dispute opened';
      
      const mockNotification = {
        id: 'notif-123',
        userId,
        type: NotificationType.DISPUTE,
        message,
        isRead: false,
        createdAt: new Date(),
      };

      (notificationsRepository.createNotification as jest.Mock).mockResolvedValue(mockNotification);

      const result = await notificationsService.createDisputeNotification(userId, message);

      expect(notificationsRepository.createNotification).toHaveBeenCalledWith({
        userId,
        type: NotificationType.DISPUTE,
        message,
        isRead: false,
      });
      expect(result).toEqual(mockNotification);
    });
  });
});
