import { Request, Response, NextFunction } from 'express';
import { NotFoundError, UnauthorizedError } from '../../utils/errors';
import * as notificationsService from '../../services/notifications.service';

/**
 * Get all notifications for a user
 */
export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }
    
    const userId = req.user.userId;
    const notifications = await notificationsService.getNotifications(userId);

    res.status(200).json({
      success: true,
      data: notifications
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get the count of unread notifications for a user
 */
export const getNotificationCount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }
    
    const userId = req.user.userId;
    const count = await notificationsService.getUnreadCount(userId);

    res.status(200).json({
      success: true,
      data: { count }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark a notification as read
 */
export const markAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }
    
    const userId = req.user.userId;
    const { id } = req.params;
    
    await notificationsService.markAsRead(id, userId);

    res.status(200).json({
      success: true,
      data: { message: 'Notification marked as read' }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark all notifications as read for a user
 */
export const markAllAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }
    
    const userId = req.user.userId;
    await notificationsService.markAllAsRead(userId);
    
    res.status(200).json({
      success: true,
      data: { message: 'All notifications marked as read' }
    });
  } catch (error) {
    next(error);
  }
};
