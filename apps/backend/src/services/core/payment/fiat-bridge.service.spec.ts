// apps/backend/src/services/core/payment/fiat-bridge.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { FiatBridgeService } from './fiat-bridge.service';
import { TransactionTrackingService } from './transaction-tracking.service';
import { StripeProcessor } from './processors/stripe-processor';
import { SimulatedPaymentProcessor } from './processors/simulated-processor';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../../../utils/logger';
import { TransactionRepository } from '../../../db/repositories/transaction.repository';
import { TransactionStatus } from '../../../common/types/transaction.types';
import { Result, createSuccessResult, createErrorResult } from '../../../common/types/result.types';
import { PaymentError } from './errors/PaymentErrors';

// Define missing TransactionType enum for testing
enum TransactionType {
  FIAT_DEPOSIT = 'FIAT_DEPOSIT',
  FIAT_WITHDRAWAL = 'FIAT_WITHDRAWAL',
  CRYPTO_DEPOSIT = 'CRYPTO_DEPOSIT',
  CRYPTO_WITHDRAWAL = 'CRYPTO_WITHDRAWAL'
}

// Extended interfaces for processors
interface ExtendedStripeProcessor extends StripeProcessor {
  getProcessorName: jest.Mock;
  getSupportedCurrencies: jest.Mock;
  processPayment: jest.Mock;
  checkPaymentStatus: jest.Mock;
  cancelPayment: jest.Mock;
}

interface ExtendedSimulatedProcessor extends SimulatedPaymentProcessor {
  getProcessorName: jest.Mock;
  getSupportedCurrencies: jest.Mock;
  processPayment: jest.Mock;
  checkPaymentStatus: jest.Mock;
  cancelPayment: jest.Mock;
}

// Extended interface for testing
interface ExtendedTransactionRepository extends TransactionRepository {
  findByProcessorTransactionId: jest.Mock;
}

// Extended Logger interface for testing
interface ExtendedLogger extends Logger {
  log: jest.Mock;
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
}

