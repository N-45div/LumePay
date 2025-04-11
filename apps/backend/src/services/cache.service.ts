import { createClient } from 'redis';
import logger from '../utils/logger';

interface CacheOptions {
  ttl?: number;
}

class CacheService {
  private client: ReturnType<typeof createClient>;
  private isConnected = false;
  private defaultTTL = 3600; // 1 hour default TTL

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = createClient({
      url: redisUrl
    });

    this.client.on('error', (err) => {
      logger.error('Redis client error:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      logger.info('Redis client connected');
      this.isConnected = true;
    });

    this.connect();
  }

  private async connect() {
    try {
      await this.client.connect();
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected) return null;

    try {
      const data = await this.client.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error) {
      logger.error(`Error getting data from cache for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: any, options: CacheOptions = {}): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      const ttl = options.ttl || this.defaultTTL;
      await this.client.set(key, JSON.stringify(value), { EX: ttl });
      return true;
    } catch (error) {
      logger.error(`Error setting data in cache for key ${key}:`, error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error(`Error deleting data from cache for key ${key}:`, error);
      return false;
    }
  }

  async flush(): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      await this.client.flushAll();
      return true;
    } catch (error) {
      logger.error('Error flushing cache:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) return;

    try {
      await this.client.disconnect();
      this.isConnected = false;
      logger.info('Redis client disconnected');
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error);
    }
  }
}

export const cacheService = new CacheService();
export default cacheService;
