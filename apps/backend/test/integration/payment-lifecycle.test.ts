// apps/backend/test/integration/payment-lifecycle.test.ts
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../../src/db/models/transaction.entity';
import { BankAccount } from '../../src/db/models/bank-account.entity';
import { FiatBridgeService } from '../../src/services/core/payment/fiat-bridge.service';
import { TransactionTrackingService } from '../../src/services/core/payment/transaction-tracking.service';
import { StripeProcessor } from '../../src/services/core/payment/stripe-processor';
import { TransactionRepository } from '../../src/db/repositories/transaction.repository';
import { Logger } from '../../src/utils/logger';
import { TransactionType } from '../../src/db/models/transaction.entity';
import { TransactionStatus } from '../../src/common/types/transaction.types';

// Mock Stripe client for testing
const mockStripeClient = {
  paymentIntents: {
    create: jest.fn(),
    retrieve: jest.fn(),
    cancel: jest.fn(),
  },
  checkout: {
    sessions: {
      create: jest.fn(),
      retrieve: jest.fn(),
    },
  },
  webhooks: {
    constructEvent: jest.fn(),
  },
};

describe('Payment Lifecycle Integration Tests', () => {
  let fiatBridgeService: FiatBridgeService;
  let transactionTrackingService: TransactionTrackingService;
  let stripeProcessor: StripeProcessor;
  let transactionRepository: TransactionRepository;

  beforeAll(async () => {
    // Create testing module with real database connection
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: 'localhost',
          port: 5432,
          username: 'postgres',
          password: '.Joseph23',
          database: 'solanahack',
          entities: [Transaction, BankAccount],
          synchronize: true, // Only for testing
        }),
        TypeOrmModule.forFeature([Transaction, BankAccount]),
      ],
      providers: [
        FiatBridgeService,
        TransactionTrackingService,
        TransactionRepository,
        {
          provide: StripeProcessor,
          useValue: {
            processPayment: jest.fn(),
            checkPaymentStatus: jest.fn(),
            cancelPayment: jest.fn(),
          },
        },
        {
          provide: 'STRIPE_CLIENT',
          useValue: mockStripeClient,
        },
        Logger,
        ConfigService,
      ],
    }).compile();

    fiatBridgeService = moduleRef.get<FiatBridgeService>(FiatBridgeService);
    transactionTrackingService = moduleRef.get<TransactionTrackingService>(TransactionTrackingService);
    stripeProcessor = moduleRef.get<StripeProcessor>(StripeProcessor);
    transactionRepository = moduleRef.get<TransactionRepository>(TransactionRepository);
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('Complete Transaction Lifecycle', () => {
    it('should process a full payment lifecycle from creation to completion', async () => {
      // 1. Set up payment request
      const userId = `test-user-${uuidv4()}`;
      const amount = 100;
      const currency = 'USD';
      
      // Mock Stripe response
      const mockPaymentIntentId = `pi_${uuidv4()}`;
      const mockClientSecret = `cs_${uuidv4()}`;
      
      (stripeProcessor.processPayment as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          processorTransactionId: mockPaymentIntentId,
          clientSecret: mockClientSecret,
          status: TransactionStatus.PENDING,
        },
      });
      
      // 2. Create transaction
      const transaction = await transactionTrackingService.createTransaction({
        userId,
        amount,
        currency,
        type: TransactionType.FIAT_DEPOSIT,
        status: TransactionStatus.PENDING,
        processorName: 'stripe',
        processorTransactionId: mockPaymentIntentId,
        metadata: { test: true },
      });
      
      expect(transaction).toBeDefined();
      expect(transaction.id).toBeDefined();
      expect(transaction.status).toBe(TransactionStatus.PENDING);
      
      // 3. Update to processing status
      await transactionTrackingService.updateTransactionStatus(
        transaction.id,
        TransactionStatus.PROCESSING,
        { reason: 'Payment processing started' }
      );
      
      // 4. Retrieve and verify status update
      const updatedTransaction = await transactionRepository.findById(transaction.id);
      expect(updatedTransaction).toBeDefined();
      expect(updatedTransaction.status).toBe(TransactionStatus.PROCESSING);
      
      // 5. Mark as completed
      await transactionTrackingService.updateTransactionStatus(
        transaction.id,
        TransactionStatus.COMPLETED,
        { reason: 'Payment successful', completedAt: new Date() }
      );
      
      // 6. Verify final state
      const completedTransaction = await transactionRepository.findById(transaction.id);
      expect(completedTransaction).toBeDefined();
      expect(completedTransaction.status).toBe(TransactionStatus.COMPLETED);
      expect(completedTransaction.metadata).toHaveProperty('test', true);
      
      // 7. Clean up test data
      await transactionRepository.remove(completedTransaction);
    });
    
    it('should handle payment failure correctly', async () => {
      // 1. Set up payment request
      const userId = `test-user-${uuidv4()}`;
      const amount = 50;
      const currency = 'USD';
      
      // Mock Stripe response
      const mockPaymentIntentId = `pi_${uuidv4()}`;
      
      (stripeProcessor.processPayment as jest.Mock).mockResolvedValue({
        success: false,
        error: {
          code: 'PAYMENT_FAILED',
          message: 'Insufficient funds',
        },
      });
      
      // 2. Create transaction
      const transaction = await transactionTrackingService.createTransaction({
        userId,
        amount,
        currency,
        type: TransactionType.FIAT_DEPOSIT,
        status: TransactionStatus.PENDING,
        processorName: 'stripe',
        processorTransactionId: mockPaymentIntentId,
        metadata: { test: true },
      });
      
      // 3. Update to failed status
      await transactionTrackingService.updateTransactionStatus(
        transaction.id,
        TransactionStatus.FAILED,
        { 
          reason: 'Payment failed',
          failureReason: 'Insufficient funds',
          failedAt: new Date()
        }
      );
      
      // 4. Verify failed status
      const failedTransaction = await transactionRepository.findById(transaction.id);
      expect(failedTransaction).toBeDefined();
      expect(failedTransaction.status).toBe(TransactionStatus.FAILED);
      expect(failedTransaction.metadata).toHaveProperty('failureReason', 'Insufficient funds');
      
      // 5. Clean up test data
      await transactionRepository.remove(failedTransaction);
    });
    
    it('should handle transaction cancellation', async () => {
      // 1. Set up payment request
      const userId = `test-user-${uuidv4()}`;
      const amount = 75;
      const currency = 'USD';
      
      // Mock Stripe response
      const mockPaymentIntentId = `pi_${uuidv4()}`;
      
      (stripeProcessor.cancelPayment as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          processorTransactionId: mockPaymentIntentId,
          status: TransactionStatus.CANCELLED,
        },
      });
      
      // 2. Create transaction
      const transaction = await transactionTrackingService.createTransaction({
        userId,
        amount,
        currency,
        type: TransactionType.FIAT_DEPOSIT,
        status: TransactionStatus.PENDING,
        processorName: 'stripe',
        processorTransactionId: mockPaymentIntentId,
        metadata: { test: true },
      });
      
      // 3. Cancel the transaction
      await transactionTrackingService.updateTransactionStatus(
        transaction.id,
        TransactionStatus.CANCELLED,
        { reason: 'User cancelled payment', cancelledAt: new Date() }
      );
      
      // 4. Verify cancellation
      const cancelledTransaction = await transactionRepository.findById(transaction.id);
      expect(cancelledTransaction).toBeDefined();
      expect(cancelledTransaction.status).toBe(TransactionStatus.CANCELLED);
      
      // 5. Clean up test data
      await transactionRepository.remove(cancelledTransaction);
    });
  });
});
