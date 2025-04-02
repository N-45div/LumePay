// apps/backend/src/services/core/fiat/payment-processor-registry.service.ts

import { Injectable } from '@nestjs/common';
import { IPaymentProcessor } from './interfaces/payment-processor.interface';
import { Logger } from '../../../utils/logger';
import { PaymentError } from '../payment/errors/PaymentErrors';
import { Result, createSuccess, createError } from '../../../utils/result';

/**
 * Registry service for payment processors.
 * This service manages all available payment processors and provides methods
 * for selecting the appropriate processor based on requirements.
 */
@Injectable()
export class PaymentProcessorRegistry {
  private processors: Map<string, IPaymentProcessor> = new Map();
  private logger: Logger;
  
  constructor() {
    this.logger = new Logger('PaymentProcessorRegistry');
  }
  
  /**
   * Register a payment processor
   */
  registerProcessor(processor: IPaymentProcessor): void {
    if (this.processors.has(processor.processorName)) {
      this.logger.warn(`Payment processor ${processor.processorName} is already registered. Overwriting.`);
    }
    
    this.processors.set(processor.processorName, processor);
    this.logger.info(`Registered payment processor: ${processor.processorName}`);
  }
  
  /**
   * Get a processor by name
   */
  getProcessor(processorName: string): Result<IPaymentProcessor, PaymentError> {
    const processor = this.processors.get(processorName);
    
    if (!processor) {
      return createError(new PaymentError(
        `Payment processor ${processorName} not found`,
        'PROCESSOR_NOT_FOUND'
      ));
    }
    
    return createSuccess(processor);
  }
  
  /**
   * Find processors that support a specific currency
   */
  getProcessorsForCurrency(currency: string): Result<IPaymentProcessor[], PaymentError> {
    const supportedProcessors = Array.from(this.processors.values())
      .filter(processor => processor.supportsCurrency(currency));
    
    if (supportedProcessors.length === 0) {
      return createError(new PaymentError(
        `No payment processors found for currency ${currency}`,
        'NO_PROCESSOR_FOR_CURRENCY'
      ));
    }
    
    return createSuccess(supportedProcessors);
  }
  
  /**
   * Get the optimal processor for a specific currency based on fees and speed
   */
  async getBestProcessorForCurrency(
    currency: string, 
    amount: number,
    preferredProcessor?: string
  ): Promise<Result<IPaymentProcessor, PaymentError>> {
    try {
      // First check if there's a preferred processor that can handle this currency
      if (preferredProcessor) {
        const processor = this.processors.get(preferredProcessor);
        if (processor && processor.supportsCurrency(currency)) {
          return createSuccess(processor);
        }
      }
      
      // Get all processors that support this currency
      const supportedProcessorsResult = this.getProcessorsForCurrency(currency);
      if (!supportedProcessorsResult.success) {
        return createError(supportedProcessorsResult.error);
      }
      
      const supportedProcessors = supportedProcessorsResult.data;
      
      // If only one processor, return it
      if (supportedProcessors.length === 1) {
        return createSuccess(supportedProcessors[0]);
      }
      
      // Calculate fees for each processor
      const processorFees: Array<{ processor: IPaymentProcessor; fee: number }> = [];
      
      for (const processor of supportedProcessors) {
        const feeResult = await processor.calculateFee(amount, currency);
        if (feeResult.success) {
          processorFees.push({
            processor,
            fee: feeResult.data
          });
        }
      }
      
      // Sort by fee (lowest first)
      processorFees.sort((a, b) => a.fee - b.fee);
      
      // Return the processor with the lowest fee
      if (processorFees.length > 0) {
        return createSuccess(processorFees[0].processor);
      }
      
      // If we couldn't calculate fees, just return the first supported processor
      return createSuccess(supportedProcessors[0]);
    } catch (error) {
      return createError(new PaymentError(
        error instanceof Error ? error.message : 'Unknown error selecting payment processor',
        'PROCESSOR_SELECTION_ERROR'
      ));
    }
  }
  
  /**
   * Get all registered processors
   */
  getAllProcessors(): IPaymentProcessor[] {
    return Array.from(this.processors.values());
  }
}
