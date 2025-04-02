// apps/backend/src/services/core/conversion/conversion.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConversionService } from './conversion.service';
import { FiatBridgeService } from '../payment/fiat-bridge.service';
import { SolanaService } from '../blockchain/solana.service';
import { TransactionTrackingService } from '../payment/transaction-tracking.service';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../../../utils/logger';
import { TransactionStatus } from '../../../common/types/transaction.types';

describe('ConversionService', () => {
  let conversionService: ConversionService;
  let fiatBridgeService: FiatBridgeService;
  let solanaService: SolanaService;
  let transactionTrackingService: TransactionTrackingService;
  let configService: ConfigService;
  let logger: Logger;
  
  beforeEach(async () => {
    // Create mocks
    const mockFiatBridgeService = {
      processDeposit: jest.fn(),
      processWithdrawal: jest.fn(),
      checkDepositStatus: jest.fn(),
    };
    
    const mockSolanaService = {
      getBalance: jest.fn(),
      transferSol: jest.fn(),
      getServicePublicKey: jest.fn(),
      isValidPublicKey: jest.fn(),
    };
    
    const mockTransactionTrackingService = {
      createTransaction: jest.fn(),
      updateTransactionStatus: jest.fn(),
      findById: jest.fn(),
    };
    
    const mockConfigService = {
      get: jest.fn().mockImplementation((key, defaultValue) => {
        if (key === 'FIAT_TO_CRYPTO_FEE_RATE') return 0.01;
        if (key === 'CRYPTO_TO_FIAT_FEE_RATE') return 0.005;
        return defaultValue;
      }),
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
        ConversionService,
        { provide: FiatBridgeService, useValue: mockFiatBridgeService },
        { provide: SolanaService, useValue: mockSolanaService },
        { provide: TransactionTrackingService, useValue: mockTransactionTrackingService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: Logger, useValue: mockLogger },
      ],
    }).compile();
    
    // Get services
    conversionService = module.get<ConversionService>(ConversionService);
    fiatBridgeService = module.get<FiatBridgeService>(FiatBridgeService);
    solanaService = module.get<SolanaService>(SolanaService);
    transactionTrackingService = module.get<TransactionTrackingService>(TransactionTrackingService);
    configService = module.get<ConfigService>(ConfigService);
    logger = module.get<Logger>(Logger);
  });
  
  it('should be defined', () => {
    expect(conversionService).toBeDefined();
  });
  
  describe('convertFiatToCrypto', () => {
    it('should successfully convert fiat to crypto', async () => {
      // Mock transaction tracking service
      (transactionTrackingService.createTransaction as jest.Mock).mockResolvedValue({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      
      // Call method
      const result = await conversionService.convertFiatToCrypto(
        'test-user-123',
        100,
        'USD',
        'SOL'
      );
      
      // Check result
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.success && result.data) {
        expect(result.data.fromAmount).toBe(100);
        expect(result.data.fromCurrency).toBe('USD');
        expect(result.data.toCurrency).toBe('SOL');
        expect(result.data.fee).toBeDefined();
        expect(result.data.rate).toBeDefined();
      }
      
      // Verify transaction tracking
      expect(transactionTrackingService.createTransaction).toHaveBeenCalled();
      expect(transactionTrackingService.updateTransactionStatus).toHaveBeenCalled();
    });
    
    it('should reject unsupported fiat currency', async () => {
      // Call method with unsupported currency
      const result = await conversionService.convertFiatToCrypto(
        'test-user-123',
        100,
        'XYZ', // Unsupported currency
        'SOL'
      );
      
      // Check result
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      if (!result.success && result.error) {
        expect(result.error.code).toBe('UNSUPPORTED_FIAT_CURRENCY');
      }
    });
    
    it('should reject unsupported crypto currency', async () => {
      // Call method with unsupported currency
      const result = await conversionService.convertFiatToCrypto(
        'test-user-123',
        100,
        'USD',
        'XYZ' // Unsupported currency
      );
      
      // Check result
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      if (!result.success && result.error) {
        expect(result.error.code).toBe('UNSUPPORTED_CRYPTO_CURRENCY');
      }
    });
    
    it('should apply correct fee rate', async () => {
      // Call method
      const result = await conversionService.convertFiatToCrypto(
        'test-user-123',
        100,
        'USD',
        'SOL'
      );
      
      // Check fee calculation
      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.fee).toBe(1); // 1% of 100
      }
    });
  });
  
  describe('convertCryptoToFiat', () => {
    it('should successfully convert crypto to fiat', async () => {
      // Mock transaction tracking service
      (transactionTrackingService.createTransaction as jest.Mock).mockResolvedValue({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      
      // Call method
      const result = await conversionService.convertCryptoToFiat(
        'test-user-123',
        10,
        'SOL',
        'USD'
      );
      
      // Check result
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.success && result.data) {
        expect(result.data.fromAmount).toBe(10);
        expect(result.data.fromCurrency).toBe('SOL');
        expect(result.data.toCurrency).toBe('USD');
        expect(result.data.fee).toBeDefined();
        expect(result.data.rate).toBeDefined();
      }
      
      // Verify transaction tracking
      expect(transactionTrackingService.createTransaction).toHaveBeenCalled();
      expect(transactionTrackingService.updateTransactionStatus).toHaveBeenCalled();
    });
    
    it('should reject unsupported crypto currency', async () => {
      // Call method with unsupported currency
      const result = await conversionService.convertCryptoToFiat(
        'test-user-123',
        10,
        'XYZ', // Unsupported currency
        'USD'
      );
      
      // Check result
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      if (!result.success && result.error) {
        expect(result.error.code).toBe('UNSUPPORTED_CRYPTO_CURRENCY');
      }
    });
    
    it('should reject unsupported fiat currency', async () => {
      // Call method with unsupported currency
      const result = await conversionService.convertCryptoToFiat(
        'test-user-123',
        10,
        'SOL',
        'XYZ' // Unsupported currency
      );
      
      // Check result
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      if (!result.success && result.error) {
        expect(result.error.code).toBe('UNSUPPORTED_FIAT_CURRENCY');
      }
    });
    
    it('should apply correct fee rate', async () => {
      // Call method
      const result = await conversionService.convertCryptoToFiat(
        'test-user-123',
        100,
        'SOL',
        'USD'
      );
      
      // Check fee calculation
      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.fee).toBe(0.5); // 0.5% of 100
      }
    });
  });
  
  describe('getSupportedCurrencies', () => {
    it('should return supported fiat currencies', () => {
      const fiatCurrencies = conversionService.getSupportedFiatCurrencies();
      expect(fiatCurrencies).toContain('USD');
      expect(fiatCurrencies).toContain('EUR');
      expect(fiatCurrencies).toContain('GBP');
    });
    
    it('should return supported cryptocurrencies', () => {
      const cryptoCurrencies = conversionService.getSupportedCryptoCurrencies();
      expect(cryptoCurrencies).toContain('SOL');
      expect(cryptoCurrencies).toContain('USDC');
    });
  });
});
