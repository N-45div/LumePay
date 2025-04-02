// apps/backend/src/db/database.module.ts
import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import getDatabaseConfig from '../config/database.config';

// Import repositories
import { TransactionRepository } from './repositories/transaction.repository';
import { BankAccountRepository } from './repositories/bank-account.repository';
// Import other repositories as needed

/**
 * Global database module providing database connection
 * and repository services
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forRoot(getDatabaseConfig),
    TypeOrmModule.forFeature([
      // Register entities for repository injection
    ]),
  ],
  providers: [
    TransactionRepository,
    BankAccountRepository,
    // Add other repositories here
  ],
  exports: [
    TransactionRepository,
    BankAccountRepository,
    // Export the repositories that should be available globally
  ],
})
export class DatabaseModule {}
