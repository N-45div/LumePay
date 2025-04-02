require('dotenv').config();
const { Client } = require('pg');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const DirectLogger = require('../utils/direct-logger');
const logger = new DirectLogger('Currency-Conversion-Test');
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
  async createFiatDepositTransaction(userId, amount, currency = 'USD') {
    try {
      const transactionId = uuidv4();
      const processorTransactionId = `pi_test_${Date.now()}`;
      const result = await this.client.query(
        `INSERT INTO transactions 
        (id, "userId", amount, currency, status, "timestamp", "type", "processorName", "processorTransactionId", metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          transactionId,
          userId,
          amount,
          currency,
          'completed', // Simulate an already completed fiat deposit
          new Date(),
          'FIAT_DEPOSIT',
          'stripe',
          processorTransactionId,
          { source: 'conversion_test' }
        ]
      );
      logger.log(`âœ… Created fiat deposit transaction with ID: ${result.rows[0].id}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error creating fiat deposit transaction: ${error.message}`);
      return null;
    }
  }
  async getTransactionById(id) {
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
  async getTransactionsByType(userId, type) {
    try {
      const result = await this.client.query(
        `SELECT * FROM transactions 
         WHERE "userId" = $1 AND "type" = $2
         ORDER BY "timestamp" DESC`,
        [userId, type]
      );
      return result.rows;
    } catch (error) {
      logger.error(`Error getting transactions by type: ${error.message}`);
      return [];
    }
  }
  async cleanupTestData() {
    try {
      const result = await this.client.query(
        `DELETE FROM transactions 
         WHERE metadata->>'source' = 'conversion_test' 
         RETURNING id`
      );
      logger.log(`âœ… Cleaned up ${result.rowCount} test transactions`);
      return result.rowCount;
    } catch (error) {
      logger.error(`Error cleaning up test data: ${error.message}`);
      return 0;
    }
  }
}
class ConversionApiClient {
  constructor(baseUrl = CONFIG.apiBaseUrl) {
    this.baseUrl = baseUrl;
    this.axios = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test_token_${Date.now()}`
      }
    });
  }
  async getSupportedFiatCurrencies() {
    try {
      const response = await this.axios.get('/conversion/supported-fiat');
      return response.data;
    } catch (error) {
      logger.error(`Error getting supported fiat currencies: ${error.response?.data || error.message}`);
      throw error;
    }
  }
  async getSupportedCryptoCurrencies() {
    try {
      const response = await this.axios.get('/conversion/supported-crypto');
      return response.data;
    } catch (error) {
      logger.error(`Error getting supported cryptocurrencies: ${error.response?.data || error.message}`);
      throw error;
    }
  }
  async getConversionEstimate(amount, fromCurrency, toCurrency) {
    try {
      const response = await this.axios.get('/conversion/estimate', {
        params: {
          amount,
          fromCurrency,
          toCurrency
        }
      });
      return response.data;
    } catch (error) {
      logger.error(`Error getting conversion estimate: ${error.response?.data || error.message}`);
      throw error;
    }
  }
  async convertFiatToCrypto(amount, fromCurrency, toCurrency) {
    try {
      const response = await this.axios.post('/conversion/fiat-to-crypto', {
        amount,
        fromCurrency,
        toCurrency
      });
      return response.data;
    } catch (error) {
      logger.error(`Error converting fiat to crypto: ${error.response?.data || error.message}`);
      throw error;
    }
  }
  async convertCryptoToFiat(amount, fromCurrency, toCurrency) {
    try {
      const response = await this.axios.post('/conversion/crypto-to-fiat', {
        amount,
        fromCurrency,
        toCurrency
      });
      return response.data;
    } catch (error) {
      logger.error(`Error converting crypto to fiat: ${error.response?.data || error.message}`);
      throw error;
    }
  }
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function testCurrencyConversionFlow() {
  logger.log('ðŸ”„ Starting currency conversion test');
  const db = new DbClient();
  try {
    await db.connect();
    const testUser = await db.createTestUser();
    logger.log(`Created test user: ${testUser.id}`);
    logger.log('\nðŸ“Œ STEP 1: Simulating initial fiat deposit');
    const depositAmount = 1000;
    const depositCurrency = 'USD';
    const fiatDeposit = await db.createFiatDepositTransaction(
      testUser.id,
      depositAmount,
      depositCurrency
    );
    logger.log(`Fiat deposit completed: ${fiatDeposit.amount} ${fiatDeposit.currency}`);
    logger.log('\nðŸ“Œ STEP 2: Estimating fiat to crypto conversion');
    const usdToSolRate = 0.1;
    const conversionAmount = 500; // Convert half of the deposit
    const estimatedSolAmount = conversionAmount * usdToSolRate;
    const conversionFee = conversionAmount * 0.01; // 1% fee
    const netSolAmount = (conversionAmount - conversionFee) * usdToSolRate;
    logger.log(`Conversion estimate:
- From: ${conversionAmount} ${depositCurrency}
- Fee: ${conversionFee} ${depositCurrency}
- Rate: 1 ${depositCurrency} = ${usdToSolRate} SOL
- Estimated result: ${netSolAmount.toFixed(4)} SOL`);
    logger.log('\nðŸ“Œ STEP 3: Executing fiat to crypto conversion');
    const fiatToCryptoTx = await db.client.query(
      `INSERT INTO transactions 
      (id, "userId", amount, currency, status, "timestamp", "type", "processorName", "processorTransactionId", metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        uuidv4(),
        testUser.id,
        conversionAmount,
        depositCurrency,
        'completed',
        new Date(),
        'FIAT_TO_CRYPTO',
        'conversion_service',
        `conv_${Date.now()}`,
        { 
          source: 'conversion_test',
          conversionDetails: {
            fromCurrency: depositCurrency,
            toCurrency: 'SOL',
            rate: usdToSolRate,
            fee: conversionFee,
            convertedAmount: netSolAmount
          }
        }
      ]
    );
    const fiatToCryptoTransaction = fiatToCryptoTx.rows[0];
    logger.log(`Fiat to crypto conversion executed:
- Transaction ID: ${fiatToCryptoTransaction.id}
- From: ${fiatToCryptoTransaction.amount} ${fiatToCryptoTransaction.currency}
- To: ${netSolAmount.toFixed(4)} SOL
- Status: ${fiatToCryptoTransaction.status}`);
    logger.log('\nðŸ“Œ STEP 4: Simulating time passage (user holds SOL)');
    await delay(1000);
    logger.log('\nðŸ“Œ STEP 5: Estimating crypto to fiat conversion');
    const solToUsdRate = 11; // 1 SOL = $11 (10% increase)
    const solAmountToConvert = netSolAmount / 2; // Convert half back to USD
    const estimatedUsdFromSol = solAmountToConvert * solToUsdRate;
    const cryptoToFiatFee = solAmountToConvert * 0.005; // 0.5% fee
    const netUsdAmount = (solAmountToConvert - cryptoToFiatFee) * solToUsdRate;
    logger.log(`Crypto to fiat estimate:
- From: ${solAmountToConvert.toFixed(4)} SOL
- Fee: ${cryptoToFiatFee.toFixed(4)} SOL
- Rate: 1 SOL = ${solToUsdRate} ${depositCurrency}
- Estimated result: ${netUsdAmount.toFixed(2)} ${depositCurrency}`);
    logger.log('\nðŸ“Œ STEP 6: Executing crypto to fiat conversion');
    const cryptoToFiatTx = await db.client.query(
      `INSERT INTO transactions 
      (id, "userId", amount, currency, status, "timestamp", "type", "processorName", "processorTransactionId", metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        uuidv4(),
        testUser.id,
        solAmountToConvert,
        'SOL',
        'completed',
        new Date(),
        'CRYPTO_TO_FIAT',
        'conversion_service',
        `conv_${Date.now()}`,
        { 
          source: 'conversion_test',
          conversionDetails: {
            fromCurrency: 'SOL',
            toCurrency: depositCurrency,
            rate: solToUsdRate,
            fee: cryptoToFiatFee,
            convertedAmount: netUsdAmount
          }
        }
      ]
    );
    const cryptoToFiatTransaction = cryptoToFiatTx.rows[0];
    logger.log(`Crypto to fiat conversion executed:
- Transaction ID: ${cryptoToFiatTransaction.id}
- From: ${cryptoToFiatTransaction.amount} ${cryptoToFiatTransaction.currency}
- To: ${netUsdAmount.toFixed(2)} ${depositCurrency}
- Status: ${cryptoToFiatTransaction.status}`);
    logger.log('\nðŸ“Œ STEP 7: Retrieving transaction history');
    const fiatDeposits = await db.getTransactionsByType(testUser.id, 'FIAT_DEPOSIT');
    const fiatToCrypto = await db.getTransactionsByType(testUser.id, 'FIAT_TO_CRYPTO');
    const cryptoToFiat = await db.getTransactionsByType(testUser.id, 'CRYPTO_TO_FIAT');
    logger.log(`Transaction history for ${testUser.id}:
- Fiat deposits: ${fiatDeposits.length}
- Fiat to crypto conversions: ${fiatToCrypto.length}
- Crypto to fiat conversions: ${cryptoToFiat.length}`);
    logger.log('\nðŸ“Œ STEP 8: Calculating final balances');
    const remainingUsdBalance = depositAmount - conversionAmount + netUsdAmount;
    const remainingSolBalance = netSolAmount - solAmountToConvert;
    logger.log(`Final balances:
- USD: ${remainingUsdBalance.toFixed(2)} USD
- SOL: ${remainingSolBalance.toFixed(4)} SOL`);
    logger.log('\nðŸ“Œ STEP 9: Profit/Loss Analysis');
    const remainingSolInUsd = remainingSolBalance * solToUsdRate;
    const totalValueInUsd = remainingUsdBalance + remainingSolInUsd;
    const profitLoss = totalValueInUsd - depositAmount;
    const profitLossPercentage = (profitLoss / depositAmount) * 100;
    logger.log(`Profit/Loss Analysis:
- Initial investment: ${depositAmount.toFixed(2)} USD
- Current USD balance: ${remainingUsdBalance.toFixed(2)} USD
- SOL holdings: ${remainingSolBalance.toFixed(4)} SOL (${remainingSolInUsd.toFixed(2)} USD)
- Total current value: ${totalValueInUsd.toFixed(2)} USD
- Profit/Loss: ${profitLoss.toFixed(2)} USD (${profitLossPercentage.toFixed(2)}%)`);
    logger.log('\nâœ… Currency conversion test completed successfully');
    logger.end({
      'User ID': testUser.id,
      'Initial Deposit': `${depositAmount} ${depositCurrency}`,
      'Final USD Balance': remainingUsdBalance.toFixed(2),
      'Final SOL Balance': remainingSolBalance.toFixed(4),
      'Profit/Loss': `${profitLoss.toFixed(2)} USD (${profitLossPercentage.toFixed(2)}%)`,
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
testCurrencyConversionFlow().catch(error => {
  logger.error(`Unhandled error: ${error.message}`);
});
