// apps/backend/direct-migration.js
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('Starting direct SQL migration for scheduled_payments table...');

  // Create logs directory if it doesn't exist
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
  }

  // Generate log filename with timestamp
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const logFile = path.join(logsDir, `sql-migration-${timestamp}.log`);
  
  // Initialize logging
  function log(message) {
    const logMessage = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(logFile, logMessage);
    console.log(message);
  }

  log('Starting direct SQL migration for scheduled payments');
  log(`Log file: ${logFile}`);

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '.Joseph23',
    database: process.env.DB_DATABASE || 'solanahack',
  });

  try {
    log('Connecting to database...');
    await client.connect();
    log('Connected to database successfully');
    
    // Read the SQL migration file
    const sqlPath = path.join(__dirname, 'migrations', 'create-scheduled-payments.sql');
    log(`Reading SQL file: ${sqlPath}`);
    const sqlScript = fs.readFileSync(sqlPath, 'utf8');
    
    // Run the SQL script
    log('Executing SQL migration...');
    await client.query(sqlScript);
    log('SQL migration executed successfully');
    
    // Verify table was created
    log('Verifying table creation...');
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'scheduled_payments'
      );
    `);
    
    if (result.rows[0].exists) {
      log('✅ Table scheduled_payments created successfully!');
      
      // Get table structure
      log('Table structure:');
      const columns = await client.query(`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'scheduled_payments'
        ORDER BY ordinal_position;
      `);
      
      columns.rows.forEach(col => {
        log(`- ${col.column_name} (${col.data_type}, ${col.is_nullable === 'YES' ? 'nullable' : 'not nullable'})`);
      });
      
      log('Migration completed successfully.');
    } else {
      log('❌ ERROR: Table scheduled_payments was not created!');
    }
  } catch (error) {
    log(`ERROR: ${error.message}`);
    log(`Stack trace: ${error.stack}`);
  } finally {
    await client.end();
    log('Database connection closed');
    log('Migration process completed');
    console.log(`\nComplete log available at: ${logFile}`);
  }
}

runMigration();
