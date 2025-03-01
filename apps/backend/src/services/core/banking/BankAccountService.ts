// apps/backend/src/services/core/banking/BankAccountService.ts

import { Injectable } from '@nestjs/common';
import { Logger } from '../../../utils/logger';
import { Result, createSuccess, createError } from '../../../utils/result';
import { BankError } from './errors/BankErrors';
import { BankAccountRepository } from '../../../db/repositories/bank-account.repository';
import { BankValidationService } from './validation/BankValidationService';

export interface BankAccount {
    id: string;
    userId: string;
    accountType: 'checking' | 'savings';
    accountNumber: string;
    routingNumber: string;
    bankName: string;
    holderName: string;
    status: BankAccountStatus;
    metadata: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

export enum BankAccountStatus {
    PENDING = 'pending',
    ACTIVE = 'active',
    FAILED = 'failed',
    DISABLED = 'disabled'
}

export interface BankAccountCreationParams {
    userId: string;
    accountType: 'checking' | 'savings';
    accountNumber: string;
    routingNumber: string;
    bankName: string;
    holderName: string;
    metadata?: Record<string, any>;
}

export interface BankAccountValidationResult {
    isValid: boolean;
    accountInfo?: {
        bankName: string;
        accountType: string;
        lastFour: string;
    };
    error?: string;
}

@Injectable()
export class BankAccountService {
    private logger: Logger;

    constructor(
        private bankAccountRepository: BankAccountRepository,
        private bankValidationService: BankValidationService
    ) {
        this.logger = new Logger('BankAccountService');
    }

    async createBankAccount(
        params: BankAccountCreationParams
    ): Promise<Result<BankAccount, BankError>> {
        try {
            // First validate the bank account details
            const validationResult = await this.validateBankAccount({
                accountNumber: params.accountNumber,
                routingNumber: params.routingNumber
            });

            if (!validationResult.isValid) {
                throw new BankError(
                    validationResult.error || 'Invalid bank account',
                    'INVALID_BANK_ACCOUNT'
                );
            }

            // Create a new bank account record
            const bankAccount = {
                id: this.generateAccountId(),
                userId: params.userId,
                accountType: params.accountType,
                accountNumber: this.maskAccountNumber(params.accountNumber),
                routingNumber: params.routingNumber,
                bankName: params.bankName,
                holderName: params.holderName,
                status: BankAccountStatus.PENDING,
                metadata: {                  // Always provide a metadata object
                    ...(params.metadata || {}),
                    validatedAt: new Date(),
                    validationInfo: validationResult.accountInfo
                },
                createdAt: new Date(),
                updatedAt: new Date()
            } satisfies BankAccount;  // Use satisfies to ensure type safety

            const savedAccount = await this.bankAccountRepository.createBankAccount(bankAccount);

            this.logger.info('Bank account created', { 
                userId: params.userId,
                bankName: params.bankName,
                accountType: params.accountType
            });

            return createSuccess(savedAccount);  // Return the saved account instead of the original
        } catch (error) {
            this.logger.error('Failed to create bank account', { error });

            if (error instanceof BankError) {
                return createError(error);
            }

            return createError(new BankError(
                'Failed to create bank account',
                'BANK_ACCOUNT_CREATION_FAILED',
                { originalError: error }
            ));
        }
    }

    async validateBankAccount(params: {
        accountNumber: string;
        routingNumber: string;
    }): Promise<BankAccountValidationResult> {
        try {
            // Basic format validation first
            if (!this.isValidRoutingNumber(params.routingNumber)) {
                return {
                    isValid: false,
                    error: 'Invalid routing number format'
                };
            }

            if (!this.isValidAccountNumber(params.accountNumber)) {
                return {
                    isValid: false,
                    error: 'Invalid account number format'
                };
            }

            // Call bank validation service
            const validationResult = await this.bankValidationService.validateBank({
                accountNumber: params.accountNumber,
                routingNumber: params.routingNumber,
                accountType: 'checking' // Default to checking if not specified
            });

            if (!validationResult.success) {
                return {
                    isValid: false,
                    error: validationResult.error.message
                };
            }

            const { data } = validationResult;

            if (!data.isValid || data.error) {
                return {
                    isValid: false,
                    error: data.error?.message || 'Bank account validation failed'
                };
            }

            return {
                isValid: true,
                accountInfo: {
                    bankName: data.bankInfo?.name || 'Unknown Bank',
                    accountType: data.accountInfo?.type || 'unknown',
                    lastFour: data.accountInfo?.lastFour || params.accountNumber.slice(-4)
                }
            };
        } catch (error) {
            this.logger.error('Bank account validation failed', { error });
            return {
                isValid: false,
                error: 'Bank account validation failed'
            };
        }
    }

    async getBankAccount(id: string): Promise<Result<BankAccount, BankError>> {
        try {
            const account = await this.bankAccountRepository.findById(id);
            if (!account) {
                throw new BankError('Bank account not found', 'BANK_ACCOUNT_NOT_FOUND');
            }
            return createSuccess(account);
        } catch (error) {
            if (error instanceof BankError) {
                return createError(error);
            }
            return createError(new BankError(
                'Failed to get bank account',
                'BANK_ACCOUNT_FETCH_FAILED',
                { originalError: error }
            ));
        }
    }

    async getUserBankAccounts(
        userId: string
    ): Promise<Result<BankAccount[], BankError>> {
        try {
            const accounts = await this.bankAccountRepository.findByUserId(userId);
            return createSuccess(accounts);
        } catch (error) {
            if (error instanceof BankError) {
                return createError(error);
            }
            return createError(new BankError(
                'Failed to get user bank accounts',
                'BANK_ACCOUNTS_FETCH_FAILED',
                { originalError: error }
            ));
        }
    }

    private isValidRoutingNumber(routingNumber: string): boolean {
        // Basic routing number validation (9 digits)
        const routingRegex = /^\d{9}$/;
        if (!routingRegex.test(routingNumber)) {
            return false;
        }

        // Implement checksum validation
        const digits = routingNumber.split('').map(Number);
        const checksum = (
            7 * (digits[0] + digits[3] + digits[6]) +
            3 * (digits[1] + digits[4] + digits[7]) +
            9 * (digits[2] + digits[5] + digits[8])
        ) % 10;

        return checksum === 0;
    }

    private isValidAccountNumber(accountNumber: string): boolean {
        // Basic account number validation (8-17 digits)
        const accountRegex = /^\d{8,17}$/;
        return accountRegex.test(accountNumber);
    }

    private maskAccountNumber(accountNumber: string): string {
        const lastFour = accountNumber.slice(-4);
        const masked = '*'.repeat(accountNumber.length - 4);
        return masked + lastFour;
    }

    private generateAccountId(): string {
        return `ba_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}