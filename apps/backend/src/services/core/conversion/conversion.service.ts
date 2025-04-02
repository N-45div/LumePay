// apps/backend/src/services/core/conversion/conversion.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FiatBridgeService } from '../payment/fiat-bridge.service';
import { SolanaService } from '@/services/core/blockchain/solana.service';
import { TransactionTrackingService, TransactionType as TrackingTransactionType } from '../payment/transaction-tracking.service';
import { TransactionStatus } from '../../../common/types/transaction.types';
import { Logger } from '../../../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { Result, createSuccessResult, createErrorResult } from '../../../common/types/result.types';

// Result types
export interface ConversionResult {
  fromAmount: number;
  fromCurrency: string;
  toAmount: number;
  toCurrency: string;
  rate: number;
  fee: number;
  transactionId: string;
}

export interface ConversionError {
  code: string;
  message: string;
  details?: any;
}

export enum ConversionDirection {
  FIAT_TO_CRYPTO = 'FIAT_TO_CRYPTO',
  CRYPTO_TO_FIAT = 'CRYPTO_TO_FIAT'
}

@Injectable()
export class ConversionService {
  // Exchange rate cache to minimize external API calls
  private exchangeRateCache: Map<string, { rate: number; timestamp: number }> = new Map();
  private readonly RATE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  
  // Supported fiat currencies
  private readonly supportedFiatCurrencies = ['USD', 'EUR', 'GBP'];
  
  // Supported crypto currencies
  private readonly supportedCryptoCurrencies = ['SOL', 'USDC'];
  
  constructor(
    private readonly fiatBridgeService: FiatBridgeService,
    private readonly solanaService: SolanaService,
    private readonly transactionTrackingService: TransactionTrackingService,
    private readonly configService: ConfigService,
    private readonly logger: Logger
  ) {}
  
  /**
   * Convert fiat currency to cryptocurrency
   */
  async convertFiatToCrypto(
    userId: string,
    amount: number,
    fromCurrency: string,
    toCurrency: string
  ): Promise<Result<ConversionResult>> {
    try {
      // Validate currencies
      if (!this.isFiatCurrencySupported(fromCurrency)) {
        return createErrorResult(
          'UNSUPPORTED_FIAT_CURRENCY',
          `Fiat currency ${fromCurrency} is not supported`
        );
      }
      
      if (!this.isCryptoCurrencySupported(toCurrency)) {
        return createErrorResult(
          'UNSUPPORTED_CRYPTO_CURRENCY',
          `Cryptocurrency ${toCurrency} is not supported`
        );
      }
      
      // Get exchange rate
      const exchangeRate = await this.getExchangeRate(fromCurrency, toCurrency);
      if (!exchangeRate.success || !exchangeRate.data) {
        return exchangeRate.error ? 
          createErrorResult(exchangeRate.error.code, exchangeRate.error.message, exchangeRate.error.details) :
          createErrorResult('EXCHANGE_RATE_ERROR', 'Failed to get exchange rate');
      }
      
      // Calculate conversion amount (considering fees)
      const fee = this.calculateFee(amount, ConversionDirection.FIAT_TO_CRYPTO);
      const convertedAmount = (amount - fee) * exchangeRate.data.rate;
      
      // Create transaction record
      const transactionResult = await this.transactionTrackingService.createTransaction({
        userId,
        amount,
        currency: fromCurrency,
        type: TrackingTransactionType.FIAT_TO_CRYPTO,
        status: TransactionStatus.PROCESSING,
        destinationId: toCurrency,
        metadata: {
          conversionDetails: {
            fromCurrency,
            toCurrency,
            rate: exchangeRate.data.rate,
            fee,
            estimatedConvertedAmount: convertedAmount
          }
        }
      });
      
      if (!transactionResult.success) {
        return createErrorResult(
          'TRANSACTION_TRACKING_ERROR',
          `Failed to create transaction record: ${transactionResult.error?.message || 'Unknown error'}`,
          transactionResult.error
        );
      }
      
      const transactionId = transactionResult.data.id;
      
      // For real implementation, here we would initiate the actual purchase of crypto
      // For now, we'll just simulate the completion of the conversion
      
      // Update transaction to completed
      const updateResult = await this.transactionTrackingService.updateTransactionStatus({
        transactionId,
        status: TransactionStatus.COMPLETED,
        metadata: {
          completedAt: new Date(),
          conversionResult: {
            fromAmount: amount,
            fromCurrency,
            toAmount: convertedAmount,
            toCurrency,
            rate: exchangeRate.data.rate,
            fee
          }
        }
      });
      
      if (!updateResult.success) {
        this.logger.warn(`Failed to update transaction status: ${updateResult.error?.message || 'Unknown error'}`);
        // Continue anyway as the conversion itself may have succeeded
      }
      
      // Return conversion result
      return createSuccessResult({
        fromAmount: amount,
        fromCurrency,
        toAmount: convertedAmount,
        toCurrency,
        rate: exchangeRate.data.rate,
        fee,
        transactionId
      });
      
    } catch (error: any) {
      this.logger.error(`Error converting ${fromCurrency} to ${toCurrency}: ${error.message}`, {
        stack: error.stack,
        errorDetails: error.toString()
      });
      return createErrorResult(
        'CONVERSION_FAILED',
        'Failed to convert currency',
        error.message
      );
    }
  }
  
