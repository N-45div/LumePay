import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, BadRequestError } from '../../utils/errors';
import * as notificationsService from '../../services/notifications.service';
import { NotificationType } from '../../types';
import logger from '../../utils/logger';

/**
 * Broadcast a system notification to all users
 */
export const broadcastNotification = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }
    
    // In a real application, you would check if the user has admin permissions
    // For now, we're just ensuring they're authenticated
    
    const { message, type = NotificationType.SYSTEM } = req.body;
    
    if (!message) {
      throw new BadRequestError('Message is required');
    }
    
    // Validate notification type
    if (!Object.values(NotificationType).includes(type)) {
      throw new BadRequestError(`Invalid notification type. Must be one of: ${Object.values(NotificationType).join(', ')}`);
    }
    
    // Broadcast the notification to all connected users
    await notificationsService.broadcastSystemNotification(message);
    
    logger.info(`Admin ${req.user.userId} broadcasted notification: ${message}`);
    
    res.status(200).json({
      success: true,
      data: { message: 'Notification broadcasted successfully' }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get system statistics
 */
export const getSystemStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }
    
    // In a real application, you would check if the user has admin permissions
    // and gather more comprehensive statistics from various services
    
    const wsService = require('../../services/websocket.service').WebSocketService.getInstance();
    const connectedUsers = wsService.getConnectedUsersCount();
    
    res.status(200).json({
      success: true,
      data: {
        connectedUsers,
        serverTime: new Date()
      }
    });
  } catch (error) {
    next(error);
  }
};
