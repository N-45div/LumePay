// apps/backend/src/api/api.module.ts

import { Module } from '@nestjs/common';
import { BankAccountController } from './controllers/bank-account.controller';
import { PaymentController } from './controllers/payment.controller';
import { TransactionAnalyticsController } from './controllers/transaction-analytics.controller';
import { RecommendationController } from './controllers/recommendation.controller';
import { SolanaWalletController } from './controllers/solana-wallet.controller';
import { CryptoFiatBridgeController } from './controllers/crypto-fiat-bridge.controller';
import { FiatPaymentController } from './controllers/fiat-payment.controller';
import { StripeWebhookController } from './controllers/stripe-webhook.controller';
import { PaymentModule } from '../services/core/payment/payment.module';
import { AnalyticsModule } from '../services/analytics/analytics.module';
import { AiModule } from '../services/ai/ai.module';
import { SolanaModule } from '../services/blockchain/solana/solana.module';
import { BridgeModule } from '../services/bridge/bridge.module';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../db/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    PaymentModule,
    AnalyticsModule,
    AiModule,
    SolanaModule,
    BridgeModule
  ],
  controllers: [
    BankAccountController,
    PaymentController,
    TransactionAnalyticsController,
    RecommendationController,
    SolanaWalletController,
    CryptoFiatBridgeController,
    FiatPaymentController,
    StripeWebhookController
  ],
})
export class ApiModule {}
