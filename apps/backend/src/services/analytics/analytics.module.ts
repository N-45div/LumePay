// apps/backend/src/services/analytics/analytics.module.ts

import { Module } from '@nestjs/common';
import { TransactionAnalyticsService } from './transaction-analytics.service';
import { PaymentModule } from '../core/payment/payment.module';

@Module({
  imports: [
    PaymentModule, // Import PaymentModule to access TransactionTrackingService
  ],
  providers: [
    TransactionAnalyticsService,
  ],
  exports: [
    TransactionAnalyticsService,
  ],
})
export class AnalyticsModule {}
