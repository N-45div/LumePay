// apps/backend/src/services/core/payment/interfaces/payment-processor.interface.ts

import { Result } from '../../../../utils/result';
import { PaymentError } from '../errors/PaymentErrors';
import { TransactionStatus } from '../../../../common/types/transaction.types';

/**
 * Standard payment request format for all processors
 */
export interface ProcessorPaymentRequest {
  amount: number;
  currency: string;
  userId: string;
  sourceId?: string;
  destinationId?: string;
  description?: string;
  transactionId: string; // Add transaction ID to link with internal tracking
  metadata?: Record<string, any>;
}

/**
 * Standard payment response format from processors
 */
export interface ProcessorPaymentResponse {
  processorName: string;
  processorTransactionId: string;
  status: TransactionStatus;
  amount: number;
  currency: string;
  fee?: number;
  metadata?: Record<string, any>;
}

/**
 * Status check request for payment processors
 */
export interface ProcessorStatusRequest {
  processorTransactionId: string;
  processorName: string;
}

/**
 * Interface all payment processors must implement
 */
export interface IPaymentProcessor {
  /**
   * Get the name of the payment processor
   */
  getProcessorName(): string;
  
  /**
   * Check if this processor supports a given currency
   */
  supportsCurrency(currency: string): boolean;
  
  /**
   * Process a payment
   */
  processPayment(request: ProcessorPaymentRequest): Promise<Result<ProcessorPaymentResponse, PaymentError>>;
  
  /**
   * Check the status of a payment
   */
  checkPaymentStatus(request: ProcessorStatusRequest): Promise<Result<ProcessorPaymentResponse, PaymentError>>;
  
  /**
   * Cancel a payment if possible
   */
  cancelPayment?(processorTransactionId: string): Promise<Result<ProcessorPaymentResponse, PaymentError>>;
}
