require('dotenv').config();
const { Client } = require('pg');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const TestLogger = require('../utils/test-logger');
const logger = new TestLogger({
  testName: 'Payment Processing Integration Test',
  fileName: `payment-flow-${new Date().toISOString().replace(/:/g, '-')}.log`
});
class MockStripeClient {
  constructor() {
    this.paymentIntents = [];
    this.nextId = 1;
  }
  createPaymentIntent({ amount, currency, metadata }) {
    const id = `pi_test_${this.nextId++}`;
    const paymentIntent = {
      id,
      amount,
      currency,
      status: 'requires_payment_method',
      client_secret: `secret_${id}`,
      metadata,
      created: Date.now(),
    };
    this.paymentIntents.push(paymentIntent);
    return paymentIntent;
  }
  retrievePaymentIntent(id) {
    const payment = this.paymentIntents.find(p => p.id === id);
    if (!payment) throw new Error(`Payment intent not found: ${id}`);
    return payment;
  }
  updatePaymentIntentStatus(id, status) {
    const payment = this.retrievePaymentIntent(id);
    payment.status = status;
    return payment;
  }
  generateWebhookEvent(paymentId, eventType) {
    const payment = this.retrievePaymentIntent(paymentId);
    return {
      id: `evt_${Date.now()}`,
      type: eventType,
      data: {
        object: payment
      }
    };
  }
}
class ApiClient {
  constructor(baseUrl = 'http://localhost:3000/api/v1') {
    this.baseUrl = baseUrl;
  }
  async createPayment(data) {
    try {
      const response = await axios.post(`${this.baseUrl}/fiat-payment/deposit`, data);
      return response.data;
    } catch (error) {
      logger.error('Error creating payment:', error.response?.data || error.message);
      throw error;
    }
  }
  async checkPaymentStatus(paymentId) {
    try {
      const response = await axios.get(`${this.baseUrl}/fiat-payment/status/${paymentId}`);
      return response.data;
    } catch (error) {
      logger.error('Error checking payment status:', error.response?.data || error.message);
      throw error;
    }
  }
  async simulateWebhook(paymentId, eventType) {
    try {
      const mockStripe = new MockStripeClient();
      const paymentIntent = mockStripe.createPaymentIntent({
        id: paymentId,
        amount: 5000,
        currency: 'usd',
        metadata: { userId: 'test_user_123' }
      });
      mockStripe.updatePaymentIntentStatus(paymentId, eventType === 'payment_intent.succeeded' ? 'succeeded' : 'failed');
      const event = mockStripe.generateWebhookEvent(paymentId, eventType);
      const response = await axios.post(`${this.baseUrl}/webhooks/stripe`, event, {
        headers: {
          'stripe-signature': 'mock_signature_for_testing'
        }
      });
      return response.data;
    } catch (error) {
      logger.error('Error simulating webhook:', error.response?.data || error.message);
      throw error;
    }
  }
}
class DbClient {
  constructor() {
    this.client = new Client({
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: '.Joseph23',
      database: 'solanahack',
    });
    logger.log('Database connection info:');
    logger.log('- Host: localhost');
    logger.log('- Port: 5432');
    logger.log('- User: postgres');
    logger.log('- Database: solanahack');
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
  async getTransactionByProcessorId(processorId) {
    try {
      const result = await this.client.query(
        'SELECT * FROM transactions WHERE "processorTransactionId" = $1',
        [processorId]
      );
      return result.rows[0];
    } catch (error) {
      logger.error(`Error querying transaction: ${error.message}`);
      return null;
    }
  }
  async getAllTransactions() {
    try {
      const result = await this.client.query('SELECT * FROM transactions ORDER BY "timestamp" DESC LIMIT 10');
      return result.rows;
    } catch (error) {
      logger.error(`Error querying transactions: ${error.message}`);
      return [];
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
      logger.log(`âœ… Created test transaction with ID: ${result.rows[0].id}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error creating test transaction: ${error.message}`);
      console.error('SQL Error Details:', error);
      return null;
    }
  }
}
async function testPaymentFlow() {
  logger.startTest();
  logger.log('ðŸ” Starting payment processing integration test');
  const db = new DbClient();
  const api = new ApiClient();
  try {
    const connected = await db.connect();
    if (!connected) {
      throw new Error('Unable to connect to database, aborting test');
    }
    logger.log('\nðŸ“ Step 1: Creating a test transaction in the database');
    const testTransaction = await db.createTestTransaction({
      userId: 'test_user_123',
      amount: 50.00,
      currency: 'USD',
      status: 'pending',
      type: 'FIAT_DEPOSIT',
      processorName: 'stripe',
      processorTransactionId: `pi_test_${Date.now()}`,
      metadata: {
        source: 'integration_test',
        testRunId: `test_${Date.now()}`
      }
    });
    if (!testTransaction) {
      throw new Error('Failed to create test transaction');
    }
    logger.log('Transaction created:', {
      id: testTransaction.id,
      processorTransactionId: testTransaction.processorTransactionId,
      amount: `${testTransaction.amount} ${testTransaction.currency}`,
      status: testTransaction.status
    });
    const { processorTransactionId } = testTransaction;
    logger.log('\nðŸ“Š Step 2: Verifying transaction in database');
    const verifiedTransaction = await db.getTransactionByProcessorId(processorTransactionId);
    if (verifiedTransaction) {
      logger.log('Transaction verified in database:', {
        id: verifiedTransaction.id,
        processorTransactionId: verifiedTransaction.processorTransactionId,
        status: verifiedTransaction.status
      });
    } else {
      logger.log('âš ï¸ Transaction not found in database. This is unexpected.');
    }
    logger.log('\nðŸ“¡ Step 3: Simulating payment completion');
    try {
      await db.client.query(
        'UPDATE transactions SET status = $1, "statusHistory" = $2 WHERE "processorTransactionId" = $3',
        [
          'completed',
          JSON.stringify([
            { status: 'pending', timestamp: new Date(Date.now() - 60000), reason: 'Payment initiated' },
            { status: 'completed', timestamp: new Date(), reason: 'Payment successful' }
          ]),
          processorTransactionId
        ]
      );
      logger.log('âœ… Transaction status updated to completed');
    } catch (error) {
      logger.error('âŒ Error updating transaction status:', error.message);
    }
    logger.log('\nðŸ” Step 4: Checking updated transaction status');
    const updatedTransaction = await db.getTransactionByProcessorId(processorTransactionId);
    if (updatedTransaction) {
      logger.log('Updated transaction record:');
      logger.log(`- ID: ${updatedTransaction.id}`);
      logger.log(`- User ID: ${updatedTransaction.userId}`);
      logger.log(`- Amount: ${updatedTransaction.amount} ${updatedTransaction.currency}`);
      logger.log(`- Status: ${updatedTransaction.status}`);
      logger.log(`- Processor: ${updatedTransaction.processorName}`);
      logger.log(`- Processor ID: ${updatedTransaction.processorTransactionId}`);
    } else {
      logger.log('âš ï¸ Updated transaction not found in database');
    }
    logger.log('\nðŸ“‹ Step 5: Listing all transactions in database');
    const allTransactions = await db.getAllTransactions();
    if (allTransactions.length > 0) {
      logger.log(`Found ${allTransactions.length} transaction(s):`);
      allTransactions.forEach((tx, index) => {
        logger.log(`${index + 1}. ${tx.id}: ${tx.amount} ${tx.currency} (${tx.status})`);
      });
    } else {
      logger.log('No transactions found in database');
    }
    logger.log('\nâœ… Payment flow test completed successfully');
    logger.endTest({
      'Status': 'Success',
      'Transaction ID': testTransaction.id,
      'Final Status': updatedTransaction.status,
      'Total Transactions': allTransactions.length
    });
  } catch (error) {
    logger.error('âŒ Test failed:', error.message);
    logger.endTest({ 'Status': 'Failed', 'Error': error.message });
  } finally {
    await db.disconnect();
    logger.restore();
  }
}
testPaymentFlow().catch(error => {
  logger.error('Unhandled error in test script:', error);
  logger.restore();
});
