// apps/backend/src/services/bridge/crypto-fiat-bridge.service.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { Result, createSuccess, createError, isFailure, isSuccess, convertResultTypes } from '../../utils/result';
import { FiatBridgeService } from '../core/payment/fiat-bridge.service';
import { SolanaWalletService } from '../blockchain/solana/wallet.service';
import { WalletType } from '../blockchain/solana/interfaces/wallet.interface';
import { TransactionTrackingService } from '../core/payment/transaction-tracking.service';
import { TransactionType } from '../../db/models/transaction.entity';
import { 
  TransactionStatus, 
  BridgeError, 
  BridgeErrorCode, 
  PaymentError, 
  convertPaymentErrorToBridgeError 
} from '../../common/types/transaction.types';
import { Transaction } from '../../db/models/transaction.entity';

/**
 * Exchange direction for crypto-fiat conversions
 */
export enum ExchangeDirection {
  FIAT_TO_CRYPTO = 'fiat_to_crypto',
  CRYPTO_TO_FIAT = 'crypto_to_fiat'
}

/**
 * Parameters for crypto-fiat exchange
 */
export interface ExchangeParams {
  userId: string;
  amount: number;
  fromCurrency: string; // E.g., 'USD', 'SOL', 'USDC'
  toCurrency: string;   // E.g., 'SOL', 'USD', 'USDC'
  direction: ExchangeDirection;
  sourceId?: string;    // Bank account ID or wallet ID
  destinationId?: string; // Wallet ID or bank account ID
  metadata?: Record<string, any>;
}

/**
 * Result of an exchange operation
 */
export interface ExchangeResult {
  id: string;
  userId: string;
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  exchangeRate: number;
  feeAmount: number; 
  feeCurrency: string;
  direction: ExchangeDirection;
  sourceId: string;
  destinationId: string;
  status: TransactionStatus;
  timestamp: Date;
  platformTransactionId: string;
  metadata?: Record<string, any>;
}

/**
 * Service to bridge between crypto and fiat systems
 */
@Injectable()
export class CryptoFiatBridgeService {
  private logger: Logger;
  private exchangeFeePercentage: number;
  
  constructor(
    private configService: ConfigService,
    private fiatBridgeService: FiatBridgeService,
    private solanaWalletService: SolanaWalletService,
    private transactionTrackingService: TransactionTrackingService
  ) {
    this.logger = new Logger('CryptoFiatBridgeService');
    
    // Get configuration for exchange fees
    this.exchangeFeePercentage = this.configService.get<number>(
      'exchange.feePercentage', 
      0.5 // Default 0.5% fee
    );
    
    this.logger.info(`Initialized with exchange fee percentage: ${this.exchangeFeePercentage}%`);
  }
  
