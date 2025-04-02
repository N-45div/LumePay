// apps/backend/src/services/core/payment/payment.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { FiatModule } from '../fiat/fiat.module';
import { PaymentProcessorModule } from './payment-processor.module';

// Services
import { PaymentService } from './PaymentService';
import { TransactionTrackingService } from './transaction-tracking.service';
import { TransactionMonitorService } from './transaction-monitor.service';
import { FiatBridgeService } from './fiat-bridge.service';

// Repository
import { TransactionRepository } from '../../../db/repositories/transaction.repository';

// Entities
import { Transaction } from '../../../db/models/transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction]),
    ScheduleModule.forRoot(), // Required for the @Cron decorator
    ConfigModule,
    FiatModule,
    PaymentProcessorModule,
  ],
  providers: [
    PaymentService,
    TransactionTrackingService,
    TransactionMonitorService,
    TransactionRepository,
    FiatBridgeService,
  ],
  exports: [
    PaymentService,
    TransactionTrackingService,
    FiatBridgeService,
  ],
})
export class PaymentModule {}
