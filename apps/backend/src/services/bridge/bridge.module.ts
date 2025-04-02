// apps/backend/src/services/bridge/bridge.module.ts

import { Module } from '@nestjs/common';
import { CryptoFiatBridgeService } from './crypto-fiat-bridge.service';
import { PaymentModule } from '../core/payment/payment.module';
import { SolanaModule } from '../blockchain/solana/solana.module';

@Module({
  imports: [
    PaymentModule,
    SolanaModule
  ],
  providers: [
    CryptoFiatBridgeService
  ],
  exports: [
    CryptoFiatBridgeService
  ]
})
export class BridgeModule {}