describe('FiatBridgeService', () => {
  let fiatBridgeService: FiatBridgeService;
  let mockStripeProcessor: Partial<ExtendedStripeProcessor>;
  let mockSimulatedProcessor: Partial<ExtendedSimulatedProcessor>;
  let mockTransactionTrackingService: Partial<TransactionTrackingService>;
  let mockTransactionRepository: Partial<ExtendedTransactionRepository>;
  let mockConfigService: Partial<ConfigService>;
  let mockLogger: Partial<ExtendedLogger>;

  beforeEach(async () => {
    // Mock the Stripe processor
    mockStripeProcessor = {
      getProcessorName: jest.fn().mockReturnValue('stripe'),
      getSupportedCurrencies: jest.fn().mockReturnValue(['USD', 'EUR']),
      processPayment: jest.fn().mockImplementation((request) => {
        return Promise.resolve(createSuccessResult({
          id: 'pi_mock_id',
          amount: request.amount,
          currency: request.currency,
          status: 'succeeded',
          clientSecret: 'client_secret_mock'
        }));
      }),
      checkPaymentStatus: jest.fn().mockImplementation((id) => {
        return Promise.resolve(createSuccessResult({
          id,
          amount: 1000,
          currency: 'USD',
          status: 'succeeded'
        }));
      }),
      cancelPayment: jest.fn().mockImplementation((id) => {
        return Promise.resolve(createSuccessResult({
          id,
          amount: 1000,
          currency: 'USD',
          status: 'canceled'
        }));
      })
    };

    // Mock the Simulated processor
    mockSimulatedProcessor = {
      getProcessorName: jest.fn().mockReturnValue('simulated'),
      getSupportedCurrencies: jest.fn().mockReturnValue(['USD', 'EUR', 'GBP']),
      processPayment: jest.fn(),
      checkPaymentStatus: jest.fn(),
      cancelPayment: jest.fn()
    };

    // Mock the transaction tracking service
    mockTransactionTrackingService = {
      createTransaction: jest.fn().mockImplementation(() => {
        return Promise.resolve(createSuccessResult({
          id: 'tx_123456',
          status: TransactionStatus.PENDING
        }));
      }),
      updateTransactionStatus: jest.fn().mockImplementation(() => {
        return Promise.resolve(createSuccessResult({
          id: 'tx_123456',
          status: TransactionStatus.COMPLETED
        }));
      })
    };

    // Mock the transaction repository
    mockTransactionRepository = {
      findByProcessorTransactionId: jest.fn().mockImplementation(() => {
        return Promise.resolve({
          id: 'tx_123456',
          status: TransactionStatus.PENDING,
        });
      })
    };

    // Mock the config service
    mockConfigService = {
      get: jest.fn().mockImplementation((key) => {
        if (key === 'payment.defaultProcessor') return 'stripe';
        return null;
      })
    };

    // Mock the logger
    mockLogger = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    // Create the module
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FiatBridgeService,
        { provide: StripeProcessor, useValue: mockStripeProcessor },
        { provide: SimulatedPaymentProcessor, useValue: mockSimulatedProcessor },
        { provide: TransactionTrackingService, useValue: mockTransactionTrackingService },
        { provide: TransactionRepository, useValue: mockTransactionRepository },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: Logger, useValue: mockLogger }
      ]
    }).compile();

    // Get the service
    fiatBridgeService = module.get<FiatBridgeService>(FiatBridgeService);
  });

  describe('transferFunds', () => {
    it('should process a fiat deposit successfully', async () => {
      // Arrange
      const mockTransactionId = 'tx_123456';
      
      const transferRequest = {
        userId: 'user_123',
        amount: 100,
        currency: 'USD',
        description: 'Deposit via ACH',
        preferredProcessor: 'stripe',
        metadata: {
          paymentMethodId: 'pm_123'
        }
      };

      const mockTransaction = {
        id: mockTransactionId,
        userId: 'user_123',
        amount: 100,
        currency: 'USD',
        status: TransactionStatus.PENDING,
        type: TransactionType.FIAT_DEPOSIT,
        processorName: 'stripe',
        processorTransactionId: 'pi_mock_id',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Act
      const result = await fiatBridgeService.transferFunds(transferRequest);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(expect.objectContaining({
          id: expect.any(String),
          status: TransactionStatus.PENDING,
        }));
      }
      
      expect(mockStripeProcessor.processPayment).toHaveBeenCalledWith(expect.objectContaining({
        amount: transferRequest.amount,
        currency: transferRequest.currency,
        metadata: expect.objectContaining({
          userId: transferRequest.userId,
          transactionId: expect.any(String)
        })
      }));
      
      expect(mockTransactionTrackingService.createTransaction).toHaveBeenCalledWith(expect.objectContaining({
        userId: transferRequest.userId,
        amount: transferRequest.amount,
        currency: transferRequest.currency,
        type: TransactionType.FIAT_DEPOSIT,
        processorName: 'stripe',
        status: TransactionStatus.PENDING
      }));
      
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should handle errors during fiat transfer', async () => {
      // Arrange
      const transferRequest = {
        userId: 'user_123',
        amount: 100,
        currency: 'USD',
        description: 'Deposit via ACH',
        preferredProcessor: 'stripe',
      };

      const mockTransaction = {
        id: 'tx_123456',
        userId: 'user_123',
        amount: 100,
        currency: 'USD',
        status: TransactionStatus.PENDING,
        type: TransactionType.FIAT_DEPOSIT,
        processorName: 'stripe',
        processorTransactionId: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Setup mocks for error
      mockStripeProcessor.processPayment = jest.fn().mockImplementation(() => {
        return Promise.resolve(createErrorResult(
          'PAYMENT_FAILED',
          'Payment processing failed',
          { reason: 'Card declined' }
        ));
      });

      // Act
      const result = await fiatBridgeService.transferFunds(transferRequest);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
      
      expect(mockStripeProcessor.processPayment).toHaveBeenCalled();
      expect(mockTransactionTrackingService.createTransaction).toHaveBeenCalled();
      expect(mockTransactionTrackingService.updateTransactionStatus).toHaveBeenCalledWith(
        expect.any(String),
        TransactionStatus.FAILED,
        expect.any(Object)
      );
    });
  });

  describe('checkTransactionStatus', () => {
    it('should check a transaction status successfully', async () => {
      // Arrange
      const mockTransaction = {
        id: 'tx_123456',
        userId: 'user_123',
        amount: 100,
        currency: 'USD',
        status: TransactionStatus.PENDING,
        type: TransactionType.FIAT_DEPOSIT,
        processorName: 'stripe',
        processorTransactionId: 'pi_mock_id',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Act
      const result = await fiatBridgeService.checkTransactionStatus('tx_123456');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(expect.objectContaining({
          id: 'tx_123456',
          status: expect.any(String),
        }));
      }
      
      expect(mockStripeProcessor.checkPaymentStatus).toHaveBeenCalled();
      expect(mockTransactionTrackingService.updateTransactionStatus).toHaveBeenCalled();
    });

    it('should handle transaction not found', async () => {
      // Setup mocks for error
      mockTransactionTrackingService.createTransaction = jest.fn().mockImplementation(() => {
        return Promise.resolve(createErrorResult(
          'TRANSACTION_NOT_FOUND',
          'Transaction not found'
        ));
      });

      // Act
      const result = await fiatBridgeService.checkTransactionStatus('tx_nonexistent');

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('cancelTransaction', () => {
    it('should cancel a transaction successfully', async () => {
      // Arrange
      const mockTransaction = {
        id: 'tx_123456',
        userId: 'user_123',
        amount: 100,
        currency: 'USD',
        status: TransactionStatus.PENDING,
        type: TransactionType.FIAT_DEPOSIT,
        processorName: 'stripe',
        processorTransactionId: 'pi_mock_id',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Act
      const result = await fiatBridgeService.cancelTransaction('tx_123456');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(expect.objectContaining({
          id: 'tx_123456',
          status: expect.any(String),
        }));
      }
      
      expect(mockStripeProcessor.cancelPayment).toHaveBeenCalled();
      expect(mockTransactionTrackingService.updateTransactionStatus).toHaveBeenCalled();
    });
  });
});
