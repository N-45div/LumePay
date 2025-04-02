const { Client } = require('pg');
require('dotenv').config();
async function testConnection() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '.Joseph23',
    database: process.env.DB_DATABASE || 'solanahack',
  });
  try {
    console.log('Connecting to PostgreSQL database...');
    console.log(`Host: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`Port: ${process.env.DB_PORT || '5432'}`);
    console.log(`User: ${process.env.DB_USERNAME || 'postgres'}`);
    console.log(`Database: ${process.env.DB_DATABASE || 'solanahack'}`);
    await client.connect();
    console.log('âœ… Successfully connected to PostgreSQL!');
    if (process.env.DB_SYNCHRONIZE === 'true') {
      console.log('âš ï¸ DB_SYNCHRONIZE is enabled. Tables will be automatically created.');
      console.log('This is fine for development but should be disabled in production.');
    }
    const result = await client.query('SELECT current_timestamp as time, current_database() as database');
    console.log(`Current time: ${result.rows[0].time}`);
    console.log(`Connected to database: ${result.rows[0].database}`);
    console.log('\nConnection test completed successfully!');
  } catch (err) {
    console.error('âŒ Database connection error:', err.message);
    console.error('Please check your database configuration and ensure PostgreSQL is running.');
  } finally {
    await client.end();
  }
}
testConnection();