  /**
   * Convert cryptocurrency to fiat currency
   */
  async convertCryptoToFiat(
    userId: string,
    amount: number,
    fromCurrency: string,
    toCurrency: string
  ): Promise<Result<ConversionResult>> {
    try {
      // Validate currencies
      if (!this.isCryptoCurrencySupported(fromCurrency)) {
        return createErrorResult(
          'UNSUPPORTED_CRYPTO_CURRENCY',
          `Cryptocurrency ${fromCurrency} is not supported`
        );
      }
      
      if (!this.isFiatCurrencySupported(toCurrency)) {
        return createErrorResult(
          'UNSUPPORTED_FIAT_CURRENCY',
          `Fiat currency ${toCurrency} is not supported`
        );
      }
      
      // Get exchange rate
      const exchangeRate = await this.getExchangeRate(fromCurrency, toCurrency);
      if (!exchangeRate.success || !exchangeRate.data) {
        return exchangeRate.error ? 
          createErrorResult(exchangeRate.error.code, exchangeRate.error.message, exchangeRate.error.details) :
          createErrorResult('EXCHANGE_RATE_ERROR', 'Failed to get exchange rate');
      }
      
      // Calculate conversion amount (considering fees)
      const fee = this.calculateFee(amount, ConversionDirection.CRYPTO_TO_FIAT);
      const convertedAmount = (amount - fee) * exchangeRate.data.rate;
      
      // Create transaction record
      const transactionResult = await this.transactionTrackingService.createTransaction({
        userId,
        amount,
        currency: fromCurrency,
        type: TrackingTransactionType.CRYPTO_TO_FIAT,
        status: TransactionStatus.PROCESSING,
        destinationId: toCurrency,
        metadata: {
          conversionDetails: {
            fromCurrency,
            toCurrency,
            rate: exchangeRate.data.rate,
            fee,
            estimatedConvertedAmount: convertedAmount
          }
        }
      });
      
      if (!transactionResult.success) {
        return createErrorResult(
          'TRANSACTION_TRACKING_ERROR',
          `Failed to create transaction record: ${transactionResult.error?.message || 'Unknown error'}`,
          transactionResult.error
        );
      }
      
      const transactionId = transactionResult.data.id;
      
      // For real implementation, here we would initiate the actual sale of crypto
      // For now, we'll just simulate the completion of the conversion
      
      // Update transaction to completed
      const updateResult = await this.transactionTrackingService.updateTransactionStatus({
        transactionId,
        status: TransactionStatus.COMPLETED,
        metadata: {
          completedAt: new Date(),
          conversionResult: {
            fromAmount: amount,
            fromCurrency,
            toAmount: convertedAmount,
            toCurrency,
            rate: exchangeRate.data.rate,
            fee
          }
        }
      });
      
      if (!updateResult.success) {
        this.logger.warn(`Failed to update transaction status: ${updateResult.error?.message || 'Unknown error'}`);
        // Continue anyway as the conversion itself may have succeeded
      }
      
      // Return conversion result
      return createSuccessResult({
        fromAmount: amount,
        fromCurrency,
        toAmount: convertedAmount,
        toCurrency,
        rate: exchangeRate.data.rate,
        fee,
        transactionId
      });
      
    } catch (error: any) {
      this.logger.error(`Error converting ${fromCurrency} to ${toCurrency}: ${error.message}`, {
        stack: error.stack,
        errorDetails: error.toString()
      });
      return createErrorResult(
        'CONVERSION_FAILED',
        'Failed to convert currency',
        error.message
      );
    }
  }
  
