// apps/backend/src/db/repositories/bank-account.repository.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BankAccount } from '../models/bank-account.entity';
import { BaseRepository } from './base.repository';
import { BankAccountStatus } from '@/services/core/banking/BankAccountService';

export class BankAccountOperationError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly details?: Record<string, any>
    ) {
        super(message);
        this.name = 'BankAccountOperationError';
        Error.captureStackTrace(this, this.constructor);
    }
}

@Injectable()
export class BankAccountRepository extends BaseRepository<BankAccount> {
    constructor(
        @InjectRepository(BankAccount)
        private bankAccountRepository: Repository<BankAccount>,
        private dataSource: DataSource
    ) {
        super(bankAccountRepository);
    }

    async createBankAccount(
        data: Omit<BankAccount, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<BankAccount> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const bankAccount = this.bankAccountRepository.create(data);
            const savedAccount = await queryRunner.manager.save(bankAccount);
            await queryRunner.commitTransaction();
            return savedAccount;

        } catch (error: unknown) {
            await queryRunner.rollbackTransaction();

            if (error instanceof BankAccountOperationError) {
                throw error;
            }

            if (error instanceof Error) {
                throw new BankAccountOperationError(
                    'Failed to create bank account',
                    'BANK_ACCOUNT_CREATION_FAILED',
                    { 
                        originalError: error.message,
                        stack: error.stack
                    }
                );
            }

            throw new BankAccountOperationError(
                'Failed to create bank account',
                'BANK_ACCOUNT_CREATION_FAILED',
                { originalError: String(error) }
            );

        } finally {
            await queryRunner.release();
        }
    }

    async validateBankAccount(
        accountNumber: string,
        routingNumber: string
    ): Promise<boolean> {
        try {
            const existingAccount = await this.bankAccountRepository.findOne({
                where: {
                    accountNumber,
                    routingNumber
                }
            });

            return existingAccount !== null;
        } catch (error: unknown) {
            if (error instanceof BankAccountOperationError) {
                throw error;
            }

            if (error instanceof Error) {
                throw new BankAccountOperationError(
                    'Failed to validate bank account',
                    'VALIDATION_FAILED',
                    { 
                        originalError: error.message,
                        stack: error.stack
                    }
                );
            }

            throw new BankAccountOperationError(
                'Failed to validate bank account',
                'VALIDATION_FAILED',
                { originalError: String(error) }
            );
        }
    }

    async findByUserId(userId: string): Promise<BankAccount[]> {
        try {
            return this.bankAccountRepository.find({
                where: { userId }
            });
        } catch (error: unknown) {
            if (error instanceof BankAccountOperationError) {
                throw error;
            }

            if (error instanceof Error) {
                throw new BankAccountOperationError(
                    'Failed to fetch user bank accounts',
                    'BANK_ACCOUNTS_FETCH_FAILED',
                    { 
                        userId,
                        originalError: error.message,
                        stack: error.stack
                    }
                );
            }

            throw new BankAccountOperationError(
                'Failed to fetch user bank accounts',
                'BANK_ACCOUNTS_FETCH_FAILED',
                { 
                    userId,
                    originalError: String(error)
                }
            );
        }
    }

    async getActiveAccounts(userId: string): Promise<BankAccount[]> {
        try {
            return this.bankAccountRepository.find({
                where: {
                    userId,
                    status: BankAccountStatus.ACTIVE
                }
            });
        } catch (error: unknown) {
            if (error instanceof BankAccountOperationError) {
                throw error;
            }

            if (error instanceof Error) {
                throw new BankAccountOperationError(
                    'Failed to fetch active bank accounts',
                    'ACTIVE_ACCOUNTS_FETCH_FAILED',
                    { 
                        userId,
                        originalError: error.message,
                        stack: error.stack
                    }
                );
            }

            throw new BankAccountOperationError(
                'Failed to fetch active bank accounts',
                'ACTIVE_ACCOUNTS_FETCH_FAILED',
                { 
                    userId,
                    originalError: String(error)
                }
            );
        }
    }

    async updateStatus(
        id: string,
        status: BankAccountStatus,
        metadata?: Record<string, any>
    ): Promise<BankAccount> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const bankAccount = await this.bankAccountRepository.findOne({
                where: { id }
            });

            if (!bankAccount) {
                throw new BankAccountOperationError(
                    'Bank account not found',
                    'BANK_ACCOUNT_NOT_FOUND',
                    { id }
                );
            }

            bankAccount.status = status;
            if (metadata) {
                bankAccount.metadata = {
                    ...bankAccount.metadata,
                    ...metadata,
                    statusUpdatedAt: new Date()
                };
            }

            const updatedAccount = await queryRunner.manager.save(bankAccount);
            await queryRunner.commitTransaction();
            return updatedAccount;

        } catch (error: unknown) {
            await queryRunner.rollbackTransaction();

            if (error instanceof BankAccountOperationError) {
                throw error;
            }

            if (error instanceof Error) {
                throw new BankAccountOperationError(
                    'Failed to update bank account status',
                    'STATUS_UPDATE_FAILED',
                    { 
                        id,
                        status,
                        originalError: error.message,
                        stack: error.stack
                    }
                );
            }

            throw new BankAccountOperationError(
                'Failed to update bank account status',
                'STATUS_UPDATE_FAILED',
                { 
                    id,
                    status,
                    originalError: String(error)
                }
            );

        } finally {
            await queryRunner.release();
        }
    }

    async deleteBankAccount(id: string): Promise<boolean> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const result = await queryRunner.manager.softDelete(BankAccount, id);
            await queryRunner.commitTransaction();
            return result.affected ? result.affected > 0 : false;

        } catch (error: unknown) {
            await queryRunner.rollbackTransaction();

            if (error instanceof BankAccountOperationError) {
                throw error;
            }

            if (error instanceof Error) {
                throw new BankAccountOperationError(
                    'Failed to delete bank account',
                    'DELETE_FAILED',
                    { 
                        id,
                        originalError: error.message,
                        stack: error.stack
                    }
                );
            }

            throw new BankAccountOperationError(
                'Failed to delete bank account',
                'DELETE_FAILED',
                { 
                    id,
                    originalError: String(error)
                }
            );

        } finally {
            await queryRunner.release();
        }
    }
}