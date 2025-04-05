import { Request, Response, NextFunction } from 'express';
import { NotFoundError, UnauthorizedError } from '../../utils/errors';

/**
 * Get all notifications for a user
 */
export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }
    
    const userId = req.user.userId;
    
    const notifications = [
      {
        id: '1',
        userId,
        type: 'TRANSACTION',
        message: 'Your escrow transaction has been completed',
        isRead: false,
        createdAt: new Date(Date.now() - 3600000)
      },
      {
        id: '2',
        userId,
        type: 'SYSTEM',
        message: 'Welcome to Lumesquare P2P marketplace',
        isRead: true,
        createdAt: new Date(Date.now() - 86400000)
      }
    ];

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
    
    const count = 1;

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
    
    const { id } = req.params;
    
    if (id !== '1' && id !== '2') {
      throw new NotFoundError(`Notification with id ${id} not found`);
    }

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
    
    res.status(200).json({
      success: true,
      data: { message: 'All notifications marked as read' }
    });
  } catch (error) {
    next(error);
  }
};
