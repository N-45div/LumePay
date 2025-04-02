import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { join } from 'path';
dotenv.config();
import { Transaction } from '../db/models/transaction.entity';
import { BankAccount } from '../db/models/bank-account.entity';
const getSslConfig = () => {
  if (process.env.DB_SSL === 'true') {
    const sslConfig: any = { rejectUnauthorized: false };
    if (process.env.DB_SSL_CA) {
      sslConfig.ca = fs.readFileSync(process.env.DB_SSL_CA).toString();
    }
    if (process.env.DB_SSL_KEY) {
      sslConfig.key = fs.readFileSync(process.env.DB_SSL_KEY).toString();
    }
    if (process.env.DB_SSL_CERT) {
      sslConfig.cert = fs.readFileSync(process.env.DB_SSL_CERT).toString();
    }
    return sslConfig;
  }
  return false;
};
export const getDatabaseConfig = (): TypeOrmModuleOptions => {
  return {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'solanahack',
    schema: process.env.DB_SCHEMA || 'public',
    ssl: getSslConfig(),
    entities: [
      Transaction,
      BankAccount,
    ],
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.NODE_ENV !== 'production',
    migrations: process.env.NODE_ENV === 'production' ? [join(__dirname, '../migrations/*.{ts,js}')] : [],
    migrationsRun: process.env.NODE_ENV === 'production',
    extra: {
      max: 20, // Maximum number of clients in the pool
      connectionTimeoutMillis: 10000, // Maximum time to wait for connection (10 seconds)
      idleTimeoutMillis: 60000, // Time a client can remain idle before being closed (1 minute)
    },
  };
};
export default getDatabaseConfig();
