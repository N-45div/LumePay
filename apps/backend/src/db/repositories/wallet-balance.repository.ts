// apps/backend/src/db/repositories/wallet-balance.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between } from 'typeorm';
import { WalletBalance } from '../models/wallet-balance.entity';
import { BaseRepository } from './base.repository';

export class WalletBalanceOperationError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly details?: Record<string, any>
    ) {
        super(message);
        this.name = 'WalletBalanceOperationError';
    }
}

@Injectable()
export class WalletBalanceRepository extends BaseRepository<WalletBalance> {
    constructor(
        @InjectRepository(WalletBalance)
        private balanceRepository: Repository<WalletBalance>,
        private dataSource: DataSource
    ) {
        super(balanceRepository);
    }

    // This method creates a new balance record while maintaining the historical trail
    async recordBalanceChange(data: {
        walletId: string;
        amount: number;
        currency: string;
        reason: string;
        metadata?: Record<string, any>;
    }): Promise<WalletBalance> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // We first get the current balance to maintain an accurate history
            const currentBalance = await this.getLatestBalance(data.walletId, data.currency);
            
            // Create the new balance record with a reference to the previous balance
            const balanceRecord = this.balanceRepository.create({
                wallet: { id: data.walletId },
                amount: data.amount,
                currency: data.currency,
                timestamp: new Date(),
                metadata: {
                    ...data.metadata,
                    reason: data.reason,
                    previousBalance: currentBalance?.amount || 0,
                    changeAmount: data.amount - (currentBalance?.amount || 0)
                }
            });

            const savedRecord = await queryRunner.manager.save(balanceRecord);

            // Update the wallet's current balance
            await queryRunner.manager.update(
                'wallets',
                { id: data.walletId },
                { 
                    balance: data.amount,
                    updatedAt: new Date()
                }
            );

            await queryRunner.commitTransaction();
            return savedRecord;

        } catch (error: unknown) {
            await queryRunner.rollbackTransaction();
            
            if (error instanceof WalletBalanceOperationError) {
                throw error;
            }

            if (error instanceof Error) {
                throw new WalletBalanceOperationError(
                    'Failed to record balance change',
                    'BALANCE_RECORD_FAILED',
                    {
                        walletId: data.walletId,
                        originalError: error.message,
                        stack: error.stack
                    }
                );
            }

            throw new WalletBalanceOperationError(
                'Failed to record balance change',
                'BALANCE_RECORD_FAILED',
                {
                    walletId: data.walletId,
                    originalError: String(error)
                }
            );

        } finally {
            await queryRunner.release();
        }
    }

    // This method retrieves balance history with powerful filtering options
    async getBalanceHistory(
        walletId: string,
        options: {
            startDate?: Date;
            endDate?: Date;
            currency?: string;
            limit?: number;
            offset?: number;
        }
    ): Promise<{
        history: WalletBalance[];
        total: number;
        summary: {
            startBalance: number;
            endBalance: number;
            netChange: number;
        };
    }> {
        try {
            const query = this.balanceRepository.createQueryBuilder('balance')
                .where('balance.wallet_id = :walletId', { walletId })
                .orderBy('balance.timestamp', 'DESC');

            if (options.startDate && options.endDate) {
                query.andWhere('balance.timestamp BETWEEN :startDate AND :endDate', {
                    startDate: options.startDate,
                    endDate: options.endDate
                });
            }

            if (options.currency) {
                query.andWhere('balance.currency = :currency', {
                    currency: options.currency
                });
            }

            // Get total count for pagination
            const total = await query.getCount();

            // Apply pagination if specified
            if (options.limit) {
                query.take(options.limit);
            }
            if (options.offset) {
                query.skip(options.offset);
            }

            const history = await query.getMany();

            // Calculate summary statistics
            const startBalance = history.length > 0 ? 
                history[history.length - 1].amount : 0;
            const endBalance = history.length > 0 ? 
                history[0].amount : 0;

            return {
                history,
                total,
                summary: {
                    startBalance: Number(startBalance),
                    endBalance: Number(endBalance),
                    netChange: Number(endBalance) - Number(startBalance)
                }
            };

        } catch (error: unknown) {
            if (error instanceof WalletBalanceOperationError) {
                throw error;
            }

            if (error instanceof Error) {
                throw new WalletBalanceOperationError(
                    'Failed to fetch balance history',
                    'HISTORY_FETCH_FAILED',
                    {
                        walletId,
                        originalError: error.message,
                        stack: error.stack
                    }
                );
            }

            throw new WalletBalanceOperationError(
                'Failed to fetch balance history',
                'HISTORY_FETCH_FAILED',
                {
                    walletId,
                    originalError: String(error)
                }
            );
        }
    }

    // Helper method to get the latest balance for a wallet
    private async getLatestBalance(
        walletId: string,
        currency: string
    ): Promise<WalletBalance | null> {
        return this.balanceRepository.findOne({
            where: {
                wallet: { id: walletId },
                currency
            },
            order: {
                timestamp: 'DESC'
            }
        });
    }
}