// apps/backend/src/db/datasource.ts
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config();

// Use process.cwd() which works in both environments
const rootDir = process.cwd();
const entitiesPath = path.join(rootDir, 'dist', 'db', 'models', '*.entity.js');
const migrationsPath = path.join(rootDir, 'dist', 'db', 'migrations', '*.js');

// Create and export data source
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '.Joseph23',
  database: process.env.DB_DATABASE || 'solanahack',
  schema: process.env.DB_SCHEMA || 'public',
  entities: [entitiesPath],
  migrations: [migrationsPath],
  synchronize: false,
  logging: true
});

// For CLI commands
export default AppDataSource;
