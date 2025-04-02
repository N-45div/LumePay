// apps/backend/test/unit/scheduled-payment-processor.test.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ScheduledPaymentProcessorService } from '../../src/services/core/payment/scheduled-payment-processor.service';
import { ScheduledPaymentService } from '../../src/services/core/payment/scheduled-payment.service';
import { ScheduledPaymentRepository } from '../../src/db/repositories/scheduled-payment.repository';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../../src/utils/logger';
import { 
  ScheduleStatus, 
  ScheduleType, 
  ScheduleFrequency 
} from '../../src/db/models/scheduled-payment.entity';
import { createSuccessResult } from '../../src/common/types/result.types';
import { getRepositoryToken } from '@nestjs/typeorm';

// Create a simple mock interface for testing
interface MockScheduledPayment {
  id: string;
  userId: string;
  name: string;
  type: ScheduleType;
  amount: number;
  currency: string;
  frequency: ScheduleFrequency;
  nextExecutionDate: Date;
  status: ScheduleStatus;
  metadata: any;
  processorName: string;
  processorAccountId: string | null;
  destinationId: string;
  executionCount: number;
  maxExecutions: number | null;
  lastExecutionDate: Date | null;
  endDate: Date | null;
  failureCount: number;
  lastFailureMessage: string | null;
  lastFailureDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

describe('ScheduledPaymentProcessorService', () => {
  let service: ScheduledPaymentProcessorService;
  let scheduledPaymentService: ScheduledPaymentService;
  let scheduledPaymentRepository: any; // Changed type to any since it's a mock
  let configService: ConfigService;

  // Mock data with correct types
  const mockScheduledPayments: MockScheduledPayment[] = [
    {
      id: '1',
      userId: 'user1',
      name: 'Monthly SOL Purchase',
      type: ScheduleType.FIAT_TO_CRYPTO,
      amount: 100,
      currency: 'USD',
      frequency: ScheduleFrequency.MONTHLY,
      nextExecutionDate: new Date(Date.now() - 1000), // Due in the past
      status: ScheduleStatus.ACTIVE,
      metadata: null,
      processorName: 'stripe',
      processorAccountId: null,
      destinationId: 'SOL',
      executionCount: 0,
      maxExecutions: null,
      lastExecutionDate: null,
      endDate: null,
      failureCount: 0,
      lastFailureMessage: null,
      lastFailureDate: null,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: '2',
      userId: 'user2',
      name: 'Weekly BTC Purchase',
      type: ScheduleType.FIAT_TO_CRYPTO,
      amount: 50,
      currency: 'USD',
      frequency: ScheduleFrequency.WEEKLY,
      nextExecutionDate: new Date(Date.now() - 2000), // Due in the past
      status: ScheduleStatus.ACTIVE,
      metadata: null,
      processorName: 'stripe',
      processorAccountId: null,
      destinationId: 'BTC',
      executionCount: 1,
      maxExecutions: null,
      lastExecutionDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7), // 7 days ago
      endDate: null,
      failureCount: 0,
      lastFailureMessage: null,
      lastFailureDate: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  // Mocks
  const mockScheduledPaymentRepository = {
    findDue: jest.fn().mockResolvedValue(mockScheduledPayments),
    findAll: jest.fn().mockResolvedValue(mockScheduledPayments),
    findByStatus: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
    findById: jest.fn().mockResolvedValue(mockScheduledPayments[0])
  };

  const mockScheduledPaymentService = {
    executeNow: jest.fn().mockResolvedValue(createSuccessResult(true)),
    getPaymentsRequiringAttention: jest.fn().mockResolvedValue(createSuccessResult({
      failedPayments: [],
      retryPayments: []
    }))
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key, defaultValue) => defaultValue)
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduledPaymentProcessorService,
        { provide: ScheduledPaymentService, useValue: mockScheduledPaymentService },
        { 
          provide: getRepositoryToken(ScheduledPaymentRepository), 
          useValue: mockScheduledPaymentRepository 
        },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: Logger, useValue: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }
      ],
    }).compile();

    service = module.get<ScheduledPaymentProcessorService>(ScheduledPaymentProcessorService);
    scheduledPaymentService = module.get<ScheduledPaymentService>(ScheduledPaymentService);
    // Get the repository using the token
    scheduledPaymentRepository = module.get(getRepositoryToken(ScheduledPaymentRepository));
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processScheduledPayments', () => {
    it('should process due payments', async () => {
      // Execute
      await service.processScheduledPayments();

      // Verify
      expect(mockScheduledPaymentRepository.findDue).toHaveBeenCalledTimes(1);
      expect(mockScheduledPaymentService.executeNow).toHaveBeenCalledTimes(2);
      expect(mockScheduledPaymentRepository.update).toHaveBeenCalledTimes(2);
    });

    it('should handle empty due payments', async () => {
      // Setup mocks
      mockScheduledPaymentRepository.findDue.mockResolvedValueOnce([]);

      // Execute
      await service.processScheduledPayments();

      // Verify
      expect(mockScheduledPaymentRepository.findDue).toHaveBeenCalledTimes(1);
      expect(mockScheduledPaymentService.executeNow).not.toHaveBeenCalled();
    });

    it('should handle payment execution errors', async () => {
      // Mock payment execution failure for just this test
      mockScheduledPaymentService.executeNow.mockResolvedValueOnce({
        success: false,
        error: {
          code: 'TEST_ERROR',
          message: 'Test error message',
          details: null
        }
      });
      
      // Execute
      await service.processScheduledPayments();

      // Verify
      expect(mockScheduledPaymentRepository.findDue).toHaveBeenCalledTimes(1);
      expect(mockScheduledPaymentService.executeNow).toHaveBeenCalledTimes(2);
      
      // Should update payment with failure info
      expect(mockScheduledPaymentRepository.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          failureCount: expect.any(Number),
          lastFailureMessage: expect.any(String),
          lastFailureDate: expect.any(Date)
        })
      );
    });
  });

  describe('getMonitoringStats', () => {
    it('should return monitoring statistics', async () => {
      // Execute
      const stats = await service.getMonitoringStats();

      // Verify
      expect(stats).toBeDefined();
      expect(stats.totalScheduledPayments).toBe(2);
      expect(stats.activeScheduledPayments).toBe(2);
      expect(stats.paymentsByType).toBeDefined();
      expect(stats.paymentsByFrequency).toBeDefined();
    });
  });
});
