import * as notificationsRepository from '../db/notifications.repository';
import { Notification, NotificationType } from '../types';
import logger from '../utils/logger';
import { NotFoundError } from '../utils/errors';
import { WebSocketService } from './websocket.service';

/**
 * Get all notifications for a user
 */
export async function getNotifications(userId: string): Promise<Notification[]> {
  logger.info(`Getting notifications for user ${userId}`);
  return await notificationsRepository.getNotificationsByUserId(userId);
}

/**
 * Get count of unread notifications for a user
 */
export async function getUnreadCount(userId: string): Promise<number> {
  logger.info(`Getting unread notification count for user ${userId}`);
  return await notificationsRepository.getUnreadNotificationCount(userId);
}

/**
 * Mark a notification as read
 */
export async function markAsRead(id: string, userId: string): Promise<void> {
  logger.info(`Marking notification ${id} as read for user ${userId}`);
  const updated = await notificationsRepository.markNotificationAsRead(id, userId);
  
  if (!updated) {
    throw new NotFoundError(`Notification with id ${id} not found`);
  }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userId: string): Promise<void> {
  logger.info(`Marking all notifications as read for user ${userId}`);
  await notificationsRepository.markAllNotificationsAsRead(userId);
}

/**
 * Create a new notification
 */
export async function createNotification(
  userId: string,
  type: NotificationType,
  message: string
): Promise<Notification> {
  logger.info(`Creating ${type} notification for user ${userId}`);
  const notification = await notificationsRepository.createNotification({
    userId,
    type,
    message,
    isRead: false
  });

  // Send real-time notification if the user is connected
  try {
    const wsService = WebSocketService.getInstance();
    if (wsService.isUserConnected(userId)) {
      wsService.sendNotification(userId, notification);
    }
  } catch (error) {
    // Log the error but don't fail the notification creation
    logger.error(`Failed to send real-time notification to user ${userId}:`, error);
  }

  return notification;
}

/**
 * Create a transaction notification
 */
export async function createTransactionNotification(
  userId: string,
  message: string
): Promise<Notification> {
  return await createNotification(userId, NotificationType.TRANSACTION, message);
}

/**
 * Create an escrow notification
 */
export async function createEscrowNotification(
  userId: string,
  message: string
): Promise<Notification> {
  return await createNotification(userId, NotificationType.ESCROW, message);
}

/**
 * Create a listing notification
 */
export async function createListingNotification(
  userId: string,
  message: string
): Promise<Notification> {
  return await createNotification(userId, NotificationType.LISTING, message);
}

/**
 * Create a system notification
 */
export async function createSystemNotification(
  userId: string,
  message: string
): Promise<Notification> {
  return await createNotification(userId, NotificationType.SYSTEM, message);
}

/**
 * Create a dispute notification
 */
export async function createDisputeNotification(
  userId: string,
  message: string
): Promise<Notification> {
  return await createNotification(userId, NotificationType.DISPUTE, message);
}

/**
 * Create and broadcast a system notification to all users
 */
export async function broadcastSystemNotification(message: string): Promise<void> {
  logger.info(`Broadcasting system notification: ${message}`);
  
  try {
    // Send to all connected users via WebSocket
    const wsService = WebSocketService.getInstance();
    wsService.broadcastNotification({
      type: NotificationType.SYSTEM,
      message
    });
  } catch (error) {
    logger.error(`Failed to broadcast system notification:`, error);
  }
}
