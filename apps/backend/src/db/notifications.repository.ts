import { query } from './index';
import { Notification } from '../types';

export async function createNotification(notification: Omit<Notification, 'id' | 'createdAt'>): Promise<Notification> {
  const { userId, type, message, isRead = false } = notification;
  
  const result = await query(
    `INSERT INTO notifications (user_id, type, message, is_read) 
     VALUES ($1, $2, $3, $4) 
     RETURNING id, user_id as "userId", type, message, is_read as "isRead", created_at as "createdAt"`,
    [userId, type, message, isRead]
  );

  return result.rows[0];
}

export async function getNotificationsByUserId(userId: string): Promise<Notification[]> {
  const result = await query(
    `SELECT id, user_id as "userId", type, message, is_read as "isRead", created_at as "createdAt"
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows;
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(*) as count
     FROM notifications
     WHERE user_id = $1 AND is_read = false`,
    [userId]
  );

  return parseInt(result.rows[0].count, 10);
}

export async function markNotificationAsRead(id: string, userId: string): Promise<boolean> {
  const result = await query(
    `UPDATE notifications
     SET is_read = true
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [id, userId]
  );

  return result.rowCount ? result.rowCount > 0 : false;
}

export async function markAllNotificationsAsRead(userId: string): Promise<boolean> {
  const result = await query(
    `UPDATE notifications
     SET is_read = true
     WHERE user_id = $1 AND is_read = false`,
    [userId]
  );

  return result.rowCount ? result.rowCount > 0 : false;
}

export async function deleteNotification(id: string, userId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM notifications
     WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  return result.rowCount ? result.rowCount > 0 : false;
}
