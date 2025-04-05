import { Pool } from 'pg';
import config from '../config';
import logger from '../utils/logger';

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  logger.info('Connected to PostgreSQL database');
});

pool.on('error', (err: Error) => {
  logger.error('PostgreSQL connection error:', err);
});

export const query = async (text: string, params?: any[]) => {
  try {
    const start = Date.now();
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      logger.warn(`Slow query (${duration}ms): ${text}`);
    }
    
    return result;
  } catch (error) {
    logger.error('Database query error:', error);
    throw error;
  }
};

export const getClient = async () => {
  const client = await pool.connect();
  return client;
};

export default { query, getClient };
