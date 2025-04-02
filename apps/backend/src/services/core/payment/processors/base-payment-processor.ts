// apps/backend/src/services/core/payment/processors/base-payment-processor.ts

import { Logger } from '../../../../utils/logger';
import { Result, createSuccess, createError } from '../../../../utils/result';
import { PaymentError } from '../errors/PaymentErrors';
import { 
  IPaymentProcessor, 
  ProcessorPaymentRequest, 
  ProcessorPaymentResponse,
  ProcessorStatusRequest
} from '../interfaces/payment-processor.interface';
import { TransactionStatus } from '../../../../common/types/transaction.types';

/**
 * Base implementation for payment processors with common functionality
 */
export abstract class BasePaymentProcessor implements IPaymentProcessor {
  protected readonly logger: Logger;
  
  constructor(
    private readonly processorName: string,
    private readonly supportedCurrencies: string[]
  ) {
    this.logger = new Logger(`PaymentProcessor:${processorName}`);
  }
  
  /**
   * Get the name of this payment processor
   */
  getProcessorName(): string {
    return this.processorName;
  }
  
  /**
   * Check if this processor supports a given currency
   */
  supportsCurrency(currency: string): boolean {
    return this.supportedCurrencies.includes(currency.toUpperCase());
  }
  
  /**
   * Process a payment - to be implemented by specific processors
   */
  abstract processPayment(request: ProcessorPaymentRequest): Promise<Result<ProcessorPaymentResponse, PaymentError>>;
  
  /**
   * Check payment status - to be implemented by specific processors
   */
  abstract checkPaymentStatus(request: ProcessorStatusRequest): Promise<Result<ProcessorPaymentResponse, PaymentError>>;
  
  /**
   * Cancel a payment if supported - default implementation returns error
   */
  async cancelPayment(processorTransactionId: string): Promise<Result<ProcessorPaymentResponse, PaymentError>> {
    this.logger.warn(`Cancellation not supported for ${this.processorName}`);
    return createError(new PaymentError('CANCELLATION_NOT_SUPPORTED', `${this.processorName} does not support payment cancellation`));
  }
  
  /**
   * Create a standard response object
   */
  protected createStandardResponse(
    processorTransactionId: string,
    status: TransactionStatus,
    amount: number,
    currency: string,
    metadata: Record<string, any> = {}
  ): ProcessorPaymentResponse {
    return {
      processorName: this.processorName,
      processorTransactionId,
      status,
      amount,
      currency: currency.toUpperCase(),
      metadata
    };
  }
}
