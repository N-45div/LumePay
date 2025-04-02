const { Client } = require('pg');
async function setupDatabase() {
  const adminClient = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '.Joseph23',
    database: 'postgres' // Default admin database
  });
  try {
    console.log('Connecting to PostgreSQL to set up the solanahack database...');
    await adminClient.connect();
    const checkResult = await adminClient.query(
      "SELECT 1 FROM pg_database WHERE datname = 'solanahack'"
    );
    if (checkResult.rows.length === 0) {
      console.log('Creating solanahack database...');
      await adminClient.query('CREATE DATABASE solanahack');
      console.log('âœ… solanahack database created successfully!');
    } else {
      console.log('âœ… solanahack database already exists.');
    }
  } catch (err) {
    console.error('âŒ Error setting up database:', err.message);
    return false;
  } finally {
    await adminClient.end();
  }
  const appClient = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '.Joseph23',
    database: 'solanahack'
  });
  try {
    console.log('\nConnecting to solanahack database to set up tables...');
    await appClient.connect();
    await appClient.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    console.log('Creating transactions table...');
    await appClient.query(`
      CREATE TABLE IF NOT EXISTS "transactions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" character varying NOT NULL,
        "fromAddress" character varying,
        "toAddress" character varying,
        "amount" numeric NOT NULL,
        "currency" character varying NOT NULL,
        "status" character varying NOT NULL,
        "timestamp" TIMESTAMP NOT NULL DEFAULT now(),
        "network" character varying,
        "type" character varying NOT NULL,
        "sourceId" character varying,
        "destinationId" character varying,
        "processorName" character varying,
        "processorTransactionId" character varying,
        "metadata" jsonb,
        "statusHistory" jsonb
      )
    `);
    console.log('Creating bank_accounts table...');
    await appClient.query(`
      CREATE TABLE IF NOT EXISTS "bank_accounts" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" character varying NOT NULL,
        "accountName" character varying NOT NULL,
        "accountNumber" character varying NOT NULL,
        "routingNumber" character varying NOT NULL,
        "bankName" character varying NOT NULL,
        "status" character varying NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "metadata" jsonb
      )
    `);
    console.log('Creating indexes...');
    await appClient.query('CREATE INDEX IF NOT EXISTS "IDX_transactions_userId" ON "transactions" ("userId")');
    await appClient.query('CREATE INDEX IF NOT EXISTS "IDX_transactions_status" ON "transactions" ("status")');
    await appClient.query('CREATE INDEX IF NOT EXISTS "IDX_bank_accounts_userId" ON "bank_accounts" ("userId")');
    console.log('âœ… Tables and indexes created successfully!');
    console.log('\nDatabase setup complete - your local development database is ready to use.');
    console.log('You can now run your application and the payment processing features should work correctly.');
    return true;
  } catch (err) {
    console.error('âŒ Error creating tables:', err.message);
    return false;
  } finally {
    await appClient.end();
  }
}
setupDatabase().then(success => {
  if (!success) {
    console.log('âš ï¸ Database setup encountered errors. Please review the output above.');
    process.exit(1);
  }
}).catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
