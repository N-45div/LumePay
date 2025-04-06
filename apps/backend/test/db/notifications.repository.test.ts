import * as notificationsRepository from '../../src/db/notifications.repository';
import { query } from '../../src/db';
import { NotificationType } from '../../src/types';

// Mock the database query function
jest.mock('../../src/db', () => ({
  query: jest.fn(),
}));

describe('Notifications Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createNotification', () => {
    it('should create a notification and return it', async () => {
      const mockNotification = {
        userId: 'user-123',
        type: NotificationType.SYSTEM,
        message: 'Test notification',
        isRead: false,
      };

      const mockReturn = {
        rows: [{
          id: 'notif-123',
          userId: 'user-123',
          type: NotificationType.SYSTEM,
          message: 'Test notification',
          isRead: false,
          createdAt: new Date(),
        }],
      };

      (query as jest.Mock).mockResolvedValue(mockReturn);

      const result = await notificationsRepository.createNotification(mockNotification);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        [mockNotification.userId, mockNotification.type, mockNotification.message, mockNotification.isRead]
      );
      expect(result).toEqual(mockReturn.rows[0]);
    });
  });

  describe('getNotificationsByUserId', () => {
    it('should return notifications for a user', async () => {
      const userId = 'user-123';
      const mockNotifications = [{
        id: 'notif-123',
        userId: 'user-123',
        type: NotificationType.SYSTEM,
        message: 'Test notification',
        isRead: false,
        createdAt: new Date(),
      }];

      (query as jest.Mock).mockResolvedValue({ rows: mockNotifications });

      const result = await notificationsRepository.getNotificationsByUserId(userId);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, user_id as "userId", type, message, is_read as "isRead", created_at as "createdAt"'),
        [userId]
      );
      expect(result).toEqual(mockNotifications);
    });
  });

  describe('getUnreadNotificationCount', () => {
    it('should return the count of unread notifications for a user', async () => {
      const userId = 'user-123';
      const count = 5;

      (query as jest.Mock).mockResolvedValue({ rows: [{ count }] });

      const result = await notificationsRepository.getUnreadNotificationCount(userId);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*) as count'),
        [userId]
      );
      expect(result).toEqual(count);
    });
  });

  describe('markNotificationAsRead', () => {
    it('should mark a notification as read and return true on success', async () => {
      const id = 'notif-123';
      const userId = 'user-123';

      (query as jest.Mock).mockResolvedValue({ rowCount: 1 });

      const result = await notificationsRepository.markNotificationAsRead(id, userId);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE notifications'),
        [id, userId]
      );
      expect(result).toBe(true);
    });

    it('should return false if no notification was updated', async () => {
      const id = 'notif-123';
      const userId = 'user-123';

      (query as jest.Mock).mockResolvedValue({ rowCount: 0 });

      const result = await notificationsRepository.markNotificationAsRead(id, userId);

      expect(result).toBe(false);
    });
  });

  describe('markAllNotificationsAsRead', () => {
    it('should mark all notifications as read and return true on success', async () => {
      const userId = 'user-123';

      (query as jest.Mock).mockResolvedValue({ rowCount: 5 });

      const result = await notificationsRepository.markAllNotificationsAsRead(userId);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE notifications'),
        [userId]
      );
      expect(result).toBe(true);
    });

    it('should return true even if no notifications were updated', async () => {
      const userId = 'user-123';

      (query as jest.Mock).mockResolvedValue({ rowCount: 0 });

      const result = await notificationsRepository.markAllNotificationsAsRead(userId);

      expect(result).toBe(false);
    });
  });

  describe('deleteNotification', () => {
    it('should delete a notification and return true on success', async () => {
      const id = 'notif-123';
      const userId = 'user-123';

      (query as jest.Mock).mockResolvedValue({ rowCount: 1 });

      const result = await notificationsRepository.deleteNotification(id, userId);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM notifications'),
        [id, userId]
      );
      expect(result).toBe(true);
    });

    it('should return false if no notification was deleted', async () => {
      const id = 'notif-123';
      const userId = 'user-123';

      (query as jest.Mock).mockResolvedValue({ rowCount: 0 });

      const result = await notificationsRepository.deleteNotification(id, userId);

      expect(result).toBe(false);
    });
  });
});
