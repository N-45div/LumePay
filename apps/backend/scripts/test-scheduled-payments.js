require('dotenv').config();
const { Client } = require('pg');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const DirectLogger = require('../utils/direct-logger');
const logger = new DirectLogger('Scheduled-Payments-Test');
const CONFIG = {
  dbConfig: {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '.Joseph23',
    database: 'solanahack',
  },
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000/api/v1'
};
const SCHEDULE_FREQUENCY = {
  ONCE: 'ONCE',
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  BIWEEKLY: 'BIWEEKLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  YEARLY: 'YEARLY'
};
const SCHEDULE_TYPE = {
  FIAT_DEPOSIT: 'FIAT_DEPOSIT',
  FIAT_WITHDRAWAL: 'FIAT_WITHDRAWAL',
  FIAT_TO_CRYPTO: 'FIAT_TO_CRYPTO',
  CRYPTO_TO_FIAT: 'CRYPTO_TO_FIAT'
};
const SCHEDULE_STATUS = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
};
class DbClient {
  constructor() {
    this.client = new Client(CONFIG.dbConfig);
  }
  async connect() {
    try {
      await this.client.connect();
      logger.log('âœ… Connected to database');
      logger.log(`Database connection info:
- Host: ${CONFIG.dbConfig.host}
- Port: ${CONFIG.dbConfig.port}
- User: ${CONFIG.dbConfig.user}
- Database: ${CONFIG.dbConfig.database}`);
      return true;
    } catch (error) {
      logger.error(`âŒ Database connection error: ${error.message}`);
      return false;
    }
  }
  async disconnect() {
    try {
      await this.client.end();
      logger.log('âœ… Disconnected from database');
    } catch (error) {
      logger.error(`Error disconnecting: ${error.message}`);
    }
  }
  async createTestUser() {
    try {
      const userId = `test_user_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const walletAddress = `wallet_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      return {
        id: userId,
        email: `${userId}@example.com`,
        walletAddress
      };
    } catch (error) {
      logger.error(`Error creating test user: ${error.message}`);
      return null;
    }
  }
  async createScheduledPayment(
    userId,
    type,
    name,
    amount,
    currency,
    frequency,
    nextExecutionDate,
    metadata = {},
    processorName = 'stripe',
    processorAccountId = null,
    destinationId = null,
    maxExecutions = null
  ) {
    try {
      const scheduleId = uuidv4();
      const formattedDate = nextExecutionDate.toISOString();
      const result = await this.client.query(
        `INSERT INTO scheduled_payments 
        (id, "userId", name, type, amount, currency, frequency, "nextExecutionDate", 
         status, metadata, "processorName", "processorAccountId", "destinationId", 
         "executionCount", "maxExecutions", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *`,
        [
          scheduleId,
          userId,
          name,
          type,
          amount,
          currency,
          frequency,
          formattedDate,
          SCHEDULE_STATUS.ACTIVE, // Default to active
          metadata || { source: 'schedule_test' },
          processorName,
          processorAccountId,
          destinationId,
          0, // Initial execution count
          maxExecutions,
          new Date(),
          new Date()
        ]
      );
      logger.log(`âœ… Created scheduled payment with ID: ${result.rows[0].id}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error creating scheduled payment: ${error.message}`);
      return null;
    }
  }
  async updateScheduledPaymentStatus(id, status) {
    try {
      const result = await this.client.query(
        `UPDATE scheduled_payments 
         SET status = $1, "updatedAt" = $2
         WHERE id = $3
         RETURNING *`,
        [status, new Date(), id]
      );
      if (result.rowCount === 0) {
        throw new Error(`Scheduled payment with ID ${id} not found`);
      }
      logger.log(`âœ… Updated scheduled payment ${id} status to ${status}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error updating scheduled payment status: ${error.message}`);
      return null;
    }
  }
  async getScheduledPaymentById(id) {
    try {
      const result = await this.client.query(
        `SELECT * FROM scheduled_payments WHERE id = $1`,
        [id]
      );
      if (result.rowCount === 0) {
        logger.warn(`Scheduled payment with ID ${id} not found`);
        return null;
      }
      return result.rows[0];
    } catch (error) {
      logger.error(`Error getting scheduled payment: ${error.message}`);
      return null;
    }
  }
  async getScheduledPaymentsByUserId(userId) {
    try {
      const result = await this.client.query(
        `SELECT * FROM scheduled_payments
         WHERE "userId" = $1
         ORDER BY "nextExecutionDate" ASC`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      logger.error(`Error getting scheduled payments by user ID: ${error.message}`);
      return [];
    }
  }
  async executeScheduledPayment(id) {
    try {
      const result = await this.client.query(
        `UPDATE scheduled_payments
         SET "executionCount" = "executionCount" + 1,
             "lastExecutionDate" = $1,
             "updatedAt" = $1
         WHERE id = $2
         RETURNING *`,
        [new Date(), id]
      );
      if (result.rowCount === 0) {
        throw new Error(`Scheduled payment with ID ${id} not found`);
      }
      logger.log(`âœ… Simulated execution of scheduled payment ${id}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error executing scheduled payment: ${error.message}`);
      return null;
    }
  }
  async cleanupTestData() {
    try {
      const result = await this.client.query(
        `DELETE FROM scheduled_payments 
         WHERE metadata->>'source' = 'schedule_test' 
         RETURNING id`
      );
      logger.log(`âœ… Cleaned up ${result.rowCount} test scheduled payments`);
      return result.rowCount;
    } catch (error) {
      logger.error(`Error cleaning up test data: ${error.message}`);
      return 0;
    }
  }
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const getDateDaysFromNow = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};
const getRandomAmount = (min = 10, max = 1000) => {
  return +(Math.random() * (max - min) + min).toFixed(2);
};
async function testScheduledPayments() {
  logger.log('ðŸ”„ Starting scheduled payments test');
  const db = new DbClient();
  try {
    await db.connect();
    const testUser = await db.createTestUser();
    logger.log(`Created test user: ${testUser.id}`);
    logger.log('\nðŸ“Œ STEP 1: Creating scheduled payments of different types');
    const fiatDepositSchedule = await db.createScheduledPayment(
      testUser.id,
      SCHEDULE_TYPE.FIAT_DEPOSIT,
      'Monthly Deposit',
      500,
      'USD',
      SCHEDULE_FREQUENCY.MONTHLY,
      getDateDaysFromNow(30),
      { source: 'schedule_test', description: 'Test monthly deposit' },
      'stripe',
      'acct_test_12345',
      null,
      12 // Run for 1 year
    );
    const fiatToCryptoSchedule = await db.createScheduledPayment(
      testUser.id,
      SCHEDULE_TYPE.FIAT_TO_CRYPTO,
      'Weekly SOL Purchase',
      100,
      'USD',
      SCHEDULE_FREQUENCY.WEEKLY,
      getDateDaysFromNow(7),
      { source: 'schedule_test', description: 'Dollar Cost Averaging' },
      'stripe',
      'acct_test_12345',
      'SOL', // Target crypto
      52 // Run for 1 year
    );
    const cryptoToFiatSchedule = await db.createScheduledPayment(
      testUser.id,
      SCHEDULE_TYPE.CRYPTO_TO_FIAT,
      'One-time SOL Sale',
      5,
      'SOL',
      SCHEDULE_FREQUENCY.ONCE,
      getDateDaysFromNow(1),
      { source: 'schedule_test', description: 'Scheduled SOL sale' },
      null,
      null,
      'USD', // Target fiat
      1 // Just once
    );
    const fiatWithdrawalSchedule = await db.createScheduledPayment(
      testUser.id,
      SCHEDULE_TYPE.FIAT_WITHDRAWAL,
      'Quarterly Withdrawal',
      1000,
      'USD',
      SCHEDULE_FREQUENCY.QUARTERLY,
      getDateDaysFromNow(90),
      { source: 'schedule_test', description: 'Regular profit taking' },
      'stripe',
      null,
      'bank_account_12345', // Bank account ID
      4 // Run for 1 year
    );
    logger.log('Created scheduled payments: ', {
      'Fiat Deposit (Monthly)': fiatDepositSchedule?.id,
      'Fiat to Crypto (Weekly)': fiatToCryptoSchedule?.id,
      'Crypto to Fiat (One-time)': cryptoToFiatSchedule?.id,
      'Fiat Withdrawal (Quarterly)': fiatWithdrawalSchedule?.id
    });
    logger.log('\nðŸ“Œ STEP 2: Retrieving scheduled payments for the user');
    const userSchedules = await db.getScheduledPaymentsByUserId(testUser.id);
    logger.log(`Found ${userSchedules.length} scheduled payments for user ${testUser.id}`);
    const schedulesByType = {
      [SCHEDULE_TYPE.FIAT_DEPOSIT]: userSchedules.filter(s => s.type === SCHEDULE_TYPE.FIAT_DEPOSIT),
      [SCHEDULE_TYPE.FIAT_TO_CRYPTO]: userSchedules.filter(s => s.type === SCHEDULE_TYPE.FIAT_TO_CRYPTO),
      [SCHEDULE_TYPE.CRYPTO_TO_FIAT]: userSchedules.filter(s => s.type === SCHEDULE_TYPE.CRYPTO_TO_FIAT),
      [SCHEDULE_TYPE.FIAT_WITHDRAWAL]: userSchedules.filter(s => s.type === SCHEDULE_TYPE.FIAT_WITHDRAWAL)
    };
    logger.log('Scheduled payments by type: ', {
      'Fiat Deposits': schedulesByType[SCHEDULE_TYPE.FIAT_DEPOSIT]?.length,
      'Fiat to Crypto': schedulesByType[SCHEDULE_TYPE.FIAT_TO_CRYPTO]?.length,
      'Crypto to Fiat': schedulesByType[SCHEDULE_TYPE.CRYPTO_TO_FIAT]?.length,
      'Fiat Withdrawals': schedulesByType[SCHEDULE_TYPE.FIAT_WITHDRAWAL]?.length
    });
    logger.log('\nðŸ“Œ STEP 3: Testing schedule management (pause, resume, cancel)');
    logger.log('Pausing the weekly SOL purchase schedule');
    await db.updateScheduledPaymentStatus(fiatToCryptoSchedule.id, SCHEDULE_STATUS.PAUSED);
    const pausedSchedule = await db.getScheduledPaymentById(fiatToCryptoSchedule.id);
    logger.log(`Schedule status after pause: ${pausedSchedule.status}`);
    logger.log('Resuming the weekly SOL purchase schedule');
    await db.updateScheduledPaymentStatus(fiatToCryptoSchedule.id, SCHEDULE_STATUS.ACTIVE);
    const resumedSchedule = await db.getScheduledPaymentById(fiatToCryptoSchedule.id);
    logger.log(`Schedule status after resume: ${resumedSchedule.status}`);
    logger.log('Cancelling the quarterly withdrawal schedule');
    await db.updateScheduledPaymentStatus(fiatWithdrawalSchedule.id, SCHEDULE_STATUS.CANCELLED);
    const cancelledSchedule = await db.getScheduledPaymentById(fiatWithdrawalSchedule.id);
    logger.log(`Schedule status after cancellation: ${cancelledSchedule.status}`);
    logger.log('\nðŸ“Œ STEP 4: Simulating scheduled payment execution');
    logger.log('Executing one-time SOL sale schedule');
    const executedSchedule = await db.executeScheduledPayment(cryptoToFiatSchedule.id);
    logger.log(`Execution count after run: ${executedSchedule.executionCount}`);
    if (executedSchedule.maxExecutions && executedSchedule.executionCount >= executedSchedule.maxExecutions) {
      await db.updateScheduledPaymentStatus(executedSchedule.id, SCHEDULE_STATUS.COMPLETED);
      const completedSchedule = await db.getScheduledPaymentById(executedSchedule.id);
      logger.log(`Schedule status after max executions: ${completedSchedule.status}`);
    }
    logger.log('\nðŸ“Œ STEP 5: Verifying final state of scheduled payments');
    const finalSchedules = await db.getScheduledPaymentsByUserId(testUser.id);
    const finalStatusSummary = {
      [SCHEDULE_STATUS.ACTIVE]: finalSchedules.filter(s => s.status === SCHEDULE_STATUS.ACTIVE).length,
      [SCHEDULE_STATUS.PAUSED]: finalSchedules.filter(s => s.status === SCHEDULE_STATUS.PAUSED).length,
      [SCHEDULE_STATUS.COMPLETED]: finalSchedules.filter(s => s.status === SCHEDULE_STATUS.COMPLETED).length,
      [SCHEDULE_STATUS.FAILED]: finalSchedules.filter(s => s.status === SCHEDULE_STATUS.FAILED).length,
      [SCHEDULE_STATUS.CANCELLED]: finalSchedules.filter(s => s.status === SCHEDULE_STATUS.CANCELLED).length
    };
    logger.log('Final status summary: ', {
      'Active': finalStatusSummary[SCHEDULE_STATUS.ACTIVE],
      'Paused': finalStatusSummary[SCHEDULE_STATUS.PAUSED],
      'Completed': finalStatusSummary[SCHEDULE_STATUS.COMPLETED],
      'Failed': finalStatusSummary[SCHEDULE_STATUS.FAILED],
      'Cancelled': finalStatusSummary[SCHEDULE_STATUS.CANCELLED]
    });
    logger.end({
      'User ID': testUser.id,
      'Total Scheduled Payments': finalSchedules.length,
      'Active': finalStatusSummary[SCHEDULE_STATUS.ACTIVE],
      'Paused': finalStatusSummary[SCHEDULE_STATUS.PAUSED],
      'Completed': finalStatusSummary[SCHEDULE_STATUS.COMPLETED],
      'Cancelled': finalStatusSummary[SCHEDULE_STATUS.CANCELLED],
      'Test Status': 'Success'
    });
    await db.cleanupTestData();
    await db.disconnect();
  } catch (error) {
    logger.error(`âŒ Test failed: ${error.message}`);
    logger.end({ 'Test Status': 'Failed', 'Error': error.message });
    if (db) {
      await db.cleanupTestData();
      await db.disconnect();
    }
  }
}
testScheduledPayments().catch(error => {
  logger.error(`Unhandled error: ${error.message}`);
});
