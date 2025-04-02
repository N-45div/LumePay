// apps/backend/src/services/core/payment/payment-processor-registry.ts

import { Injectable } from '@nestjs/common';
import { Logger } from '../../../utils/logger';

export interface PaymentProcessor {
  name: string;
  displayName: string;
  initiatePayment: (params: any) => Promise<any>;
  checkPaymentStatus: (transactionId: string) => Promise<any>;
  validateWebhookSignature?: (signature: string, payload: any, secret: string) => boolean;
  parseWebhookEvent?: (payload: any) => Promise<any>;
}

@Injectable()
export class PaymentProcessorRegistry {
  private logger: Logger;
  private processors: Map<string, PaymentProcessor> = new Map();

  constructor() {
    this.logger = new Logger('PaymentProcessorRegistry');
  }

  /**
   * Register a payment processor
   */
  registerProcessor(processor: PaymentProcessor): void {
    if (this.processors.has(processor.name)) {
      this.logger.warn(`Payment processor ${processor.name} is already registered. Overwriting.`);
    }
    
    this.processors.set(processor.name, processor);
    this.logger.info(`Registered payment processor: ${processor.name}`);
  }

  /**
   * Get a payment processor by name
   */
  getProcessor(name: string): PaymentProcessor | undefined {
    return this.processors.get(name);
  }

  /**
   * Get all registered payment processors
   */
  getAllProcessors(): PaymentProcessor[] {
    return Array.from(this.processors.values());
  }
}
