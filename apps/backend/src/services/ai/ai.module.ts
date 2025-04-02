// apps/backend/src/services/ai/ai.module.ts

import { Module } from '@nestjs/common';
import { RecommendationService } from './recommendation.service';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PaymentModule } from '../core/payment/payment.module';

@Module({
  imports: [
    AnalyticsModule,
    PaymentModule,
  ],
  providers: [
    RecommendationService,
  ],
  exports: [
    RecommendationService,
  ],
})
export class AiModule {}
