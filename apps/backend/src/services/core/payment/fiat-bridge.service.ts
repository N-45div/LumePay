// apps/backend/src/services/core/payment/fiat-bridge.service.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../../../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { Result, createSuccess, createError, isSuccess, isFailure } from '../../../utils/result';
import { TransactionTrackingService } from './transaction-tracking.service';
import { TransactionStatus } from '../../../common/types/transaction.types';
import { TransactionType } from './transaction-tracking.service';
import { PaymentError } from './errors/PaymentErrors';
import { 
  IPaymentProcessor,
  ProcessorPaymentRequest,
  ProcessorPaymentResponse,
  ProcessorStatusRequest
} from './interfaces/payment-processor.interface';
import { SimulatedPaymentProcessor } from './processors/simulated-processor';
import { StripeProcessor } from './processors/stripe-processor';

/**
 * Parameters for a fiat transfer
 */
export interface FiatTransferParams {
  userId: string;
  amount: number;
  currency: string;
  sourceAccountId?: string;
  destinationAccountId?: string;
  description?: string;
  preferredProcessor?: string;
  metadata?: Record<string, any>;
}

/**
 * Result of a fiat transfer
 */
export interface FiatTransferResult {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  sourceAccountId?: string;
  destinationAccountId?: string;
  status: TransactionStatus;
  processorName: string;
  processorTransactionId?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Service for bridging between different fiat payment processors
 */
@Injectable()
export class FiatBridgeService {
  private readonly logger = new Logger(FiatBridgeService.name);
  private readonly processors: Map<string, IPaymentProcessor> = new Map();
  private defaultProcessorName: string;
  
  constructor(
    private configService: ConfigService,
    private transactionTrackingService: TransactionTrackingService,
    private simulatedProcessor: SimulatedPaymentProcessor,
    private stripeProcessor: StripeProcessor
  ) {
    // Register available processors
    this.registerProcessor(this.simulatedProcessor);
    this.registerProcessor(this.stripeProcessor);
    
    // Set default processor from config or use simulated if not specified
    this.defaultProcessorName = this.configService.get<string>(
      'payment.defaultProcessor', 
      this.simulatedProcessor.getProcessorName()
    );
    
    this.logger.info(`FiatBridgeService initialized with ${this.processors.size} payment processors. Default: ${this.defaultProcessorName}`);
  }
  
  /**
   * Register a payment processor
   */
  registerProcessor(processor: IPaymentProcessor): void {
    this.processors.set(processor.getProcessorName(), processor);
    this.logger.info(`Registered payment processor: ${processor.getProcessorName()}`);
  }
  
  /**
   * Get an appropriate processor for a payment
   */
  private getProcessor(currency: string, preferredProcessor?: string): Result<IPaymentProcessor, PaymentError> {
    // If preferred processor specified, try to use it
    if (preferredProcessor && this.processors.has(preferredProcessor)) {
      const processor = this.processors.get(preferredProcessor)!;
      
      if (processor.supportsCurrency(currency)) {
        return createSuccess(processor);
      }
      
      this.logger.warn(`Preferred processor ${preferredProcessor} does not support ${currency}`);
    }
    
    // Find a processor that supports the currency
    for (const processor of this.processors.values()) {
      if (processor.supportsCurrency(currency)) {
        return createSuccess(processor);
      }
    }
    
    return createError(new PaymentError('UNSUPPORTED_CURRENCY', `No processor available for currency: ${currency}`));
  }
  