  /**
   * Get current exchange rate between two currencies
   */
  public async getExchangeRate(
    fromCurrency: string,
    toCurrency: string
  ): Promise<Result<{ rate: number }>> {
    try {
      // Generate cache key
      const cacheKey = `${fromCurrency.toUpperCase()}_${toCurrency.toUpperCase()}`;
      
      // Check cache first
      const cachedRate = this.exchangeRateCache.get(cacheKey);
      if (cachedRate && Date.now() - cachedRate.timestamp < this.RATE_CACHE_TTL_MS) {
        return createSuccessResult({ rate: cachedRate.rate });
      }
      
      // For production, here we would call an external API to get the current exchange rate
      // For now, we'll use hardcoded mock rates
      let rate: number;
      
      if (fromCurrency === 'USD' && toCurrency === 'SOL') {
        // 1 USD = 0.1 SOL (example rate)
        rate = 0.1;
      } else if (fromCurrency === 'SOL' && toCurrency === 'USD') {
        // 1 SOL = 10 USD (example rate)
        rate = 10;
      } else if (fromCurrency === 'USD' && toCurrency === 'USDC') {
        // 1 USD = 1 USDC (stablecoin)
        rate = 1;
      } else if (fromCurrency === 'USDC' && toCurrency === 'USD') {
        // 1 USDC = 1 USD (stablecoin)
        rate = 1;
      } else if (fromCurrency === 'EUR' && toCurrency === 'SOL') {
        // 1 EUR = 0.11 SOL (example rate)
        rate = 0.11;
      } else if (fromCurrency === 'SOL' && toCurrency === 'EUR') {
        // 1 SOL = 9 EUR (example rate)
        rate = 9;
      } else {
        return createErrorResult(
          'UNSUPPORTED_CURRENCY_PAIR',
          `Exchange rate for ${fromCurrency} to ${toCurrency} is not available`
        );
      }
      
      // Store in cache
      this.exchangeRateCache.set(cacheKey, { rate, timestamp: Date.now() });
      
      return createSuccessResult({ rate });
      
    } catch (error: any) {
      this.logger.error(`Error getting exchange rate: ${error.message}`, {
        stack: error.stack,
        errorDetails: error.toString()
      });
      return createErrorResult(
        'EXCHANGE_RATE_ERROR',
        'Failed to get exchange rate',
        error.message
      );
    }
  }
  
  /**
   * Calculate conversion fee
   */
  private calculateFee(amount: number, direction: ConversionDirection): number {
    // Get fee rate from config (default to 1% for fiat to crypto, 0.5% for crypto to fiat)
    let feeRate: number;
    
    if (direction === ConversionDirection.FIAT_TO_CRYPTO) {
      feeRate = this.configService.get<number>('FIAT_TO_CRYPTO_FEE_RATE', 0.01);
    } else {
      feeRate = this.configService.get<number>('CRYPTO_TO_FIAT_FEE_RATE', 0.005);
    }
    
    // Calculate fee
    return amount * feeRate;
  }
  
  /**
   * Check if fiat currency is supported
   */
  private isFiatCurrencySupported(currency: string): boolean {
    return this.supportedFiatCurrencies.includes(currency.toUpperCase());
  }
  
  /**
   * Check if cryptocurrency is supported
   */
  private isCryptoCurrencySupported(currency: string): boolean {
    return this.supportedCryptoCurrencies.includes(currency.toUpperCase());
  }
  
  /**
   * Get supported fiat currencies
   */
  getSupportedFiatCurrencies(): string[] {
    return [...this.supportedFiatCurrencies];
  }
  
  /**
   * Get supported cryptocurrencies
   */
  getSupportedCryptoCurrencies(): string[] {
    return [...this.supportedCryptoCurrencies];
  }

  /**
   * Check if fiat currency is supported (public method)
   */
  isSupportedFiatCurrency(currency: string): boolean {
    return this.isFiatCurrencySupported(currency);
  }

  /**
   * Check if cryptocurrency is supported (public method)
   */
  isSupportedCryptoCurrency(currency: string): boolean {
    return this.isCryptoCurrencySupported(currency);
  }
}
