import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import config from '../../config';
import logger from '../../utils/logger';

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
});

export const runMigrations = async () => {
  try {
    logger.info('Running database migrations...');
    
    const schemaContent = fs.readFileSync(
      path.resolve(__dirname, '..', 'schema.sql'),
      'utf8'
    );
    
    await pool.query(schemaContent);
    
    logger.info('Database migrations completed successfully');
    return true;
  } catch (error) {
    logger.error('Error running migrations:', error);
    return false;
  } finally {
    await pool.end();
  }
};

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
