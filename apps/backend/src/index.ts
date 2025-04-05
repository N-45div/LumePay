import app from './app';
import config from './config';
import logger from './utils/logger';
import { connectRedis } from './utils/redis';
import { runMigrations } from './db/migrations';

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
    
    const server = app.listen(config.server.port, () => {
      logger.info(`Server running in ${config.server.env} mode on port ${config.server.port}`);
    });

    process.on('unhandledRejection', (err) => {
      logger.error('Unhandled rejection:', err);
      server.close(() => {
        process.exit(1);
      });
    });

    process.on('SIGTERM', () => {
      logger.info('SIGTERM received. Shutting down gracefully');
      server.close(() => {
        logger.info('Process terminated');
      });
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
