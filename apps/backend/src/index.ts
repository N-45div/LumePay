import app from './app';
import config from './config';
import logger from './utils/logger';
import { connectRedis } from './utils/redis';
import { runMigrations } from './db/migrations';
import { WebSocketService } from './services/websocket.service';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { errorHandler } from './api/middleware/error-handler';
import performanceMonitor from './middleware/performance-monitor';

const startServer = async () => {
  try {
    logger.info('Initializing server...');

    logger.info('Running database migrations...');
    const migrationsSuccess = await runMigrations();
    if (!migrationsSuccess) {
      logger.warn('Database migrations had issues - proceeding with caution');
    }

    logger.info('Connecting to Redis...');
    const redisConnected = await connectRedis();
    if (!redisConnected) {
      logger.warn('Redis connection failed - proceeding with limited functionality');
    }
 
    const httpServer = createServer(app);
    
    app.use(helmet());
    app.use(cors());
    app.use(compression());
    app.use(express.json());
    app.use(performanceMonitor);
    
    logger.info('Initializing WebSocket service...');
    const wsService = WebSocketService.getInstance();
    wsService.initialize(httpServer);
    
    httpServer.listen(config.server.port, () => {
      logger.info(`Server running in ${config.server.env} mode on port ${config.server.port}`);
    });
    httpServer.listen(config.server.port, () => {
      logger.info(`Server running in ${config.server.env} mode on port ${config.server.port}`);
    });

    process.on('unhandledRejection', (err) => {
      logger.error('Unhandled rejection:', err);
      httpServer.close(() => {
        process.exit(1);
      });
    });

    process.on('SIGTERM', () => {
      logger.info('SIGTERM received. Shutting down gracefully');
      httpServer.close(() => {
        logger.info('Process terminated');
      });
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
