const { Client } = require('pg');
async function testLocalConnection() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '.Joseph23', // Your existing password
    database: 'postgres'    // Default database that should exist
  });
  try {
    console.log('Attempting to connect to your local PostgreSQL server...');
    console.log('Host: localhost');
    console.log('Port: 5432');
    console.log('User: postgres');
    await client.connect();
    console.log('âœ… Successfully connected to local PostgreSQL server!');
    console.log('\nChecking available databases:');
    const result = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false;');
    if (result.rows.length > 0) {
      console.log('Available databases:');
      result.rows.forEach(row => {
        console.log(`- ${row.datname}`);
      });
    } else {
      console.log('No databases found!');
    }
    console.log('\nLocal PostgreSQL connection test completed successfully!');
    const solanahackExists = result.rows.some(row => row.datname === 'solanahack');
    if (!solanahackExists) {
      console.log('\nâš ï¸ The "solanahack" database does not exist yet.');
      console.log('To create it, you can run:');
      console.log('CREATE DATABASE solanahack;');
    } else {
      console.log('\nâœ… The "solanahack" database exists!');
    }
  } catch (err) {
    console.error('âŒ Local PostgreSQL connection error:', err.message);
    console.error('Please check your PostgreSQL installation and credentials.');
  } finally {
    await client.end().catch(console.error);
  }
}
testLocalConnection();
