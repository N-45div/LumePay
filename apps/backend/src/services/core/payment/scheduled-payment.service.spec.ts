// apps/backend/src/services/core/payment/scheduled-payment.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ScheduledPaymentService } from './scheduled-payment.service';
import { ScheduledPaymentRepository } from '../../../db/repositories/scheduled-payment.repository';
import { FiatBridgeService } from './fiat-bridge.service';
import { ConversionService } from '../conversion/conversion.service';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../../../utils/logger';
import { ScheduleType, ScheduleFrequency, ScheduleStatus } from '../../../db/models/scheduled-payment.entity';
import { addDays } from 'date-fns';

describe('ScheduledPaymentService', () => {
  let scheduledPaymentService: ScheduledPaymentService;
  let scheduledPaymentRepository: ScheduledPaymentRepository;
  let fiatBridgeService: FiatBridgeService;
  let conversionService: ConversionService;
  let configService: ConfigService;
  let logger: Logger;
  
  beforeEach(async () => {
    // Create mocks
    const mockScheduledPaymentRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      findByUserId: jest.fn(),
      findDuePayments: jest.fn(),
      incrementExecutionCount: jest.fn(),
      updateNextExecutionDate: jest.fn(),
    };
    
    const mockFiatBridgeService = {
      processDeposit: jest.fn(),
      processWithdrawal: jest.fn(),
    };
    
    const mockConversionService = {
      convertFiatToCrypto: jest.fn(),
      convertCryptoToFiat: jest.fn(),
      isSupportedFiatCurrency: jest.fn(),
      isSupportedCryptoCurrency: jest.fn(),
    };
    
    const mockConfigService = {
      get: jest.fn(),
    };
    
    const mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
    };
    
    // Create test module
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduledPaymentService,
        { provide: ScheduledPaymentRepository, useValue: mockScheduledPaymentRepository },
        { provide: FiatBridgeService, useValue: mockFiatBridgeService },
        { provide: ConversionService, useValue: mockConversionService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: Logger, useValue: mockLogger },
      ],
    }).compile();
    
    // Get services
    scheduledPaymentService = module.get<ScheduledPaymentService>(ScheduledPaymentService);
    scheduledPaymentRepository = module.get<ScheduledPaymentRepository>(ScheduledPaymentRepository);
    fiatBridgeService = module.get<FiatBridgeService>(FiatBridgeService);
    conversionService = module.get<ConversionService>(ConversionService);
    configService = module.get<ConfigService>(ConfigService);
    logger = module.get<Logger>(Logger);
  });
  
  it('should be defined', () => {
    expect(scheduledPaymentService).toBeDefined();
  });
  
  describe('createSchedule', () => {
    it('should successfully create a scheduled payment', async () => {
      // Setup test data
      const testSchedule = {
        id: 'test-id',
        userId: 'test-user',
        name: 'Monthly SOL Purchase',
        type: ScheduleType.FIAT_TO_CRYPTO,
        amount: 100,
        currency: 'USD',
        frequency: ScheduleFrequency.MONTHLY,
        nextExecutionDate: addDays(new Date(), 30),
        status: ScheduleStatus.ACTIVE,
        processorName: 'stripe',
        processorAccountId: 'acct_123',
        destinationId: 'SOL',
        executionCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Setup mocks
      (conversionService.isSupportedFiatCurrency as jest.Mock).mockReturnValue(true);
      (scheduledPaymentRepository.create as jest.Mock).mockResolvedValue(testSchedule);
      
      // Call service
      const result = await scheduledPaymentService.createSchedule({
        userId: 'test-user',
        name: 'Monthly SOL Purchase',
        type: ScheduleType.FIAT_TO_CRYPTO,
        amount: 100,
        currency: 'USD',
        frequency: ScheduleFrequency.MONTHLY,
        nextExecutionDate: addDays(new Date(), 30),
        processorName: 'stripe',
        processorAccountId: 'acct_123',
        destinationId: 'SOL'
      });
      
      // Assertions
      expect(result.success).toBe(true);
      expect(result.data).toEqual(testSchedule);
      expect(scheduledPaymentRepository.create).toHaveBeenCalled();
    });
    
    it('should fail when validation fails', async () => {
      // Setup mocks
      (conversionService.isSupportedFiatCurrency as jest.Mock).mockReturnValue(false);
      
      // Call service with invalid data (unsupported currency)
      const result = await scheduledPaymentService.createSchedule({
        userId: 'test-user',
        name: 'Monthly SOL Purchase',
        type: ScheduleType.FIAT_TO_CRYPTO,
        amount: 100,
        currency: 'XYZ', // Invalid currency
        frequency: ScheduleFrequency.MONTHLY,
        nextExecutionDate: addDays(new Date(), 30),
        processorName: 'stripe',
        processorAccountId: 'acct_123',
        destinationId: 'SOL'
      });
      
      // Assertions
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_SCHEDULE_DATA');
      expect(scheduledPaymentRepository.create).not.toHaveBeenCalled();
    });
  });
  
  describe('getUserSchedules', () => {
    it('should return schedules for a user', async () => {
      // Setup test data
      const testSchedules = [
        {
          id: 'test-id-1',
          userId: 'test-user',
          name: 'Monthly SOL Purchase',
          type: ScheduleType.FIAT_TO_CRYPTO,
          amount: 100,
          currency: 'USD',
          frequency: ScheduleFrequency.MONTHLY,
          nextExecutionDate: addDays(new Date(), 30),
          status: ScheduleStatus.ACTIVE
        },
        {
          id: 'test-id-2',
          userId: 'test-user',
          name: 'Weekly ETH DCA',
          type: ScheduleType.FIAT_TO_CRYPTO,
          amount: 50,
          currency: 'USD',
          frequency: ScheduleFrequency.WEEKLY,
          nextExecutionDate: addDays(new Date(), 7),
          status: ScheduleStatus.ACTIVE
        }
      ];
      
      // Setup mocks
      (scheduledPaymentRepository.findByUserId as jest.Mock).mockResolvedValue(testSchedules);
      
      // Call service
      const result = await scheduledPaymentService.getUserSchedules('test-user');
      
      // Assertions
      expect(result.success).toBe(true);
      expect(result.data).toEqual(testSchedules);
      expect(scheduledPaymentRepository.findByUserId).toHaveBeenCalledWith('test-user');
    });
  });
  
  describe('executeScheduledPayment', () => {
    it('should execute a FIAT_TO_CRYPTO scheduled payment', async () => {
      // Setup test data
      const testSchedule = {
        id: 'test-id',
        userId: 'test-user',
        name: 'Monthly SOL Purchase',
        type: ScheduleType.FIAT_TO_CRYPTO,
        amount: 100,
        currency: 'USD',
        frequency: ScheduleFrequency.MONTHLY,
        nextExecutionDate: addDays(new Date(), 30),
        status: ScheduleStatus.ACTIVE,
        processorName: 'stripe',
        processorAccountId: 'acct_123',
        destinationId: 'SOL',
        executionCount: 0
      };
      
      // Setup mocks
      (conversionService.convertFiatToCrypto as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          fromAmount: 100,
          fromCurrency: 'USD',
          toAmount: 10,
          toCurrency: 'SOL',
          fee: 1,
          rate: 0.1,
          transactionId: 'tx-123'
        }
      });
      
      (scheduledPaymentRepository.incrementExecutionCount as jest.Mock).mockResolvedValue({
        ...testSchedule,
        executionCount: 1
      });
      
      // Call private method through a wrapper for testing
      // @ts-ignore - accessing private method for testing
      const result = await scheduledPaymentService.executeScheduledPayment(testSchedule);
      
      // Assertions
      expect(result).toBe(true);
      expect(conversionService.convertFiatToCrypto).toHaveBeenCalledWith(
        testSchedule.userId,
        testSchedule.amount,
        testSchedule.currency,
        testSchedule.destinationId
      );
      expect(scheduledPaymentRepository.incrementExecutionCount).toHaveBeenCalledWith(testSchedule.id);
    });
  });
  
  describe('pauseSchedule', () => {
    it('should pause a scheduled payment', async () => {
      // Setup test data
      const testSchedule = {
        id: 'test-id',
        userId: 'test-user',
        status: ScheduleStatus.ACTIVE
      };
      
      const pausedSchedule = {
        ...testSchedule,
        status: ScheduleStatus.PAUSED
      };
      
      // Setup mocks
      (scheduledPaymentRepository.findById as jest.Mock).mockResolvedValue(testSchedule);
      (scheduledPaymentRepository.update as jest.Mock).mockResolvedValue(pausedSchedule);
      
      // Call service
      const result = await scheduledPaymentService.pauseSchedule('test-id');
      
      // Assertions
      expect(result.success).toBe(true);
      expect(result.data).toEqual(pausedSchedule);
      expect(scheduledPaymentRepository.update).toHaveBeenCalledWith('test-id', {
        status: ScheduleStatus.PAUSED
      });
    });
  });
  
  describe('resumeSchedule', () => {
    it('should resume a paused scheduled payment', async () => {
      // Setup test data
      const testSchedule = {
        id: 'test-id',
        userId: 'test-user',
        status: ScheduleStatus.PAUSED
      };
      
      const resumedSchedule = {
        ...testSchedule,
        status: ScheduleStatus.ACTIVE
      };
      
      // Setup mocks
      (scheduledPaymentRepository.findById as jest.Mock).mockResolvedValue(testSchedule);
      (scheduledPaymentRepository.update as jest.Mock).mockResolvedValue(resumedSchedule);
      
      // Call service
      const result = await scheduledPaymentService.resumeSchedule('test-id');
      
      // Assertions
      expect(result.success).toBe(true);
      expect(result.data).toEqual(resumedSchedule);
      expect(scheduledPaymentRepository.update).toHaveBeenCalledWith('test-id', {
        status: ScheduleStatus.ACTIVE
      });
    });
    
    it('should fail to resume a non-paused scheduled payment', async () => {
      // Setup test data
      const testSchedule = {
        id: 'test-id',
        userId: 'test-user',
        status: ScheduleStatus.ACTIVE // Already active
      };
      
      // Setup mocks
      (scheduledPaymentRepository.findById as jest.Mock).mockResolvedValue(testSchedule);
      
      // Call service
      const result = await scheduledPaymentService.resumeSchedule('test-id');
      
      // Assertions
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SCHEDULE_NOT_PAUSED');
      expect(scheduledPaymentRepository.update).not.toHaveBeenCalled();
    });
  });
  
  describe('getUserScheduleStats', () => {
    it('should return schedule statistics for a user', async () => {
      // Setup test data
      const testSchedules = [
        {
          id: 'test-id-1',
          userId: 'test-user',
          type: ScheduleType.FIAT_TO_CRYPTO,
          status: ScheduleStatus.ACTIVE,
          nextExecutionDate: addDays(new Date(), 5)
        },
        {
          id: 'test-id-2',
          userId: 'test-user',
          type: ScheduleType.FIAT_TO_CRYPTO,
          status: ScheduleStatus.PAUSED,
          nextExecutionDate: addDays(new Date(), 10)
        },
        {
          id: 'test-id-3',
          userId: 'test-user',
          type: ScheduleType.CRYPTO_TO_FIAT,
          status: ScheduleStatus.COMPLETED,
          nextExecutionDate: addDays(new Date(), 15)
        }
      ];
      
      // Setup mocks
      (scheduledPaymentRepository.findByUserId as jest.Mock).mockResolvedValue(testSchedules);
      
      // Call service
      const result = await scheduledPaymentService.getUserScheduleStats('test-user');
      
      // Assertions
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        total: 3,
        active: 1,
        paused: 1,
        completed: 1,
        failed: 0,
        byType: {
          [ScheduleType.FIAT_TO_CRYPTO]: 2,
          [ScheduleType.CRYPTO_TO_FIAT]: 1
        },
        upcomingPayments: [testSchedules[0]] // Only active schedules in upcoming
      });
    });
  });
});
