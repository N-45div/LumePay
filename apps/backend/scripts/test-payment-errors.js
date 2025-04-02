require('dotenv').config();
const { Client } = require('pg');
const { v4: uuidv4 } = require('uuid');
const DirectLogger = require('../utils/direct-logger');
const logger = new DirectLogger('Payment-Error-Tests');
const CONFIG = {
  dbConfig: {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '.Joseph23',
    database: 'solanahack',
  }
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
  async createTestTransaction(data) {
    try {
      const transactionId = data.id || uuidv4();
      const processorTransactionId = data.processorTransactionId || `pi_test_${Date.now()}`;
      const result = await this.client.query(
        `INSERT INTO transactions 
        (id, "userId", amount, currency, status, "timestamp", "type", "processorName", "processorTransactionId", metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          transactionId,
          data.userId || 'test_user_123',
          data.amount || 50.00,
          data.currency || 'USD',
          data.status || 'pending',
          new Date(),
          data.type || 'FIAT_DEPOSIT',
          data.processorName || 'stripe',
          processorTransactionId,
          data.metadata || { source: 'test_script' }
        ]
      );
      return result.rows[0];
    } catch (error) {
      logger.error(`Error creating test transaction: ${error.message}`);
      return null;
    }
  }
  async updateTransactionStatus(id, status, metadata = {}) {
    try {
      let updateQuery;
      let params;
      if (Object.keys(metadata).length > 0) {
        updateQuery = `
          UPDATE transactions 
          SET status = $1, 
              metadata = metadata || $2::jsonb,
              "updatedAt" = NOW()
          WHERE id = $3 
          RETURNING *
        `;
        params = [status, JSON.stringify(metadata), id];
      } else {
        updateQuery = `
          UPDATE transactions 
          SET status = $1,
              "updatedAt" = NOW()
          WHERE id = $2 
          RETURNING *
        `;
        params = [status, id];
      }
      const result = await this.client.query(updateQuery, params);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error updating transaction ${id}: ${error.message}`);
      return null;
    }
  }
  async getTransaction(id) {
    try {
      const result = await this.client.query(
        `SELECT * FROM transactions WHERE id = $1`,
        [id]
      );
      return result.rows[0];
    } catch (error) {
      logger.error(`Error getting transaction: ${error.message}`);
      return null;
    }
  }
  async findStaleTransactions(statusToCheck, minutesOld) {
    try {
      const result = await this.client.query(
        `SELECT * FROM transactions 
         WHERE status = $1 
         AND "timestamp" < NOW() - INTERVAL '${minutesOld} minutes'
         ORDER BY "timestamp"`,
        [statusToCheck]
      );
      return result.rows;
    } catch (error) {
      logger.error(`Error finding stale transactions: ${error.message}`);
      return [];
    }
  }
  async deleteTestTransactions() {
    try {
      const result = await this.client.query(
        `DELETE FROM transactions WHERE metadata->>'testError' IS NOT NULL RETURNING id`
      );
      logger.log(`âœ… Cleaned up ${result.rowCount} test transactions`);
    } catch (error) {
      logger.error(`Error cleaning up test transactions: ${error.message}`);
    }
  }
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const formatTransaction = (tx) => {
  return {
    id: tx.id,
    processorTransactionId: tx.processorTransactionId,
    amount: `${tx.amount} ${tx.currency}`,
    status: tx.status
  };
};
const testScenarios = [
  {
    name: 'Invalid Payment Processor',
    setup: async (db) => {
      return await db.createTestTransaction({
        userId: 'test_user_error',
        amount: 75.00,
        currency: 'USD',
        status: 'pending',
        type: 'FIAT_DEPOSIT',
        processorName: 'invalid_processor', // Invalid processor name
        processorTransactionId: `pi_error_${Date.now()}`,
        metadata: { 
          testError: 'invalid_processor',
          scenario: 'INVALID_PROCESSOR'
        }
      });
    },
    test: async (db, transaction) => {
      logger.log(`Transaction created with invalid processor: ${transaction.processorName}`);
      await db.updateTransactionStatus(
        transaction.id,
        'failed',
        { 
          failureReason: 'PROCESSOR_NOT_FOUND',
          errorMessage: `Payment processor '${transaction.processorName}' not found`,
          errorTime: new Date()
        }
      );
      const updatedTx = await db.getTransaction(transaction.id);
      const success = 
        updatedTx.status === 'failed' && 
        updatedTx.metadata.failureReason === 'PROCESSOR_NOT_FOUND';
      logger.log(`Error properly recorded: ${success ? 'âœ…' : 'âŒ'}`);
      return success;
    }
  },
  {
    name: 'Timeout Recovery',
    setup: async (db) => {
      const pastDate = new Date();
      pastDate.setMinutes(pastDate.getMinutes() - 20); // 20 minutes in the past
      const tx = await db.createTestTransaction({
        userId: 'test_user_timeout',
        amount: 25.00,
        currency: 'USD',
        status: 'processing', // Stuck in processing state
        type: 'FIAT_DEPOSIT',
        processorName: 'stripe',
        processorTransactionId: `pi_timeout_${Date.now()}`,
        metadata: { 
          testError: 'timeout',
          scenario: 'TIMEOUT'
        }
      });
      await db.client.query(
        `UPDATE transactions SET "timestamp" = $1 WHERE id = $2`,
        [pastDate, tx.id]
      );
      return tx;
    },
    test: async (db, transaction) => {
      logger.log(`Looking for stale transactions (processing for > 15 minutes)...`);
      const staleTransactions = await db.findStaleTransactions('processing', 15);
      const isStale = staleTransactions.some(tx => tx.id === transaction.id);
      logger.log(`Transaction detected as stale: ${isStale ? 'âœ…' : 'âŒ'}`);
      if (isStale) {
        await db.updateTransactionStatus(
          transaction.id,
          'failed',
          { 
            failureReason: 'TIMEOUT',
            errorMessage: 'Transaction timed out after 15 minutes',
            recoveryAttempt: 'timeout_recovery',
            recoveredAt: new Date()
          }
        );
        const recoveredTx = await db.getTransaction(transaction.id);
        const success = 
          recoveredTx.status === 'failed' && 
          recoveredTx.metadata.recoveryAttempt === 'timeout_recovery';
        logger.log(`Transaction properly recovered: ${success ? 'âœ…' : 'âŒ'}`);
        return success;
      }
      return false;
    }
  },
  {
    name: 'Duplicate Transaction',
    setup: async (db) => {
      const orderId = `order_${Date.now()}`;
      const tx1 = await db.createTestTransaction({
        userId: 'test_user_duplicate',
        amount: 100.00,
        currency: 'USD',
        status: 'completed',
        type: 'FIAT_DEPOSIT',
        processorName: 'stripe',
        processorTransactionId: `pi_original_${Date.now()}`,
        metadata: { 
          testError: 'duplicate',
          scenario: 'DUPLICATE_CHECK',
          orderId
        }
      });
      const tx2 = await db.createTestTransaction({
        userId: 'test_user_duplicate',
        amount: 100.00,
        currency: 'USD',
        status: 'pending',
        type: 'FIAT_DEPOSIT',
        processorName: 'stripe',
        processorTransactionId: `pi_duplicate_${Date.now()}`,
        metadata: { 
          testError: 'duplicate',
          scenario: 'DUPLICATE_CHECK',
          orderId
        }
      });
      return { tx1, tx2, orderId };
    },
    test: async (db, data) => {
      const { tx1, tx2, orderId } = data;
      logger.log(`Testing duplicate detection for orderId: ${orderId}`);
      const result = await db.client.query(
        `SELECT * FROM transactions 
         WHERE metadata->>'orderId' = $1 
         ORDER BY "timestamp"`,
        [orderId]
      );
      const duplicatesFound = result.rows.length > 1;
      logger.log(`Duplicates found: ${duplicatesFound ? 'âœ…' : 'âŒ'} (${result.rows.length} transactions)`);
      if (duplicatesFound) {
        await db.updateTransactionStatus(
          tx2.id,
          'failed',
          { 
            failureReason: 'DUPLICATE_TRANSACTION',
            errorMessage: `A transaction with order ID ${orderId} already exists`,
            originalTransactionId: tx1.id
          }
        );
        const markedTx = await db.getTransaction(tx2.id);
        const success = 
          markedTx.status === 'failed' && 
          markedTx.metadata.failureReason === 'DUPLICATE_TRANSACTION';
        logger.log(`Duplicate properly marked: ${success ? 'âœ…' : 'âŒ'}`);
        return success;
      }
      return false;
    }
  }
];
const runErrorTests = async () => {
  logger.log('ðŸ” Starting payment error handling tests');
  logger.log('=======================================');
  const db = new DbClient();
  let allPassed = true;
  let results = {};
  try {
    await db.connect();
    for (const [index, scenario] of testScenarios.entries()) {
      logger.log(`\nðŸ§ª Test ${index + 1}/${testScenarios.length}: ${scenario.name}`);
      logger.log('-------------------------------------------');
      const testData = await scenario.setup(db);
      const result = await scenario.test(db, testData);
      logger.log(`Test result: ${result ? 'âœ… PASSED' : 'âŒ FAILED'}`);
      results[scenario.name] = result ? 'PASSED' : 'FAILED';
      if (!result) {
        allPassed = false;
      }
      await delay(500);
    }
    logger.log('\n=======================================');
    logger.log(`ðŸ” Testing completed: ${allPassed ? 'âœ… ALL TESTS PASSED' : 'âŒ SOME TESTS FAILED'}`);
    const summary = {
      'Status': allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED',
      ...results
    };
    logger.end(summary);
    logger.log('\nDo you want to clean up test transaction data? (y/n)');
    process.stdin.once('data', async (data) => {
      const answer = data.toString().trim().toLowerCase();
      if (answer === 'y' || answer === 'yes') {
        await db.deleteTestTransactions();
      }
      await db.disconnect();
      process.exit(0);
    });
  } catch (error) {
    logger.error(`âŒ Error running tests: ${error.message}`);
    logger.end({ 'Status': 'ERROR', 'Error': error.message });
    await db.disconnect();
    process.exit(1);
  }
};
runErrorTests().catch(error => {
  logger.error(`Unhandled error: ${error.message}`);
});
