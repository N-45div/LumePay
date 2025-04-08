import { query } from './index';
import { Notification, NotificationType } from '../types';
import { v4 as uuidv4 } from 'uuid';

// Type for database operations to match the database schema
interface DbNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  message: string;
  is_read: boolean;
  metadata?: Record<string, any>;
  created_at: Date;
}


function mapRowToNotification(row: DbNotification): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as NotificationType,
    message: row.message,
    isRead: row.is_read,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.created_at
  };
}

export async function createNotification(
  notification: { userId: string; type: NotificationType; message: string; isRead?: boolean; metadata?: Record<string, any> }
): Promise<Notification> {
  const { userId, type, message } = notification;
  const isRead = notification.isRead || false;
  const metadata = notification.metadata || null;
  
  const id = uuidv4();
  const createdAt = new Date();
  
  const result = await query(
    `INSERT INTO notifications (id, user_id, type, message, is_read, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [id, userId, type, message, isRead, metadata, createdAt]
  );
  
  return mapRowToNotification(result.rows[0]);
}

export async function getNotificationsByUserId(userId: string): Promise<Notification[]> {
  const result = await query(
    `SELECT * FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  
  return result.rows.map(mapRowToNotification);
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(*) FROM notifications
     WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
  
  return parseInt(result.rows[0].count);
}

export async function markNotificationAsRead(id: string, userId: string): Promise<boolean> {
  const result = await query(
    `UPDATE notifications
     SET is_read = true
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [id, userId]
  );
  
  return result.rows.length > 0;
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  await query(
    `UPDATE notifications
     SET is_read = true
     WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
}

export async function deleteNotification(id: string, userId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM notifications
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [id, userId]
  );

  return result.rows.length > 0;
}
