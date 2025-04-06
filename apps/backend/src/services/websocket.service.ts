import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import logger from '../utils/logger';
import { verifyToken } from '../utils/jwt';
import { NotificationType } from '../types';

export class WebSocketService {
  private static instance: WebSocketService;
  private io: Server | null = null;
  private userSockets: Map<string, Set<string>> = new Map();

  private constructor() {}

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  /**
   * Initialize the WebSocket server
   * @param httpServer The HTTP server to attach the WebSocket server to
   */
  public initialize(httpServer: HttpServer): void {
    if (this.io) {
      logger.warn('WebSocket server already initialized');
      return;
    }

    this.io = new Server(httpServer, {
      cors: {
        origin: '*', // In production, this should be more restrictive
        methods: ['GET', 'POST']
      }
    });

    this.io.use((socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        
        if (!token) {
          return next(new Error('Authentication error'));
        }

        const decoded = verifyToken(token);
        
        // Add user data to socket
        socket.data.userId = decoded.userId;
        socket.data.walletAddress = decoded.walletAddress;
        
        next();
      } catch (error) {
        next(new Error('Authentication error'));
      }
    });

    this.io.on('connection', this.handleConnection.bind(this));
    
    logger.info('WebSocket server initialized');
  }

  /**
   * Handle new socket connections
   * @param socket The connected socket
   */
  private handleConnection(socket: Socket): void {
    const userId = socket.data.userId;
    const socketId = socket.id;

    logger.info(`User ${userId} connected with socket ${socketId}`);

    // Store socket ID for this user
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)?.add(socketId);

    // Join user-specific room
    socket.join(`user:${userId}`);

    // Handle events
    socket.on('disconnect', () => {
      logger.info(`User ${userId} disconnected from socket ${socketId}`);
      this.userSockets.get(userId)?.delete(socketId);
      if (this.userSockets.get(userId)?.size === 0) {
        this.userSockets.delete(userId);
      }
    });
  }

  /**
   * Send a notification to a specific user
   * @param userId The ID of the user to send the notification to
   * @param notification The notification to send
   */
  public sendNotification(userId: string, notification: {
    id: string;
    type: NotificationType;
    message: string;
    createdAt: Date;
  }): void {
    if (!this.io) {
      logger.warn('WebSocket server not initialized');
      return;
    }

    // Send to all sockets in the user's room
    this.io.to(`user:${userId}`).emit('notification', notification);
    logger.info(`Notification sent to user ${userId}: ${notification.message}`);
  }

  /**
   * Send a notification to all connected users
   * @param notification The notification to send
   */
  public broadcastNotification(notification: {
    type: NotificationType;
    message: string;
  }): void {
    if (!this.io) {
      logger.warn('WebSocket server not initialized');
      return;
    }

    this.io.emit('notification', {
      ...notification,
      id: `broadcast-${Date.now()}`,
      createdAt: new Date()
    });
    logger.info(`Broadcast notification sent: ${notification.message}`);
  }

  /**
   * Get the number of connected users
   */
  public getConnectedUsersCount(): number {
    return this.userSockets.size;
  }

  /**
   * Check if a user is connected
   * @param userId The ID of the user to check
   */
  public isUserConnected(userId: string): boolean {
    return this.userSockets.has(userId) && (this.userSockets.get(userId)?.size || 0) > 0;
  }
}
