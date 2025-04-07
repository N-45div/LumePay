import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, BadRequestError } from '../../utils/errors';
import * as notificationsService from '../../services/notifications.service';
import * as adminService from '../../services/admin.service';
import { NotificationType, DisputeStatus, ListingStatus } from '../../types';
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
    
    // Get WebSocket connection stats
    const wsService = require('../../services/websocket.service').WebSocketService.getInstance();
    const connectedUsers = wsService.getConnectedUsersCount();
    
    // Get marketplace statistics
    const marketplaceStats = await adminService.getMarketplaceStats();
    
    // Get system health
    const healthMetrics = await adminService.getSystemHealth();
    
    res.status(200).json({
      success: true,
      data: {
        marketplace: marketplaceStats,
        health: healthMetrics,
        realtime: {
          connectedUsers,
          serverTime: new Date()
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get pending disputes
 */
export const getPendingDisputes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const result = await adminService.getPendingDisputes(limit, offset);
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get recent transactions
 */
export const getRecentTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const transactions = await adminService.getRecentTransactions(limit, offset);
    
    res.status(200).json({
      success: true,
      data: transactions
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get flagged listings
 */
export const getFlaggedListings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const listings = await adminService.getFlaggedListings(limit, offset);
    
    res.status(200).json({
      success: true,
      data: listings
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Suspend a listing
 */
export const suspendListing = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user!.userId;
    
    if (!reason) {
      throw new BadRequestError('Reason for suspension is required');
    }
    
    const listing = await adminService.suspendListing(id, reason, adminId);
    
    res.status(200).json({
      success: true,
      data: listing
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Suspend a user
 */
export const suspendUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user!.userId;
    
    if (!reason) {
      throw new BadRequestError('Reason for suspension is required');
    }
    
    const user = await adminService.suspendUser(id, reason, adminId);
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};
