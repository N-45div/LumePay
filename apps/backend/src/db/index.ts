import { DataSource } from 'typeorm';
import { getDatabaseConfig } from './config/database.config';

export const AppDataSource = new DataSource(getDatabaseConfig());

export * from './models';
export * from './repositories';

export const initializeDatabase = async (): Promise<DataSource> => {
    try {
        const dataSource = await AppDataSource.initialize();
        console.log('Database connection initialized');
        return dataSource;
    } catch (error) {
        console.error('Error initializing database connection:', error);
        throw error;
    }
};