  /**
   * Exchange between fiat and crypto currencies
   */
  async exchange(params: ExchangeParams): Promise<Result<ExchangeResult, BridgeError>> {
    try {
      this.logger.info(`Processing exchange from ${params.fromCurrency} to ${params.toCurrency}`);
      
      // Validate exchange parameters
      if (params.amount <= 0) {
        return createError(new BridgeError('INVALID_AMOUNT', 'Exchange amount must be greater than 0'));
      }
      
      // Validate currency direction
      if (params.direction === ExchangeDirection.FIAT_TO_CRYPTO) {
        if (!this.isFiatCurrency(params.fromCurrency)) {
          return createError(new BridgeError('INVALID_CURRENCY', `${params.fromCurrency} is not a valid fiat currency`));
        }
        if (!this.isCryptoCurrency(params.toCurrency)) {
          return createError(new BridgeError('INVALID_CURRENCY', `${params.toCurrency} is not a valid crypto currency`));
        }
      } else {
        if (!this.isCryptoCurrency(params.fromCurrency)) {
          return createError(new BridgeError('INVALID_CURRENCY', `${params.fromCurrency} is not a valid crypto currency`));
        }
        if (!this.isFiatCurrency(params.toCurrency)) {
          return createError(new BridgeError('INVALID_CURRENCY', `${params.toCurrency} is not a valid fiat currency`));
        }
      }
      
      // Get current exchange rate
      const exchangeRate = await this.getExchangeRate(params.fromCurrency, params.toCurrency);
      
      // Calculate converted amount and fee
      const feeAmount = (params.amount * this.exchangeFeePercentage) / 100;
      const amountAfterFee = params.amount - feeAmount;
      const convertedAmount = amountAfterFee * exchangeRate;
      
      // Process the exchange based on direction
      let result: ExchangeResult;
      
      try {
        if (params.direction === ExchangeDirection.FIAT_TO_CRYPTO) {
          result = await this.processFiatToCrypto(
            params,
            exchangeRate,
            feeAmount,
            convertedAmount
          );
        } else {
          result = await this.processCryptoToFiat(
            params,
            exchangeRate,
            feeAmount,
            convertedAmount
          );
        }
      } catch (innerError: any) {
        // Explicitly cast the error to ensure TypeScript understands the return type
        const bridgeError = this.ensureBridgeError(innerError);
        return { success: false, error: bridgeError } as Result<ExchangeResult, BridgeError>;
      }
      
      // Track the transaction separately without affecting the result's type
      this.trackExchangeTransaction(params, result, exchangeRate, convertedAmount, feeAmount).catch(err => {
        this.logger.error(`Failed to track exchange transaction: ${err.message}`);
      });
      
      // Explicitly define return type to help TypeScript understand type compatibility
      return { success: true, data: result } as Result<ExchangeResult, BridgeError>;
    } catch (error: any) {
      this.logger.error(`Exchange error: ${error.message}`);
      
      // Use our helper to ensure we always return BridgeError with explicit typecasting
      const bridgeError = this.ensureBridgeError(error);
      return { success: false, error: bridgeError } as Result<ExchangeResult, BridgeError>;
    }
  }

