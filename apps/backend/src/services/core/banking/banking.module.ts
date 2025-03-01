import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { BankAccount } from '../../../db/models/bank-account.entity';
import { BankAccountRepository } from '../../../db/repositories/bank-account.repository';
import { BankAccountService } from './BankAccountService';
import { BankValidationService } from './validation/BankValidationService';
import bankValidationConfig from '../../../config/bankValidation.config';

@Module({
    imports: [
        TypeOrmModule.forFeature([BankAccount]),
        ConfigModule.forFeature(bankValidationConfig)
    ],
    providers: [
        BankAccountRepository,
        BankAccountService,
        BankValidationService
    ],
    exports: [
        BankAccountService,
        BankValidationService
    ]
})
export class BankingModule {}