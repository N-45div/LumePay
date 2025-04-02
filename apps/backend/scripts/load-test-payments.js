require('dotenv').config();
const { Client } = require('pg');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { performance } = require('perf_hooks');
const TestLogger = require('../utils/test-logger');
const logger = new TestLogger({
  testName: 'Payment System Load Test',
  fileName: `load-test-${new Date().toISOString().replace(/:/g, '-')}.log`
});
const CONFIG = {
  numTransactions: process.argv[2] ? parseInt(process.argv[2]) : 100,
  concurrency: process.argv[3] ? parseInt(process.argv[3]) : 10,
  baseUrl: process.env.API_URL || 'http://localhost:3000/api/v1',
  dbConfig: {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '.Joseph23',
    database: 'solanahack',
  }
};
const STATS = {
  totalStartTime: 0,
  totalEndTime: 0,
  transactionsCreated: 0,
  transactionsProcessed: 0,
  transactionsFailed: 0,
  responseTimesMs: [],
  errors: []
};
class DbClient {
  constructor() {
    this.client = new Client(CONFIG.dbConfig);
  }
  async connect() {
    try {
      await this.client.connect();
      logger.log('âœ… Connected to database');
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
      const processorTransactionId = data.processorTransactionId || `pi_test_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const result = await this.client.query(
        `INSERT INTO transactions 
        (id, "userId", amount, currency, status, "timestamp", "type", "processorName", "processorTransactionId", metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          transactionId,
          data.userId || `test_user_${Math.floor(Math.random() * 10000)}`,
          data.amount || (Math.random() * 1000).toFixed(2),
          data.currency || 'USD',
          data.status || 'pending',
          new Date(),
          data.type || 'FIAT_DEPOSIT',
          data.processorName || 'stripe',
          processorTransactionId,
          data.metadata || { source: 'load_test' }
        ]
      );
      return result.rows[0];
    } catch (error) {
      logger.error(`Error creating test transaction: ${error.message}`);
      STATS.errors.push(error.message);
      return null;
    }
  }
  async updateTransactionStatus(id, status, metadata = {}) {
    try {
      const result = await this.client.query(
        `UPDATE transactions SET status = $1, metadata = metadata || $2, "updatedAt" = NOW()
         WHERE id = $3 RETURNING *`,
        [status, metadata, id]
      );
      return result.rows[0];
    } catch (error) {
      logger.error(`Error updating transaction ${id}: ${error.message}`);
      STATS.errors.push(error.message);
      return null;
    }
  }
  async getAllTransactionsByStatus(status) {
    try {
      const result = await this.client.query(
        `SELECT * FROM transactions WHERE status = $1`,
        [status]
      );
      return result.rows;
    } catch (error) {
      logger.error(`Error querying transactions: ${error.message}`);
      return [];
    }
  }
  async cleanupTestTransactions() {
    try {
      const result = await this.client.query(
        `DELETE FROM transactions WHERE metadata->>'source' = 'load_test' RETURNING id`
      );
      logger.log(`âœ… Deleted ${result.rowCount} test transactions`);
      return result.rowCount;
    } catch (error) {
      logger.error(`Error cleaning up test transactions: ${error.message}`);
      return 0;
    }
  }
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const createBatch = async (db, batchSize) => {
  const batchPromises = [];
  for (let i = 0; i < batchSize; i++) {
    const startTime = performance.now();
    batchPromises.push(
      db.createTestTransaction({
        amount: (Math.random() * 1000).toFixed(2),
        currency: 'USD',
        metadata: { 
          source: 'load_test',
          batchId: Date.now(),
          testIndex: i
        }
      }).then(transaction => {
        if (transaction) {
          const endTime = performance.now();
          STATS.responseTimesMs.push(endTime - startTime);
          STATS.transactionsCreated++;
          return transaction;
        }
      })
    );
  }
  return Promise.all(batchPromises);
};
const processTransactions = async (db, transactions) => {
  const processPromises = transactions.map(async transaction => {
    if (!transaction) return;
    const startTime = performance.now();
    const outcome = Math.random() < 0.8 ? 'completed' : 'failed';
    const metadata = {
      processedAt: new Date(),
      processingTimeMs: Math.floor(Math.random() * 2000),
      source: 'load_test'
    };
    if (outcome === 'failed') {
      metadata.failureReason = 'load_test_failure';
    }
    try {
      await db.updateTransactionStatus(transaction.id, outcome, metadata);
      const endTime = performance.now();
      STATS.responseTimesMs.push(endTime - startTime);
      if (outcome === 'completed') {
        STATS.transactionsProcessed++;
      } else {
        STATS.transactionsFailed++;
      }
    } catch (error) {
      logger.error(`Error processing transaction ${transaction.id}: ${error.message}`);
      STATS.errors.push(`Error processing transaction ${transaction.id}: ${error.message}`);
    }
  });
  return Promise.all(processPromises);
};
const generateReport = () => {
  const totalTimeMs = STATS.totalEndTime - STATS.totalStartTime;
  const averageResponseTimeMs = STATS.responseTimesMs.length > 0 
    ? STATS.responseTimesMs.reduce((sum, time) => sum + time, 0) / STATS.responseTimesMs.length 
    : 0;
  logger.log('\nðŸ“Š LOAD TEST RESULTS ðŸ“Š');
  logger.log('=======================');
  logger.log(`Total test duration: ${(totalTimeMs / 1000).toFixed(2)} seconds`);
  logger.log(`Transactions created: ${STATS.transactionsCreated}`);
  logger.log(`Transactions processed successfully: ${STATS.transactionsProcessed}`);
  logger.log(`Transactions failed: ${STATS.transactionsFailed}`);
  logger.log(`Transaction throughput: ${(STATS.transactionsCreated / (totalTimeMs / 1000)).toFixed(2)} transactions/second`);
  logger.log(`Average response time: ${averageResponseTimeMs.toFixed(2)} ms`);
  if (STATS.errors.length > 0) {
    logger.log('\nâš ï¸ ERRORS:');
    STATS.errors.slice(0, 10).forEach((error, index) => {
      logger.log(`${index + 1}. ${error}`);
    });
    if (STATS.errors.length > 10) {
      logger.log(`... and ${STATS.errors.length - 10} more errors`);
    }
  }
  logger.log('\nâœ… Load test completed');
  logger.endTest({
    'Transactions created': STATS.transactionsCreated,
    'Transactions processed': STATS.transactionsProcessed,
    'Transactions failed': STATS.transactionsFailed,
    'Throughput': `${(STATS.transactionsCreated / (totalTimeMs / 1000)).toFixed(2)} tx/s`,
    'Average response time': `${averageResponseTimeMs.toFixed(2)} ms`,
    'Error count': STATS.errors.length
  });
};
const runLoadTest = async () => {
  logger.startTest();
  logger.log('ðŸ”„ Starting payment system load test');
  logger.log(`Configuration: ${CONFIG.numTransactions} transactions, ${CONFIG.concurrency} concurrent`);
  const db = new DbClient();
  try {
    await db.connect();
    STATS.totalStartTime = performance.now();
    const numBatches = Math.ceil(CONFIG.numTransactions / CONFIG.concurrency);
    logger.log(`Creating ${numBatches} batches of ${CONFIG.concurrency} transactions each...`);
    for (let batch = 0; batch < numBatches; batch++) {
      const batchSize = Math.min(CONFIG.concurrency, CONFIG.numTransactions - batch * CONFIG.concurrency);
      if (batchSize <= 0) break;
      logger.log(`Creating batch ${batch + 1}/${numBatches} (${batchSize} transactions)...`);
      const transactions = await createBatch(db, batchSize);
      logger.log(`Processing batch ${batch + 1}/${numBatches}...`);
      await processTransactions(db, transactions);
      if (batch < numBatches - 1) {
        await delay(500);
      }
    }
    STATS.totalEndTime = performance.now();
    generateReport();
    logger.log('\nDo you want to clean up test transaction data? (y/n)');
    process.stdin.once('data', async (data) => {
      const answer = data.toString().trim().toLowerCase();
      if (answer === 'y' || answer === 'yes') {
        await db.cleanupTestTransactions();
      }
      await db.disconnect();
      logger.restore();
      process.exit(0);
    });
  } catch (error) {
    logger.error('âŒ Load test failed:', error);
    logger.endTest({ 'Status': 'Failed' });
    logger.restore();
    await db.disconnect();
  }
};
runLoadTest().catch(error => {
  logger.error('Unhandled error:', error);
  logger.restore();
});