  /**
   * Transfer funds between accounts using an appropriate payment processor
   */
  async transferFunds(params: FiatTransferParams): Promise<Result<FiatTransferResult, PaymentError>> {
    try {
      this.logger.info(`Processing fiat transfer of ${params.amount} ${params.currency} for user ${params.userId}`);
      
      // Find an appropriate processor
      const processorResult = this.getProcessor(params.currency, params.preferredProcessor);
      
      if (isFailure(processorResult)) {
        return createError(processorResult.error);
      }
      
      const selectedProcessor = processorResult.data;
      
      // Create transaction record
      const createTransactionResult = await this.transactionTrackingService.createTransaction({
        userId: params.userId,
        type: TransactionType.FIAT_TRANSFER,
        amount: params.amount,
        currency: params.currency,
        status: TransactionStatus.PENDING,
        processorName: selectedProcessor.getProcessorName(),
        metadata: {
          sourceAccountId: params.sourceAccountId,
          destinationAccountId: params.destinationAccountId,
          description: params.description,
          ...params.metadata
        }
      });
      
      if (isFailure(createTransactionResult)) {
        return createTransactionResult;
      }
      
      const transaction = createTransactionResult.data;
      
      // Process payment with selected processor
      const processorRequest: ProcessorPaymentRequest = {
        userId: params.userId,
        amount: params.amount,
        currency: params.currency,
        transactionId: transaction.id, // Pass transaction ID to the processor
        sourceId: params.sourceAccountId,
        destinationId: params.destinationAccountId,
        description: params.description,
        metadata: params.metadata
      };
      
      // Process the payment
      const paymentResult = await selectedProcessor.processPayment(processorRequest);
      
      if (isFailure(paymentResult)) {
        return createError(paymentResult.error);
      }
      
      const paymentResponse = paymentResult.data;
      
      // Update transaction status
      const updateResult = await this.transactionTrackingService.updateTransactionStatus({
        transactionId: transaction.id,
        status: paymentResponse.status,
        metadata: {
          processorTransactionId: paymentResponse.processorTransactionId,
          processorMetadata: paymentResponse.metadata
        }
      });
      
      if (isFailure(updateResult)) {
        this.logger.error(`Failed to update transaction status: ${updateResult.error.message}`);
        return createError(new PaymentError('STATUS_UPDATE_FAILED', updateResult.error.message));
      }
      
      // Return the FiatTransferResult
      const result: FiatTransferResult = {
        id: transaction.id,
        userId: params.userId,
        amount: params.amount,
        currency: params.currency,
        sourceAccountId: params.sourceAccountId,
        destinationAccountId: params.destinationAccountId,
        status: paymentResponse.status,
        processorName: paymentResponse.processorName,
        processorTransactionId: paymentResponse.processorTransactionId,
        timestamp: new Date(),
        metadata: {
          ...params.metadata,
          processorMetadata: paymentResponse.metadata
        }
      };
      
      return createSuccess(result);
    } catch (error: any) {
      this.logger.error(`Fiat transfer error: ${error.message}`);
      return createError(new PaymentError('TRANSFER_FAILED', error.message));
    }
  }
  
  /**
   * Check the status of a transaction and update it if needed
   */
  async checkTransactionStatus(transactionId: string): Promise<Result<FiatTransferResult, PaymentError>> {
    try {
      // Get the transaction from tracking service
      const transactionResult = await this.transactionTrackingService.getTransaction(transactionId);
      
      if (isFailure(transactionResult)) {
        return createError(new PaymentError('TRANSACTION_NOT_FOUND', `Transaction ${transactionId} not found`));
      }
      
      const transaction = transactionResult.data;
      
      // If no processor info, can't check status
      if (!transaction.processorName || !transaction.processorTransactionId) {
        return createError(new PaymentError('INVALID_TRANSACTION', 'Transaction missing processor information'));
      }
      
      // Get the processor
      const processor = this.processors.get(transaction.processorName);
      
      if (!processor) {
        return createError(new PaymentError('PROCESSOR_NOT_FOUND', `Processor ${transaction.processorName} not available`));
      }
      
      // Check status with processor
      const statusRequest: ProcessorStatusRequest = {
        processorName: transaction.processorName,
        processorTransactionId: transaction.processorTransactionId
      };
      
      const statusResult = await processor.checkPaymentStatus(statusRequest);
      
      if (isFailure(statusResult)) {
        return createError(statusResult.error);
      }
      
      const processorStatus = statusResult.data;
      
      // If status has changed, update the transaction
      if (processorStatus.status !== transaction.status) {
        this.logger.info(`Updating transaction ${transaction.id} status from ${transaction.status} to ${processorStatus.status}`);
        
        const updateResult = await this.transactionTrackingService.updateTransactionStatus({
          transactionId: transaction.id,
          status: processorStatus.status,
          metadata: {
            updatedAt: new Date(),
            processorMetadata: processorStatus.metadata
          }
        });
        
        if (isFailure(updateResult)) {
          this.logger.error(`Failed to update transaction status: ${updateResult.error.message}`);
          return createError(new PaymentError('STATUS_UPDATE_FAILED', updateResult.error.message));
        }
        
        transaction.status = processorStatus.status;
        transaction.metadata = {
          ...transaction.metadata,
          processorMetadata: processorStatus.metadata,
          statusUpdatedAt: new Date().toISOString()
        };
      }
      
      // Return the FiatTransferResult
      const result: FiatTransferResult = {
        id: transaction.id,
        userId: transaction.userId,
        amount: transaction.amount,
        currency: transaction.currency,
        sourceAccountId: transaction.sourceId,
        destinationAccountId: transaction.destinationId,
        status: transaction.status,
        processorName: transaction.processorName,
        processorTransactionId: transaction.processorTransactionId,
        timestamp: transaction.createdAt,
        metadata: transaction.metadata
      };
      
      return createSuccess(result);
    } catch (error: any) {
      this.logger.error(`Error checking transaction status: ${error.message}`);
      return createError(new PaymentError('STATUS_CHECK_FAILED', error.message));
    }
  }
  
