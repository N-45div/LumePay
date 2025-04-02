// apps/backend/src/modules/payment.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

// Controllers
import { FiatPaymentController } from '../api/controllers/fiat-payment.controller';
import { StripeWebhookController } from '../api/controllers/stripe-webhook.controller';
import { ConversionController } from '../api/controllers/conversion.controller';
import { ScheduledPaymentController } from '../api/controllers/scheduled-payment.controller';
import { ScheduledPaymentMonitoringController } from '../api/controllers/scheduled-payment-monitoring.controller';

// Services
import { FiatBridgeService } from '../services/core/payment/fiat-bridge.service';
import { StripeProcessor } from '../services/core/payment/processors/stripe-processor';
import { TransactionTrackingService } from '../services/core/payment/transaction-tracking.service';
import { SolanaService } from '../services/core/blockchain/solana.service';
import { ConversionService } from '../services/core/conversion/conversion.service';
import { ScheduledPaymentService } from '../services/core/payment/scheduled-payment.service';
import { ScheduledPaymentProcessorService } from '../services/core/payment/scheduled-payment-processor.service';

// Repositories
import { TransactionRepository } from '../db/repositories/transaction.repository';
import { BankAccountRepository } from '../db/repositories/bank-account.repository';
import { ScheduledPaymentRepository } from '../db/repositories/scheduled-payment.repository';

// Entities
import { Transaction } from '../db/models/transaction.entity';
import { BankAccount } from '../db/models/bank-account.entity';
import { ScheduledPayment } from '../db/models/scheduled-payment.entity';

// Utils
import { Logger } from '../utils/logger';

// Inline Stripe factory to avoid module resolution issues
const stripeFactory = (configService: ConfigService) => {
  const apiKey = configService.get<string>('STRIPE_API_KEY', 'sk_test_example');
  return { apiKey };
};

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([Transaction, BankAccount, ScheduledPayment]),
  ],
  controllers: [
    FiatPaymentController,
    StripeWebhookController,
    ConversionController,
    ScheduledPaymentController,
    ScheduledPaymentMonitoringController,
  ],
  providers: [
    // Core services
    FiatBridgeService,
    TransactionTrackingService,
    SolanaService,
    ConversionService,
    ScheduledPaymentService,
    ScheduledPaymentProcessorService, // Add the processor service
    
    // Processors
    StripeProcessor,
    
    // Repositories
    TransactionRepository,
    BankAccountRepository,
    ScheduledPaymentRepository,
    
    // Utilities
    Logger,
    
    // Providers
    {
      provide: 'STRIPE_CLIENT',
      useFactory: stripeFactory,
      inject: [ConfigService],
    },
  ],
  exports: [
    FiatBridgeService,
    TransactionTrackingService,
    SolanaService,
    ConversionService,
    ScheduledPaymentService,
    StripeProcessor,
    ScheduledPaymentProcessorService, // Add the processor service to exports
  ],
})
export class PaymentModule {}
