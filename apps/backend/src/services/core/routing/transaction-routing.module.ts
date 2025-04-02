// apps/backend/src/services/core/routing/transaction-routing.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TransactionRouterService } from './transaction-router.service';
import { TransactionRoutingController } from '../../../api/controllers/transaction-routing.controller';
import { FiatBridgeModule } from '../payment/fiat-bridge.module';

/**
 * Module for transaction routing functionality
 */
@Module({
  imports: [
    ConfigModule,
    FiatBridgeModule
  ],
  controllers: [TransactionRoutingController],
  providers: [TransactionRouterService],
  exports: [TransactionRouterService]
})
export class TransactionRoutingModule {}
