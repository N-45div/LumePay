import { Client } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { addDays } from 'date-fns';
import * as fs from 'fs';
import * as path from 'path';
enum ScheduleFrequency {
  ONCE = 'ONCE',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  BIWEEKLY = 'BIWEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  YEARLY = 'YEARLY'
}
enum ScheduleStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}
enum ScheduleType {
  FIAT_DEPOSIT = 'FIAT_DEPOSIT',
  FIAT_WITHDRAWAL = 'FIAT_WITHDRAWAL',
  FIAT_TO_CRYPTO = 'FIAT_TO_CRYPTO',
  CRYPTO_TO_FIAT = 'CRYPTO_TO_FIAT'
}
const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
}
const LOG_FILE = path.join(LOG_DIR, `scheduled-payments-verification-${new Date().toISOString().replace(/:/g, '-')}.log`);
function log(message: string) {
  const formattedMessage = `[${new Date().toISOString()}] ${message}`;
  console.log(formattedMessage);
  fs.appendFileSync(LOG_FILE, formattedMessage + '\n');
}
async function connectToDatabase() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '.Joseph23',
    database: process.env.DB_DATABASE || 'solanahack',
  });
  await client.connect();
  log('Connected to database');
  return client;
}
async function checkTableExists(client: Client, tableName: string): Promise<boolean> {
  const query = `
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1
    );
  `;
  const result = await client.query(query, [tableName]);
  return result.rows[0].exists;
}
async function getTableStructure(client: Client, tableName: string): Promise<any[]> {
  const query = `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = $1
    ORDER BY ordinal_position;
  `;
  const result = await client.query(query, [tableName]);
  return result.rows;
}
async function verifyScheduledPayments() {
  log('Starting scheduled payments verification...');
  const client = await connectToDatabase();
  try {
    const tableExists = await checkTableExists(client, 'scheduled_payments');
    if (!tableExists) {
      throw new Error('scheduled_payments table does not exist! Migration may not have been run successfully.');
    }
    log('âœ“ Confirmed scheduled_payments table exists');
    const tableStructure = await getTableStructure(client, 'scheduled_payments');
    log(`Table has ${tableStructure.length} columns`);
    log('Table schema:');
    tableStructure.forEach(col => {
      log(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    const testUserId = `test-user-${uuidv4()}`;
    log(`Created test user ID: ${testUserId}`);
    const scheduleId = uuidv4();
    const nextExecutionDate = addDays(new Date(), 1).toISOString();
    log('Creating a test scheduled payment...');
    const insertFields = [
      'id', '"userId"', 'name', 'type', 'amount', 'currency', 'frequency', 
      '"nextExecutionDate"', 'status', '"destinationId"', '"executionCount"', 
      '"createdAt"', '"updatedAt"'
    ];
    const placeholders = [];
    for (let i = 1; i <= insertFields.length; i++) {
      placeholders.push(`$${i}`);
    }
    const insertQuery = `
      INSERT INTO scheduled_payments (${insertFields.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *;
    `;
    const insertValues = [
      scheduleId,
      testUserId,
      'Test Monthly SOL Purchase',
      ScheduleType.FIAT_TO_CRYPTO,
      100.00,
      'USD',
      ScheduleFrequency.MONTHLY,
      nextExecutionDate,
      ScheduleStatus.ACTIVE,
      'SOL',
      0,
      new Date().toISOString(),
      new Date().toISOString()
    ];
    const insertResult = await client.query(insertQuery, insertValues);
    const createdPayment = insertResult.rows[0];
    log(`Created scheduled payment with ID: ${scheduleId}`);
    const createResult = await client.query(`
      SELECT * FROM scheduled_payments WHERE id = $1
    `, [scheduleId]);
    if (createResult.rows.length === 0) {
      throw new Error('Failed to create scheduled payment');
    }
    log('Successfully verified scheduled payment creation');
    log(JSON.stringify(createResult.rows[0], null, 2));
    log('Updating scheduled payment...');
    const updateQuery = `
      UPDATE scheduled_payments 
      SET amount = $1, name = $2, "updatedAt" = $3
      WHERE id = $4
      RETURNING *;
    `;
    const updateResult = await client.query(updateQuery, [
      150.00, 
      'Updated Test Payment', 
      new Date().toISOString(), 
      scheduleId
    ]);
    if (updateResult.rows.length === 0) {
      throw new Error('Update did not return any rows');
    }
    log('Successfully updated scheduled payment');
    log(JSON.stringify(updateResult.rows[0], null, 2));
    const verifyUpdateResult = await client.query(`
      SELECT * FROM scheduled_payments WHERE id = $1
    `, [scheduleId]);
    if (verifyUpdateResult.rows[0].amount !== '150.000000' && 
        verifyUpdateResult.rows[0].amount !== 150.00) {
      throw new Error(`Failed to update amount. Expected 150 but got ${verifyUpdateResult.rows[0].amount}`);
    }
    if (verifyUpdateResult.rows[0].name !== 'Updated Test Payment') {
      throw new Error(`Failed to update name. Expected 'Updated Test Payment' but got '${verifyUpdateResult.rows[0].name}'`);
    }
    log('Successfully verified scheduled payment update');
    log('Pausing scheduled payment...');
    await client.query(`
      UPDATE scheduled_payments 
      SET status = $1, "updatedAt" = $2
      WHERE id = $3
      RETURNING *;
    `, [ScheduleStatus.PAUSED, new Date().toISOString(), scheduleId]);
    const pauseResult = await client.query(`
      SELECT * FROM scheduled_payments WHERE id = $1
    `, [scheduleId]);
    if (pauseResult.rows[0].status !== ScheduleStatus.PAUSED) {
      throw new Error(`Failed to pause scheduled payment. Status is ${pauseResult.rows[0].status} instead of ${ScheduleStatus.PAUSED}`);
    }
    log('Successfully verified scheduled payment pause');
    log('Resuming scheduled payment...');
    await client.query(`
      UPDATE scheduled_payments 
      SET status = $1, "updatedAt" = $2
      WHERE id = $3
      RETURNING *;
    `, [ScheduleStatus.ACTIVE, new Date().toISOString(), scheduleId]);
    const resumeResult = await client.query(`
      SELECT * FROM scheduled_payments WHERE id = $1
    `, [scheduleId]);
    if (resumeResult.rows[0].status !== ScheduleStatus.ACTIVE) {
      throw new Error(`Failed to resume scheduled payment. Status is ${resumeResult.rows[0].status} instead of ${ScheduleStatus.ACTIVE}`);
    }
    log('Successfully verified scheduled payment resume');
    log('Simulating payment execution...');
    await client.query(`
      UPDATE scheduled_payments 
      SET "executionCount" = "executionCount" + 1, 
          "lastExecutionDate" = $1,
          "nextExecutionDate" = $2,
          "updatedAt" = $3
      WHERE id = $4
      RETURNING *;
    `, [
      new Date().toISOString(), 
      addDays(new Date(), 30).toISOString(), 
      new Date().toISOString(), 
      scheduleId
    ]);
    const executeResult = await client.query(`
      SELECT * FROM scheduled_payments WHERE id = $1
    `, [scheduleId]);
    if (executeResult.rows[0].executionCount !== 1 && 
        executeResult.rows[0].executionCount !== '1') {
      throw new Error(`Failed to increment execution count. Expected 1 but got ${executeResult.rows[0].executionCount}`);
    }
    if (!executeResult.rows[0].lastExecutionDate) {
      throw new Error('Failed to set lastExecutionDate');
    }
    log('Successfully verified scheduled payment execution');
    log(JSON.stringify(executeResult.rows[0], null, 2));
    log('Cancelling scheduled payment...');
    await client.query(`
      UPDATE scheduled_payments 
      SET status = $1, "updatedAt" = $2
      WHERE id = $3
      RETURNING *;
    `, [ScheduleStatus.CANCELLED, new Date().toISOString(), scheduleId]);
    const cancelResult = await client.query(`
      SELECT * FROM scheduled_payments WHERE id = $1
    `, [scheduleId]);
    if (cancelResult.rows[0].status !== ScheduleStatus.CANCELLED) {
      throw new Error(`Failed to cancel scheduled payment. Status is ${cancelResult.rows[0].status} instead of ${ScheduleStatus.CANCELLED}`);
    }
    log('Successfully verified scheduled payment cancellation');
    log('Cleaning up test data...');
    await client.query(`
      DELETE FROM scheduled_payments WHERE "userId" = $1
    `, [testUserId]);
    log('Verification completed successfully!');
    log('\nSummary of verification:');
    log('âœ… Confirmed database schema');
    log('âœ… Created scheduled payment');
    log('âœ… Updated scheduled payment');
    log('âœ… Paused scheduled payment');
    log('âœ… Resumed scheduled payment');
    log('âœ… Executed scheduled payment');
    log('âœ… Cancelled scheduled payment');
  } catch (error: unknown) {
    if (error instanceof Error) {
      log(`ERROR: ${error.message}`);
      log(error.stack || 'No stack trace available');
    } else {
      log(`ERROR: ${String(error)}`);
    }
  } finally {
    await client.end();
    log('Database connection closed');
  }
}
verifyScheduledPayments().catch(err => {
  if (err instanceof Error) {
    log(`Fatal error: ${err.message}`);
    log(err.stack || 'No stack trace available');
  } else {
    log(`Fatal error: ${String(err)}`);
  }
  process.exit(1);
});
