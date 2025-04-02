// apps/backend/src/services/core/payment/payment-processor.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SimulatedPaymentProcessor } from './processors/simulated-processor';
import { StripeProcessor } from './processors/stripe-processor';

/**
 * This module provides all payment processors to the application
 */
@Module({
  imports: [
    ConfigModule
  ],
  providers: [
    SimulatedPaymentProcessor,
    StripeProcessor
  ],
  exports: [
    SimulatedPaymentProcessor,
    StripeProcessor
  ]
})
export class PaymentProcessorModule {}
