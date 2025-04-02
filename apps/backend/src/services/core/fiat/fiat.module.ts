// apps/backend/src/services/core/fiat/fiat.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PaymentModule } from '../payment/payment.module';

// Services
import { FiatBridgeService } from './FiatBridgeService';
import { BankAccountService } from './bank-account.service';
import { PaymentProcessorRegistry } from './payment-processor-registry.service';
import { StripeProcessorService } from './processors/stripe-processor.service';
import { PayPalProcessorService } from './processors/paypal-processor.service';

// Rate service and implementation
import { RateService } from './RateService';
import { ConversionService } from './ConversionService';

// Database models
import { BankAccount } from '../../../db/models/bank-account.entity';
import { BankAccountRepository } from '../../../db/repositories/bank-account.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([BankAccount]),
    ConfigModule,
    PaymentModule, // Import PaymentModule to resolve circular dependency
  ],
  providers: [
    // Core fiat services
    FiatBridgeService,
    BankAccountService,
    BankAccountRepository,
    ConversionService,
    
    // Payment processors
    PaymentProcessorRegistry,
    StripeProcessorService,
    PayPalProcessorService,
    
    // Rate service provider (use token-based provider pattern)
    {
      provide: 'RATE_SERVICE',
      useClass: RateService,
    },
    RateService,
  ],
  exports: [
    FiatBridgeService,
    BankAccountService,
    PaymentProcessorRegistry,
  ],
})
export class FiatModule {
  constructor(
    private paymentProcessorRegistry: PaymentProcessorRegistry,
    private stripeProcessor: StripeProcessorService,
    private paypalProcessor: PayPalProcessorService
  ) {
    // Register payment processors
    this.paymentProcessorRegistry.registerProcessor(this.stripeProcessor);
    this.paymentProcessorRegistry.registerProcessor(this.paypalProcessor);
  }
}
