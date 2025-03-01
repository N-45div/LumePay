import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: join(__dirname, '../../../.env') });

export function getDatabaseConfig(): PostgresConnectionOptions {
    const requiredEnvVars = ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_NAME'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    return {
        type: 'postgres',
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        entities: [join(__dirname, '../models/**/*.entity{.ts,.js}')],
        migrations: [join(__dirname, '../migrations/**/*{.ts,.js}')],
        // In development, keep synchronize true for now, but will change this later
        synchronize: process.env.NODE_ENV === 'development',
        logging: process.env.NODE_ENV === 'development'
    };
}