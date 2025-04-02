// apps/backend/test/integration/stripe-webhook.test.ts
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Transaction } from '../../src/db/models/transaction.entity';
import { BankAccount } from '../../src/db/models/bank-account.entity';
import { StripeWebhookController } from '../../src/api/controllers/stripe-webhook.controller';
import { TransactionTrackingService } from '../../src/services/core/payment/transaction-tracking.service';
import { TransactionRepository } from '../../src/db/repositories/transaction.repository';
import { Logger } from '../../src/utils/logger';
import { TransactionStatus } from '../../src/common/types/transaction.types';
import { TransactionType } from '../../src/db/models/transaction.entity';

// Mock Stripe client for testing
const mockStripeClient = {
  webhooks: {
    constructEvent: jest.fn(),
  },
};

// Helper to create mock webhook events
const createMockWebhookEvent = (type, paymentIntent) => ({
  type,
  data: {
    object: paymentIntent
  }
});

describe('Stripe Webhook Integration Tests', () => {
  let webhookController: StripeWebhookController;
  let transactionTrackingService: TransactionTrackingService;
  let transactionRepository: TransactionRepository;
  let configService: ConfigService;

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
      controllers: [StripeWebhookController],
      providers: [
        TransactionTrackingService,
        TransactionRepository,
        {
          provide: 'STRIPE_CLIENT',
          useValue: mockStripeClient,
        },
        Logger,
        ConfigService,
      ],
    }).compile();

    webhookController = moduleRef.get<StripeWebhookController>(StripeWebhookController);
    transactionTrackingService = moduleRef.get<TransactionTrackingService>(TransactionTrackingService);
    transactionRepository = moduleRef.get<TransactionRepository>(TransactionRepository);
    configService = moduleRef.get<ConfigService>(ConfigService);
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('Webhook Event Processing', () => {
    it('should process payment_intent.succeeded event and update transaction status', async () => {
      // 1. Create a test transaction in the database
      const processorTransactionId = `pi_${uuidv4()}`;
      const userId = `test-user-${uuidv4()}`;
      
      const transaction = await transactionTrackingService.createTransaction({
        userId,
        amount: 100,
        currency: 'USD',
        type: TransactionType.FIAT_DEPOSIT,
        status: TransactionStatus.PROCESSING,
        processorName: 'stripe',
        processorTransactionId,
        metadata: { test: true },
      });
      
      // 2. Create mock payment intent succeeded event
      const mockPaymentIntent = {
        id: processorTransactionId,
        object: 'payment_intent',
        amount: 10000, // In cents
        currency: 'usd',
        status: 'succeeded',
        metadata: {
          transactionId: transaction.id,
        },
      };
      
      const mockEvent = createMockWebhookEvent('payment_intent.succeeded', mockPaymentIntent);
      
      // 3. Mock Stripe signature verification
      mockStripeClient.webhooks.constructEvent.mockReturnValue(mockEvent);
      
      // 4. Process the webhook event
      const rawBody = Buffer.from(JSON.stringify(mockEvent));
      const mockRequest = {
        headers: {
          'stripe-signature': 'test_signature'
        },
        rawBody,
      };
      
      await webhookController.handleWebhook(mockRequest as any);
      
      // 5. Verify transaction was updated to Completed
      const updatedTransaction = await transactionRepository.findById(transaction.id);
      expect(updatedTransaction).toBeDefined();
      expect(updatedTransaction.status).toBe(TransactionStatus.COMPLETED);
      
      // 6. Clean up test data
      await transactionRepository.remove(updatedTransaction);
    });
    
    it('should process payment_intent.payment_failed event and update transaction status', async () => {
      // 1. Create a test transaction in the database
      const processorTransactionId = `pi_${uuidv4()}`;
      const userId = `test-user-${uuidv4()}`;
      
      const transaction = await transactionTrackingService.createTransaction({
        userId,
        amount: 100,
        currency: 'USD',
        type: TransactionType.FIAT_DEPOSIT,
        status: TransactionStatus.PROCESSING,
        processorName: 'stripe',
        processorTransactionId,
        metadata: { test: true },
      });
      
      // 2. Create mock payment intent failed event
      const mockPaymentIntent = {
        id: processorTransactionId,
        object: 'payment_intent',
        amount: 10000, // In cents
        currency: 'usd',
        status: 'requires_payment_method',
        last_payment_error: {
          message: 'Your card was declined.',
          code: 'card_declined',
        },
        metadata: {
          transactionId: transaction.id,
        },
      };
      
      const mockEvent = createMockWebhookEvent('payment_intent.payment_failed', mockPaymentIntent);
      
      // 3. Mock Stripe signature verification
      mockStripeClient.webhooks.constructEvent.mockReturnValue(mockEvent);
      
      // 4. Process the webhook event
      const rawBody = Buffer.from(JSON.stringify(mockEvent));
      const mockRequest = {
        headers: {
          'stripe-signature': 'test_signature'
        },
        rawBody,
      };
      
      await webhookController.handleWebhook(mockRequest as any);
      
      // 5. Verify transaction was updated to Failed
      const updatedTransaction = await transactionRepository.findById(transaction.id);
      expect(updatedTransaction).toBeDefined();
      expect(updatedTransaction.status).toBe(TransactionStatus.FAILED);
      expect(updatedTransaction.metadata).toHaveProperty('failureReason');
      
      // 6. Clean up test data
      await transactionRepository.remove(updatedTransaction);
    });
    
    it('should handle webhook signature verification errors', async () => {
      // 1. Create a test transaction in the database
      const processorTransactionId = `pi_${uuidv4()}`;
      const userId = `test-user-${uuidv4()}`;
      
      const transaction = await transactionTrackingService.createTransaction({
        userId,
        amount: 100,
        currency: 'USD',
        type: TransactionType.FIAT_DEPOSIT,
        status: TransactionStatus.PROCESSING,
        processorName: 'stripe',
        processorTransactionId,
        metadata: { test: true },
      });
      
      // 2. Mock Stripe signature verification to throw an error
      mockStripeClient.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });
      
      // 3. Process the webhook event
      const rawBody = Buffer.from(JSON.stringify({}));
      const mockRequest = {
        headers: {
          'stripe-signature': 'invalid_signature'
        },
        rawBody,
      };
      
      // 4. Verify signature verification error is thrown
      await expect(webhookController.handleWebhook(mockRequest as any)).rejects.toThrow('Invalid signature');
      
      // 5. Verify transaction status was not changed
      const unchangedTransaction = await transactionRepository.findById(transaction.id);
      expect(unchangedTransaction).toBeDefined();
      expect(unchangedTransaction.status).toBe(TransactionStatus.PROCESSING);
      
      // 6. Clean up test data
      await transactionRepository.remove(unchangedTransaction);
    });
  });
});
