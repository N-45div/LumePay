import { Test, TestingModule } from '@nestjs/testing';
import { StripeWebhookController } from './stripe-webhook.controller';
import { TransactionTrackingService } from '../../services/core/payment/transaction-tracking.service';
import { TransactionRepository } from '../../db/repositories/transaction.repository';
import { Logger } from '../../utils/logger';
import { ConfigService } from '@nestjs/config';
import { TransactionStatus } from '../../common/types/transaction.types';
import { Request } from 'express';
import { createSuccessResult } from '../../common/types/result.types';
interface ExtendedTransactionRepository extends TransactionRepository {
  findByProcessorTransactionId: jest.Mock;
}
interface ExtendedLogger extends Logger {
  log: jest.Mock;
  error: jest.Mock;
  warn: jest.Mock;
  info: jest.Mock;
}
describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;
  let mockTransactionTrackingService: Partial<TransactionTrackingService>;
  let mockTransactionRepository: Partial<ExtendedTransactionRepository>;
  let mockConfigService: Partial<ConfigService>;
  let mockLogger: Partial<ExtendedLogger>;
  let mockStripeClient: any;
  beforeEach(async () => {
    mockTransactionTrackingService = {
      updateTransactionStatus: jest.fn().mockImplementation(() => {
        return Promise.resolve(createSuccessResult({
          id: 'tx_test',
          status: TransactionStatus.COMPLETED
        }));
      }),
    };
    mockTransactionRepository = {
      findByProcessorTransactionId: jest.fn().mockImplementation(() => {
        return Promise.resolve({
          id: 'tx_test',
          status: TransactionStatus.PENDING,
        });
      }),
      updateTransactionStatus: jest.fn(),
    };
    mockConfigService = {
      get: jest.fn().mockImplementation((key) => {
        if (key === 'STRIPE_WEBHOOK_SECRET') {
          return 'whsec_test';
        }
        return null;
      }),
    };
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    };
    mockStripeClient = {
      webhooks: {
        constructEvent: jest.fn().mockReturnValue({
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_test',
              amount: 1000,
              currency: 'usd',
              status: 'succeeded',
              metadata: {
                transactionId: 'tx_test',
              },
            },
          },
        }),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        { provide: TransactionTrackingService, useValue: mockTransactionTrackingService },
        { provide: TransactionRepository, useValue: mockTransactionRepository },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: Logger, useValue: mockLogger },
        { provide: 'STRIPE_CLIENT', useValue: mockStripeClient },
      ],
    }).compile();
    controller = module.get<StripeWebhookController>(StripeWebhookController);
  });
  describe('handleWebhook', () => {
    it('should handle payment_intent.succeeded event and update transaction status', async () => {
      const mockRequest = {
        headers: {
          'stripe-signature': 'test_signature',
        },
        rawBody: JSON.stringify({
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_test',
              amount: 1000,
              currency: 'usd',
              status: 'succeeded',
              metadata: {
                transactionId: 'tx_test',
              },
            },
          },
        }),
      } as any;
      const mockTransaction = {
        id: 'tx_test',
        status: TransactionStatus.PENDING,
      };
      const signature = 'test_signature';
      const event = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test',
            amount: 1000,
            currency: 'usd',
            status: 'succeeded',
            metadata: {
              transactionId: 'tx_test',
            },
          },
        },
      };
      const result = await controller.handleWebhook(mockRequest, signature, event);
      expect(mockLogger.log).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.received).toBe(true);
      expect(mockTransactionTrackingService.updateTransactionStatus).toHaveBeenCalledWith(
        'tx_test',
        TransactionStatus.COMPLETED,
        expect.objectContaining({
          eventType: 'payment_intent.succeeded',
        })
      );
    });
    it('should handle payment_intent.payment_failed event and update transaction status', async () => {
      const mockRequest = {
        headers: {
          'stripe-signature': 'test_signature',
        },
        rawBody: JSON.stringify({
          type: 'payment_intent.payment_failed',
          data: {
            object: {
              id: 'pi_test',
              amount: 1000,
              currency: 'usd',
              status: 'failed',
              last_payment_error: {
                message: 'Insufficient funds',
              },
              metadata: {
                transactionId: 'tx_test',
              },
            },
          },
        }),
      } as any;
      const mockTransaction = {
        id: 'tx_test',
        status: TransactionStatus.PENDING,
      };
      const signature = 'test_signature';
      const event = {
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_test',
            amount: 1000,
            currency: 'usd',
            status: 'failed',
            last_payment_error: {
              message: 'Insufficient funds',
            },
            metadata: {
              transactionId: 'tx_test',
            },
          },
        },
      };
      const result = await controller.handleWebhook(mockRequest, signature, event);
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.received).toBe(true);
      expect(mockTransactionTrackingService.updateTransactionStatus).toHaveBeenCalledWith(
        'tx_test',
        TransactionStatus.FAILED,
        expect.objectContaining({
          eventType: 'payment_intent.payment_failed',
          errorMessage: 'Insufficient funds',
        })
      );
    });
    it('should handle payment_intent.canceled event and update transaction status', async () => {
      const mockRequest = {
        headers: {
          'stripe-signature': 'test_signature',
        },
        rawBody: JSON.stringify({
          type: 'payment_intent.canceled',
          data: {
            object: {
              id: 'pi_test',
              amount: 1000,
              currency: 'usd',
              status: 'canceled',
              metadata: {
                transactionId: 'tx_test',
              },
            },
          },
        }),
      } as any;
      const signature = 'test_signature';
      const event = {
        type: 'payment_intent.canceled',
        data: {
          object: {
            id: 'pi_test',
            amount: 1000,
            currency: 'usd',
            status: 'canceled',
            metadata: {
              transactionId: 'tx_test',
            },
          },
        },
      };
      const result = await controller.handleWebhook(mockRequest, signature, event);
      expect(mockLogger.log).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.received).toBe(true);
      expect(mockTransactionTrackingService.updateTransactionStatus).toHaveBeenCalledWith(
        'tx_test',
        TransactionStatus.CANCELLED,
        expect.objectContaining({
          eventType: 'payment_intent.canceled',
        })
      );
    });
    it('should handle unknown events', async () => {
      const mockRequest = {} as any;
      const signature = 'test_signature';
      const event = {
        type: 'unknown.event',
        data: {
          object: {
            id: 'pi_test',
          },
        },
      };
      const result = await controller.handleWebhook(mockRequest, signature, event);
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.received).toBe(true);
      expect(mockTransactionTrackingService.updateTransactionStatus).not.toHaveBeenCalled();
    });
    it('should reject invalid signatures', async () => {
      mockStripeClient.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });
      const mockRequest = {
        rawBody: 'raw_body',
      } as any;
      const signature = 'invalid_signature';
      const event = {}; // This won't be used due to the error
      await expect(controller.handleWebhook(mockRequest, signature, event)).rejects.toThrow();
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockTransactionTrackingService.updateTransactionStatus).not.toHaveBeenCalled();
    });
  });
});
