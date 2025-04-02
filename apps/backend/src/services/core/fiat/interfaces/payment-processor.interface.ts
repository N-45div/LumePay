// apps/backend/src/services/core/fiat/interfaces/payment-processor.interface.ts

import { Result } from '../../../../utils/result';
import { PaymentError } from '../../payment/errors/PaymentErrors';

/**
 * Transaction details returned by a payment processor
 */
export interface ProcessorTransactionDetails {
  id: string;
  status: 'pending' | 'completed' | 'failed';
  amount: number;
  currency: string;
  fee?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  errorMessage?: string;
  processorName: string;
}

/**
 * Parameters for initiating a payment
 */
export interface InitiatePaymentParams {
  amount: number;
  currency: string;
  sourceId: string;     // Bank account ID or payment method ID
  destinationId?: string; // Optional for some processors
  metadata?: Record<string, any>;
  idempotencyKey: string;
}

/**
 * Parameters for checking payment status
 */
export interface CheckPaymentStatusParams {
  paymentId: string;
  processorReference?: string;
}

/**
 * Interface that all payment processors must implement
 */
export interface IPaymentProcessor {
  /**
   * Unique identifier for this payment processor
   */
  readonly processorName: string;
  
  /**
   * Supported currencies by this processor
   */
  readonly supportedCurrencies: string[];
  
  /**
   * Check if the processor supports a specific currency
   */
  supportsCurrency(currency: string): boolean;
  
  /**
   * Initiate a payment using this processor
   */
  initiatePayment(params: InitiatePaymentParams): Promise<Result<ProcessorTransactionDetails, PaymentError>>;
  
  /**
   * Check status of a previously initiated payment
   */
  checkPaymentStatus(params: CheckPaymentStatusParams): Promise<Result<ProcessorTransactionDetails, PaymentError>>;
  
  /**
   * Calculate the fee for a payment of the given amount
   */
  calculateFee(amount: number, currency: string): Promise<Result<number, PaymentError>>;
  
  /**
   * Cancel a payment if possible (may not be supported by all processors)
   */
  cancelPayment?(paymentId: string): Promise<Result<boolean, PaymentError>>;
  
  /**
   * Validate that an account or payment method is valid with this processor
   */
  validatePaymentMethod(sourceId: string): Promise<Result<boolean, PaymentError>>;
}
