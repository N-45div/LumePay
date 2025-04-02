// apps/backend/src/services/blockchain/solana/solana.module.ts

import { Module } from '@nestjs/common';
import { SolanaWalletService } from './wallet.service';
import { PaymentModule } from '../../core/payment/payment.module';

@Module({
  imports: [
    PaymentModule, // Import Payment module to access TransactionTrackingService
  ],
  providers: [
    SolanaWalletService,
  ],
  exports: [
    SolanaWalletService,
  ],
})
export class SolanaModule {}