  /**
   * Cancel a transaction if possible
   */
  async cancelTransaction(transactionId: string): Promise<Result<FiatTransferResult, PaymentError>> {
    try {
      // Get the transaction from tracking service
      const transactionResult = await this.transactionTrackingService.getTransaction(transactionId);
      
      if (isFailure(transactionResult)) {
        return createError(new PaymentError('TRANSACTION_NOT_FOUND', `Transaction ${transactionId} not found`));
      }
      
      const transaction = transactionResult.data;
      
      // Check if transaction is in a cancellable state
      if (transaction.status !== TransactionStatus.PENDING && transaction.status !== TransactionStatus.PROCESSING) {
        return createError(new PaymentError('INVALID_TRANSACTION_STATE', 
          `Cannot cancel transaction in ${transaction.status} state`));
      }
      
      // If no processor info, can't cancel
      if (!transaction.processorName || !transaction.processorTransactionId) {
        return createError(new PaymentError('INVALID_TRANSACTION', 'Transaction missing processor information'));
      }
      
      // Get the processor
      const processor = this.processors.get(transaction.processorName);
      
      if (!processor) {
        return createError(new PaymentError('PROCESSOR_NOT_FOUND', `Processor ${transaction.processorName} not available`));
      }
      
      // Check if processor supports cancellation
      if (!processor.cancelPayment) {
        return createError(new PaymentError('CANCELLATION_NOT_SUPPORTED', 
          `Processor ${transaction.processorName} does not support cancellation`));
      }
      
      // Request cancellation from processor
      const cancelResult = await processor.cancelPayment(transaction.processorTransactionId);
      
      if (isFailure(cancelResult)) {
        return createError(cancelResult.error);
      }
      
      const processorResponse = cancelResult.data;
      
      // Update transaction status
      const updateResult = await this.transactionTrackingService.updateTransactionStatus({
        transactionId: transaction.id,
        status: TransactionStatus.CANCELLED,
        metadata: {
          cancelledAt: new Date(),
          processorMetadata: processorResponse.metadata
        }
      });
      
      if (isFailure(updateResult)) {
        this.logger.error(`Failed to update transaction status: ${updateResult.error.message}`);
        return createError(new PaymentError('STATUS_UPDATE_FAILED', updateResult.error.message));
      }
      
      // Return the FiatTransferResult
      const result: FiatTransferResult = {
        id: transaction.id,
        userId: transaction.userId,
        amount: transaction.amount,
        currency: transaction.currency,
        sourceAccountId: transaction.sourceId,
        destinationAccountId: transaction.destinationId,
        status: TransactionStatus.CANCELLED,
        processorName: transaction.processorName,
        processorTransactionId: transaction.processorTransactionId,
        timestamp: transaction.createdAt,
        metadata: {
          ...transaction.metadata,
          processorMetadata: processorResponse.metadata,
          cancelledAt: new Date().toISOString()
        }
      };
      
      return createSuccess(result);
    } catch (error: any) {
      this.logger.error(`Error cancelling transaction: ${error.message}`);
      return createError(new PaymentError('CANCELLATION_FAILED', error.message));
    }
  }
}
