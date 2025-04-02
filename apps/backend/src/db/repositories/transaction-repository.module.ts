// apps/backend/src/db/repositories/transaction-repository.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionRepository } from './transaction.repository';
import { Transaction } from '../entities/transaction.entity';

/**
 * Module for transaction repository functionality
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction])
  ],
  providers: [TransactionRepository],
  exports: [TransactionRepository]
})
export class TransactionRepositoryModule {}
