// apps/backend/src/db/test-connection.ts
import { AppDataSource } from './index';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import 'dotenv/config';

async function testConnection() {
    console.log('Starting database connection test...');
    console.log('Node environment:', process.env.NODE_ENV);
    
    try {
        // Log environment variables (safely)
        console.log('Environment variables loaded:', {
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            database: process.env.DB_NAME,
            username: process.env.DB_USERNAME,
            hasPassword: !!process.env.DB_PASSWORD,
            nodeEnv: process.env.NODE_ENV
        });

        console.log('Initializing database connection...');
        await AppDataSource.initialize();
        console.log('Successfully connected to database');
        
        const options = AppDataSource.options as PostgresConnectionOptions;
        
        // Log connection details (excluding sensitive information)
        console.log('Active database configuration:', {
            type: options.type,
            host: options.host,
            port: options.port,
            database: options.database,
            username: options.username,
            hasPassword: !!options.password,
            synchronize: options.synchronize,
            entitiesLoaded: Array.isArray(options.entities) ? options.entities.length : 'not an array'
        });

        // Test with a simple query
        console.log('Testing query execution...');
        const result = await AppDataSource.query('SELECT CURRENT_TIMESTAMP');
        console.log('Query result:', result);

    } catch (error) {
        console.error('Database connection failed:', error);
        
        if (error instanceof Error) {
            console.error('Detailed error information:', {
                message: error.message,
                name: error.name,
                stack: error.stack,
                // Additional properties that might help diagnose the issue
                code: (error as any).code,
                errno: (error as any).errno,
                syscall: (error as any).syscall
            });
        }
    } finally {
        if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
            console.log('Database connection closed');
        }
    }
}

// Add proper error handling for the whole process
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

testConnection().catch(error => {
    console.error('Fatal error in test connection:', error);
    process.exit(1);
});