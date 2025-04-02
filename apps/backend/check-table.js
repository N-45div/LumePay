// apps/backend/check-table.js
const { Client } = require('pg');

async function checkTable() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '.Joseph23',
    database: process.env.DB_DATABASE || 'solanahack',
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    
    console.log('Checking for scheduled_payments table...');
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'scheduled_payments'
      );
    `);
    
    if (result.rows[0].exists) {
      console.log('✅ Table scheduled_payments exists!');
      
      // Get table structure
      console.log('\nTable structure:');
      const columns = await client.query(`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'scheduled_payments'
        ORDER BY ordinal_position;
      `);
      
      columns.rows.forEach(col => {
        console.log(`- ${col.column_name} (${col.data_type}, ${col.is_nullable === 'YES' ? 'nullable' : 'not nullable'})`);
      });
      
      console.log('\nTable was successfully created and is ready for use!');
    } else {
      console.error('❌ Table scheduled_payments does not exist!');
      console.log('The migration may have failed or not been executed properly.');
    }
  } catch (error) {
    console.error('Error checking table:', error.message);
  } finally {
    await client.end();
  }
}

checkTable();
