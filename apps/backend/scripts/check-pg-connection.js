const { Client } = require('pg');
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
console.log('PostgreSQL Connection Tester');
console.log('============================');
console.log('This script will test your PostgreSQL connection with your provided credentials.');
rl.question('Host [localhost]: ', (host) => {
  host = host || 'localhost';
  rl.question('Port [5432]: ', (port) => {
    port = parseInt(port || '5432', 10);
    rl.question('Username [postgres]: ', (user) => {
      user = user || 'postgres';
      rl.question('Password: ', (password) => {
        rl.question('Database [postgres]: ', async (database) => {
          database = database || 'postgres';
          console.log('\nTesting connection with:');
          console.log(`- Host: ${host}`);
          console.log(`- Port: ${port}`);
          console.log(`- User: ${user}`);
          console.log(`- Database: ${database}`);
          const client = new Client({
            host,
            port,
            user,
            password,
            database
          });
          try {
            console.log('\nAttempting to connect...');
            await client.connect();
            console.log('âœ… Connection successful!');
            const result = await client.query('SELECT current_timestamp as time, current_database() as database, version() as version');
            console.log(`\nCurrent time: ${result.rows[0].time}`);
            console.log(`Connected to: ${result.rows[0].database}`);
            console.log(`PostgreSQL version: ${result.rows[0].version.split(',')[0]}`);
            console.log('\nAvailable databases:');
            const dbResult = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false;');
            dbResult.rows.forEach(row => {
              console.log(`- ${row.datname}`);
            });
            console.log('\nConnection test completed successfully!');
          } catch (err) {
            console.error('âŒ Connection failed:', err.message);
          } finally {
            await client.end().catch(console.error);
            rl.close();
          }
        });
      });
    });
  });
});
