// apps/backend/src/db/verify-database.ts
import { Client } from 'pg';
import 'dotenv/config';

async function verifyDatabase() {
    const client = new Client({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: 'postgres' // Connect to default database first
    });

    try {
        await client.connect();
        console.log('Successfully connected to PostgreSQL');

        // Check if our database exists
        const result = await client.query(`
            SELECT datname FROM pg_database 
            WHERE datname = $1
        `, [process.env.DB_NAME]);

        if (result.rows.length === 0) {
            console.log(`Database ${process.env.DB_NAME} does not exist, creating it...`);
            // Create the database if it doesn't exist
            await client.query(`CREATE DATABASE ${process.env.DB_NAME}`);
            console.log(`Database ${process.env.DB_NAME} created successfully`);
        } else {
            console.log(`Database ${process.env.DB_NAME} already exists`);
        }

    } catch (error) {
        console.error('Database verification failed:', error);
    } finally {
        await client.end();
    }
}

verifyDatabase().catch(console.error);