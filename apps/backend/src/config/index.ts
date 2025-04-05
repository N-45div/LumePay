import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const requiredEnvVars = [
  'PORT',
  'NODE_ENV',
  'POSTGRES_HOST',
  'POSTGRES_PORT',
  'POSTGRES_DB',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'JWT_SECRET',
];

requiredEnvVars.forEach((envVar) => {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
});

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10) as number,
    env: process.env.NODE_ENV || 'development' as string,
  },
  database: {
    host: process.env.POSTGRES_HOST as string,
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10) as number,
    name: process.env.POSTGRES_DB as string,
    user: process.env.POSTGRES_USER as string,
    password: process.env.POSTGRES_PASSWORD as string,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost' as string,
    port: parseInt(process.env.REDIS_PORT || '6379', 10) as number,
    password: process.env.REDIS_PASSWORD || '' as string,
  },
  jwt: {
    secret: process.env.JWT_SECRET as string,
    expiresIn: process.env.JWT_EXPIRES_IN || '1d' as string,
  },
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com' as string,
    network: process.env.SOLANA_NETWORK || 'devnet' as string,
    walletPrivateKey: process.env.WALLET_PRIVATE_KEY || '' as string,
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info' as string,
  },
};

export default config;
