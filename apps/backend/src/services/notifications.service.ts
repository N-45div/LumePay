import * as notificationsRepository from '../db/notifications.repository';
import { Notification, NotificationType } from '../types';
import logger from '../utils/logger';
import { NotFoundError } from '../utils/errors';
import { WebSocketService } from './websocket.service';

export async function getNotifications(userId: string): Promise<Notification[]> {
  logger.info(`Getting notifications for user ${userId}`);
  return await notificationsRepository.getNotificationsByUserId(userId);
}

export async function getUnreadCount(userId: string): Promise<number> {
  logger.info(`Getting unread notification count for user ${userId}`);
  return await notificationsRepository.getUnreadNotificationCount(userId);
}

export async function markAsRead(id: string, userId: string): Promise<void> {
  logger.info(`Marking notification ${id} as read for user ${userId}`);
  const updated = await notificationsRepository.markNotificationAsRead(id, userId);
  
  if (!updated) {
    throw new NotFoundError(`Notification with id ${id} not found`);
  }
}

export async function markAllAsRead(userId: string): Promise<void> {
  logger.info(`Marking all notifications as read for user ${userId}`);
  await notificationsRepository.markAllNotificationsAsRead(userId);
}

export async function createNotification(
  userId: string,
  type: NotificationType,
  message: string,
  metadata?: Record<string, any>
): Promise<Notification> {
  logger.info(`Creating ${type} notification for user ${userId}`);
  const notification = await notificationsRepository.createNotification({
    userId,
    type,
    message,
    isRead: false,
    metadata: metadata ? { ...metadata } : undefined
  });

  try {
    const wsService = WebSocketService.getInstance();
    if (wsService.isUserConnected(userId)) {
      wsService.sendNotification(userId, notification);
    }
  } catch (error) {
    logger.error(`Failed to send real-time notification to user ${userId}:`, error);
  }

  return notification;
}

export async function createTransactionNotification(
  userId: string,
  message: string,
  metadata?: Record<string, any>
): Promise<Notification> {
  return await createNotification(userId, NotificationType.TRANSACTION, message, metadata);
}

export async function createEscrowNotification(
  userId: string,
  message: string,
  metadata?: Record<string, any>
): Promise<Notification> {
  return await createNotification(userId, NotificationType.ESCROW, message, metadata);
}

export async function createListingNotification(
  userId: string,
  message: string,
  metadata?: Record<string, any>
): Promise<Notification> {
  return await createNotification(userId, NotificationType.LISTING, message, metadata);
}

export async function createSystemNotification(
  userId: string,
  message: string,
  metadata?: Record<string, any>
): Promise<Notification> {
  return await createNotification(userId, NotificationType.SYSTEM, message, metadata);
}

export async function createDisputeNotification(
  userId: string,
  message: string,
  metadata?: Record<string, any>
): Promise<Notification> {
  return await createNotification(userId, NotificationType.DISPUTE, message, metadata);
}

export async function createReputationNotification(
  userId: string,
  message: string,
  metadata?: Record<string, any>
): Promise<Notification> {
  return await createNotification(userId, 'reputation' as NotificationType, message, metadata);
}

export async function broadcastSystemNotification(message: string): Promise<void> {
  logger.info(`Broadcasting system notification: ${message}`);
  
  try {
    const wsService = WebSocketService.getInstance();
    wsService.broadcastNotification({
      type: NotificationType.SYSTEM,
      message
    });
  } catch (error) {
    logger.error(`Failed to broadcast system notification:`, error);
  }
}
