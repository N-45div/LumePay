import { Pool } from 'pg';
import dotenv from 'dotenv';
import config from '../config';
import logger from '../utils/logger';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `${config.database.host}:${config.database.port}/${config.database.name}?user=${config.database.user}&password=${config.database.password}`,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  logger.info('Database connection established');
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle database client', err);
  process.exit(-1);
});

export const query = async (text: string, params?: any[]) => {
  const client = await pool.connect();
  try {
    const start = Date.now();
    const res = await client.query(text, params);
    const duration = Date.now() - start;
    
    if (duration > 100) {
      logger.warn('Slow query:', { text, duration, rows: res.rowCount });
    }
    
    return res;
  } finally {
    client.release();
  }
};

export const getClient = async () => {
  const client = await pool.connect();
  const originalQuery = client.query;
  const originalRelease = client.release;
  
  const clientWithTracking = client as any;
  clientWithTracking.lastQuery = '';
  
  clientWithTracking.query = function (...args: any[]) {
    if (args.length > 0 && typeof args[0] === 'string') {
      clientWithTracking.lastQuery = args[0];
    }
    return originalQuery.apply(client, args as any);
  };
  
  const timeout = setTimeout(() => {
    logger.error('A client has been checked out for too long!');
    logger.error(`The last executed query was: ${clientWithTracking.lastQuery}`);
  }, 5000);
  
  clientWithTracking.release = () => {
    clearTimeout(timeout);
    return originalRelease.apply(client);
  };
  
  return clientWithTracking;
};

export default {
  query,
  getClient,
  pool,
};
