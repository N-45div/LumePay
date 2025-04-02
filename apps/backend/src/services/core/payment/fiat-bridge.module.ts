// apps/backend/src/services/core/payment/fiat-bridge.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FiatBridgeService } from './fiat-bridge.service';
import { SimulatedPaymentProcessor } from './processors/simulated-processor';
import { StripeProcessor } from './processors/stripe-processor';
import { TransactionTrackingService } from './transaction-tracking.service';
import { TransactionRepositoryModule } from '../../../db/repositories/transaction-repository.module';

/**
 * Module for fiat bridge functionality
 */
@Module({
  imports: [
    ConfigModule,
    TransactionRepositoryModule
  ],
  providers: [
    FiatBridgeService,
    SimulatedPaymentProcessor,
    StripeProcessor,
    TransactionTrackingService
  ],
  exports: [FiatBridgeService]
})
export class FiatBridgeModule {}
