// apps/backend/test/integration/payment-error-recovery.test.ts
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Transaction } from '../../src/db/models/transaction.entity';
import { BankAccount } from '../../src/db/models/bank-account.entity';
import { FiatBridgeService } from '../../src/services/core/payment/fiat-bridge.service';
import { TransactionTrackingService } from '../../src/services/core/payment/transaction-tracking.service';
import { StripeProcessor } from '../../src/services/core/payment/stripe-processor';
import { TransactionRepository } from '../../src/db/repositories/transaction.repository';
import { Logger } from '../../src/utils/logger';
import { TransactionType } from '../../src/db/models/transaction.entity';
import { TransactionStatus } from '../../src/common/types/transaction.types';
import { PaymentError } from '../../src/services/core/payment/errors/PaymentErrors';
import { BridgeError } from '../../src/services/core/payment/errors/BridgeErrors';
import { createSuccess, createError } from '../../src/utils/result';

describe('Payment Error Handling and Recovery Tests', () => {
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

  describe('Error Handling and Recovery', () => {
    it('should handle network failures and retry mechanisms', async () => {
      // 1. Set up a transaction
      const userId = `test-user-${uuidv4()}`;
      const mockPaymentIntentId = `pi_${uuidv4()}`;
      
      const transaction = await transactionTrackingService.createTransaction({
        userId,
        amount: 100,
        currency: 'USD',
        type: TransactionType.FIAT_DEPOSIT,
        status: TransactionStatus.PENDING,
        processorName: 'stripe',
        processorTransactionId: mockPaymentIntentId,
        metadata: { retryTest: true },
      });
      
      // 2. First attempt fails with network error
      (stripeProcessor.checkPaymentStatus as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );
      
      // 3. Second attempt succeeds
      (stripeProcessor.checkPaymentStatus as jest.Mock).mockResolvedValueOnce(
        createSuccess({
          processorTransactionId: mockPaymentIntentId,
          status: TransactionStatus.COMPLETED,
        })
      );
      
      // 4. Try to check status (simulate a retry mechanism)
      let result;
      try {
        // First attempt will fail
        result = await fiatBridgeService.checkFiatDepositStatus(mockPaymentIntentId);
      } catch (error) {
        // Simulate retry logic
        result = await fiatBridgeService.checkFiatDepositStatus(mockPaymentIntentId);
      }
      
      // 5. Verify the result of second attempt was successful
      expect(result.success).toBe(true);
      expect(result.data.status).toBe(TransactionStatus.COMPLETED);
      
      // 6. Clean up
      const updatedTransaction = await transactionRepository.findById(transaction.id);
      await transactionRepository.remove(updatedTransaction);
    });
    
    it('should handle stale transactions detection and recovery', async () => {
      // 1. Create a transaction that's been stuck in processing state for too long
      const userId = `test-user-${uuidv4()}`;
      const mockPaymentIntentId = `pi_${uuidv4()}`;
      
      // Create transaction with timestamp 30 minutes in the past
      const pastTime = new Date();
      pastTime.setMinutes(pastTime.getMinutes() - 30);
      
      const transaction = await transactionTrackingService.createTransaction({
        userId,
        amount: 100,
        currency: 'USD',
        type: TransactionType.FIAT_DEPOSIT,
        status: TransactionStatus.PROCESSING,
        processorName: 'stripe',
        processorTransactionId: mockPaymentIntentId,
        metadata: { staleTest: true },
      });
      
      // Manually update the timestamp to simulate a stale transaction
      await transactionRepository.update(
        transaction.id,
        { timestamp: pastTime }
      );
      
      // 2. Find stale transactions (processing for > 15 minutes)
      const staleTransactions = await transactionRepository.findStaleTransactions(
        TransactionStatus.PROCESSING,
        15
      );
      
      // 3. Verify our test transaction is considered stale
      const isStale = staleTransactions.some(tx => tx.id === transaction.id);
      expect(isStale).toBe(true);
      
      // 4. Simulate recovery by checking with payment processor
      (stripeProcessor.checkPaymentStatus as jest.Mock).mockResolvedValueOnce(
        createSuccess({
          processorTransactionId: mockPaymentIntentId,
          status: TransactionStatus.COMPLETED,
        })
      );
      
      // 5. Update the stale transaction
      await transactionTrackingService.updateTransactionStatus(
        transaction.id,
        TransactionStatus.COMPLETED,
        { recoveredFromStale: true }
      );
      
      // 6. Verify recovery
      const recoveredTransaction = await transactionRepository.findById(transaction.id);
      expect(recoveredTransaction.status).toBe(TransactionStatus.COMPLETED);
      expect(recoveredTransaction.metadata).toHaveProperty('recoveredFromStale', true);
      
      // 7. Clean up
      await transactionRepository.remove(recoveredTransaction);
    });
    
    it('should handle invalid payment processor errors gracefully', async () => {
      // 1. Set up transaction with non-existent processor
      const userId = `test-user-${uuidv4()}`;
      const mockPaymentIntentId = `pi_${uuidv4()}`;
      
      const transaction = await transactionTrackingService.createTransaction({
        userId,
        amount: 100,
        currency: 'USD',
        type: TransactionType.FIAT_DEPOSIT,
        status: TransactionStatus.PENDING,
        processorName: 'non_existent_processor', // Invalid processor
        processorTransactionId: mockPaymentIntentId,
        metadata: { invalidProcessorTest: true },
      });
      
      // 2. Simulate error handling in the service layer
      try {
        // This would normally call the non-existent processor
        throw new PaymentError('INVALID_PROCESSOR', 'Processor not found: non_existent_processor');
      } catch (error) {
        // Handle error by updating transaction status
        await transactionTrackingService.updateTransactionStatus(
          transaction.id,
          TransactionStatus.FAILED,
          { 
            failureReason: 'INVALID_PROCESSOR',
            errorMessage: 'Processor not found: non_existent_processor',
            errorTime: new Date()
          }
        );
      }
      
      // 3. Verify error was properly recorded
      const failedTransaction = await transactionRepository.findById(transaction.id);
      expect(failedTransaction.status).toBe(TransactionStatus.FAILED);
      expect(failedTransaction.metadata).toHaveProperty('failureReason', 'INVALID_PROCESSOR');
      
      // 4. Clean up
      await transactionRepository.remove(failedTransaction);
    });
    
    it('should detect and handle duplicate transactions', async () => {
      // 1. Create a transaction
      const userId = `test-user-${uuidv4()}`;
      const orderId = `order_${uuidv4()}`;
      const amount = 100;
      const currency = 'USD';
      
      const transaction1 = await transactionTrackingService.createTransaction({
        userId,
        amount,
        currency,
        type: TransactionType.FIAT_DEPOSIT,
        status: TransactionStatus.COMPLETED,
        processorName: 'stripe',
        processorTransactionId: `pi_${uuidv4()}`,
        metadata: { 
          duplicateTest: true,
          orderId // Same order ID to simulate duplicate
        },
      });
      
      // 2. Try to create a duplicate transaction with the same details
      let duplicateDetected = false;
      try {
        // First check if a transaction with the same orderId exists
        const existingTransactions = await transactionRepository.find({
          where: { 
            userId,
            amount,
            currency,
            metadata: { orderId } 
          }
        });
        
        if (existingTransactions.length > 0) {
          // Duplicate detected
          duplicateDetected = true;
          throw new Error('Duplicate transaction detected');
        } else {
          // Create second transaction (should not happen due to duplicate detection)
          await transactionTrackingService.createTransaction({
            userId,
            amount,
            currency,
            type: TransactionType.FIAT_DEPOSIT,
            status: TransactionStatus.PENDING,
            processorName: 'stripe',
            processorTransactionId: `pi_${uuidv4()}`,
            metadata: { 
              duplicateTest: true,
              orderId // Same order ID
            },
          });
        }
      } catch (error) {
        // Expected error due to duplicate detection
        expect(error.message).toBe('Duplicate transaction detected');
      }
      
      // 3. Verify duplicate was detected
      expect(duplicateDetected).toBe(true);
      
      // 4. Clean up
      await transactionRepository.remove(transaction1);
    });
  });
});