  /**
   * Track an exchange transaction without affecting the type of the main exchange method
   * This is pulled out to prevent TypeScript confusion with Result types
   */
  private async trackExchangeTransaction(
    params: ExchangeParams,
    result: ExchangeResult,
    exchangeRate: number,
    convertedAmount: number,
    feeAmount: number
  ): Promise<void> {
    try {
      const transactionParams = {
        userId: params.userId,
        amount: params.amount,
        currency: params.fromCurrency,
        type: params.direction === ExchangeDirection.FIAT_TO_CRYPTO
          ? TransactionType.FIAT_TO_CRYPTO
          : TransactionType.CRYPTO_TO_FIAT,
        status: TransactionStatus.COMPLETED,
        sourceId: params.sourceId,
        destinationId: params.destinationId,
        processorName: 'internal',
        processorTransactionId: result.id,
        metadata: {
          exchangeRate,
          convertedAmount,
          toCurrency: params.toCurrency,
          feeAmount,
          feeCurrency: params.fromCurrency,
          ...params.metadata
        }
      };

      // Get the tracking result from transaction tracking service
      const trackingResult = await this.transactionTrackingService.createTransaction(transactionParams);
      
      // Log tracking results without affecting the type system
      if (isSuccess(trackingResult)) {
        this.logger.info(`Successfully tracked exchange transaction: ${trackingResult.data.id}`);
      } else {
        this.logger.warn(`Failed to track exchange transaction: ${trackingResult.error.message}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to track exchange transaction: ${error.message}`);
      throw error; // Re-throw for the caller's catch block
    }
  }
  
  /**
   * Process fiat to crypto exchange
   */
  private async processFiatToCrypto(
    params: ExchangeParams,
    exchangeRate: number,
    feeAmount: number,
    convertedAmount: number
  ): Promise<ExchangeResult> {
    try {
      // Check if the user has a wallet for the destination currency
      let destinationWalletId = params.destinationId;
      
      if (!destinationWalletId) {
        // Create a new wallet if not specified
        try {
          const newWallet = await this.solanaWalletService.createWallet({
            userId: params.userId,
            type: WalletType.USER,
            label: `${params.toCurrency} Wallet`,
            metadata: {
              createdFor: 'fiat_to_crypto_exchange'
            }
          });
          
          destinationWalletId = newWallet.id;
        } catch (walletError: any) {
          throw new BridgeError('WALLET_NOT_FOUND', `Failed to create wallet: ${walletError.message}`);
        }
      }
      
      // In a real application, we would transfer the tokens to the user's wallet
      // For this simulation, we'll just log the action
      this.logger.info(`Simulating transfer of ${convertedAmount} ${params.toCurrency} to wallet ${destinationWalletId}`);
      
      // Create exchange record
      const exchangeId = uuidv4();
      
      return {
        id: exchangeId,
        userId: params.userId,
        amount: params.amount,
        fromCurrency: params.fromCurrency,
        toCurrency: params.toCurrency,
        exchangeRate,
        feeAmount,
        feeCurrency: params.fromCurrency,
        direction: ExchangeDirection.FIAT_TO_CRYPTO,
        sourceId: params.sourceId || 'default_bank_account',
        destinationId: destinationWalletId,
        status: TransactionStatus.COMPLETED,
        timestamp: new Date(),
        platformTransactionId: uuidv4(),
        metadata: params.metadata
      };
    } catch (error: any) {
      if (error instanceof BridgeError) {
        throw error;
      }
      throw new BridgeError('EXCHANGE_FAILED', error.message);
    }
  }
  
  /**
   * Process crypto to fiat exchange
   */
  private async processCryptoToFiat(
    params: ExchangeParams,
    exchangeRate: number,
    feeAmount: number,
    convertedAmount: number
  ): Promise<ExchangeResult> {
    try {
      // Verify source wallet ownership
      let sourceWalletId = params.sourceId;
      
      if (!sourceWalletId) {
        // Get the first available wallet for the user
        try {
          sourceWalletId = await this.getUserWalletOrThrow(params.userId, params.fromCurrency);
        } catch (walletError: any) {
          if (walletError instanceof BridgeError) {
            throw walletError;
          }
          throw new BridgeError('WALLET_NOT_FOUND', walletError.message);
        }
      }
      
      // In a real application, we would transfer the crypto from the user's wallet
      // and credit their bank account with the converted amount
      this.logger.info(`Simulating transfer of ${params.amount} ${params.fromCurrency} from wallet ${sourceWalletId}`);
      this.logger.info(`Simulating credit of ${convertedAmount} ${params.toCurrency} to bank account`);
      
      // Create exchange record
      const exchangeId = uuidv4();
      
      return {
        id: exchangeId,
        userId: params.userId,
        amount: params.amount,
        fromCurrency: params.fromCurrency,
        toCurrency: params.toCurrency,
        exchangeRate,
        feeAmount,
        feeCurrency: params.fromCurrency,
        direction: ExchangeDirection.CRYPTO_TO_FIAT,
        sourceId: sourceWalletId,
        destinationId: params.destinationId || 'default_bank_account',
        status: TransactionStatus.COMPLETED,
        timestamp: new Date(),
        platformTransactionId: uuidv4(),
        metadata: params.metadata
      };
    } catch (error: any) {
      if (error instanceof BridgeError) {
        throw error;
      }
      throw new BridgeError('EXCHANGE_FAILED', error.message);
    }
  }
  
  /**
   * Get wallet balance for a user or throw if no wallet is found
   */
  private async getUserWalletOrThrow(userId: string, currency?: string): Promise<string> {
    try {
      // In a real application, we would get a wallet for the specific currency
      const wallets = await this.solanaWalletService.getUserWallets(userId);
      
      if (wallets.length === 0) {
        throw new BridgeError('WALLET_NOT_FOUND', `No ${currency || 'crypto'} wallet found for user ${userId}`);
      }
      
      return wallets[0].id; // Return first wallet for simplicity
    } catch (error: any) {
      if (error instanceof BridgeError) {
        throw error;
      }
      throw new BridgeError('WALLET_NOT_FOUND', error.message);
    }
  }

  /**
   * Get current exchange rate between two currencies
   * In a real application, this would call an external price oracle or exchange API
   */
  private async getExchangeRate(fromCurrency: string, toCurrency: string): Promise<number> {
    try {
      // Simulate exchange rates for demonstration
      const mockRates: Record<string, Record<string, number>> = {
        'USD': {
          'SOL': 100.5,    // 1 USD = 0.01 SOL
          'USDC': 0.99,    // 1 USD = 0.99 USDC
        },
        'SOL': {
          'USD': 100.0,    // 1 SOL = 100 USD
          'USDC': 100.0,   // 1 SOL = 100 USDC
        },
        'USDC': {
          'USD': 1.01,     // 1 USDC = 1.01 USD
          'SOL': 0.01,     // 1 USDC = 0.01 SOL
        }
      };
      
      if (mockRates[fromCurrency] && mockRates[fromCurrency][toCurrency]) {
        return mockRates[fromCurrency][toCurrency];
      }
      
      throw new BridgeError('EXCHANGE_FAILED', `Exchange rate not available for ${fromCurrency} to ${toCurrency}`);
    } catch (error: any) {
      if (error instanceof BridgeError) {
        throw error;
      }
      throw new BridgeError('EXCHANGE_FAILED', error.message);
    }
  }
  
  /**
   * Check if a currency is a fiat currency
   */
  private isFiatCurrency(currency: string): boolean {
    const fiatCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CNY'];
    return fiatCurrencies.includes(currency);
  }
  
  /**
   * Check if a currency is a crypto currency
   */
  private isCryptoCurrency(currency: string): boolean {
    const cryptoCurrencies = ['SOL', 'USDC', 'BTC', 'ETH'];
    return cryptoCurrencies.includes(currency);
  }

  /**
   * Convert a PaymentError to a BridgeError
   */
  private convertPaymentErrorToBridgeError(error: PaymentError): BridgeError {
    // Map PaymentError codes to BridgeErrorCode
    let bridgeErrorCode: BridgeErrorCode;
    
    switch (error.code) {
      case 'INVALID_AMOUNT':
        bridgeErrorCode = 'INVALID_AMOUNT';
        break;
      case 'INVALID_CURRENCY':
        bridgeErrorCode = 'INVALID_CURRENCY';
        break;
      case 'INSUFFICIENT_FUNDS':
        bridgeErrorCode = 'INSUFFICIENT_FUNDS';
        break;
      case 'TRANSACTION_NOT_FOUND':
      case 'INVALID_ACCOUNT':
      case 'ACCOUNT_NOT_FOUND':
        bridgeErrorCode = 'ACCOUNT_NOT_FOUND';
        break;
      case 'RATE_LIMIT_EXCEEDED':
        bridgeErrorCode = 'RATE_LIMIT_EXCEEDED';
        break;
      case 'PAYMENT_FAILED':
      case 'PROVIDER_ERROR':
      default:
        bridgeErrorCode = 'PROCESSING_ERROR';
    }
    
    return new BridgeError(bridgeErrorCode, error.message);
  }

  /**
   * Convert any Result<T, PaymentError> to Result<T, BridgeError>
   */
  private convertResultError<T>(result: Result<T, PaymentError>): Result<T, BridgeError> {
    if (isSuccess(result)) {
      return result;
    } else {
      return createError(this.convertPaymentErrorToBridgeError(result.error));
    }
  }

  // Additional helper methods to manage error type conversions
  private ensureBridgeError(error: any): BridgeError {
    if (error instanceof BridgeError) {
      return error;
    }
    if (error instanceof PaymentError) {
      return convertPaymentErrorToBridgeError(error);
    }
    return new BridgeError('PROCESSING_ERROR', error.message || 'Unknown error');
  }
}
