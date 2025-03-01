// apps/backend/src/db/repositories/transaction.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between } from 'typeorm';
import { Transaction } from '../models/transaction.entity';
import { BaseRepository } from './base.repository';
import { TransactionStatus } from '../../types';
import { CreateTransactionParams } from '../interfaces/transaction.interfaces';

export class TransactionOperationError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly details?: Record<string, any>
    ) {
        super(message);
        this.name = 'TransactionOperationError';
    }
}


@Injectable()
export class TransactionRepository extends BaseRepository<Transaction> {
    constructor(
        @InjectRepository(Transaction)
        private transactionRepository: Repository<Transaction>,
        private dataSource: DataSource
    ) {
        super(transactionRepository);
    }

    async createTransaction(data: CreateTransactionParams): Promise<Transaction> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const transaction = this.transactionRepository.create({
                id: data.id,
                fromAddress: data.fromAddress,
                toAddress: data.toAddress,
                amount: data.amount,
                currency: data.currency,
                status: TransactionStatus.PENDING,
                network: data.network,
                metadata: data.metadata || {},
                fromWallet: { id: data.fromWalletId },
                toWallet: { id: data.toWalletId }
            });

            const savedTransaction = await queryRunner.manager.save(transaction);
            await queryRunner.commitTransaction();
            return savedTransaction;

        } catch (error: unknown) {
            await queryRunner.rollbackTransaction();

            if (error instanceof TransactionOperationError) {
                throw error;
            }

            if (error instanceof Error) {
                throw new TransactionOperationError(
                    'Failed to create transaction',
                    'TRANSACTION_CREATION_FAILED',
                    { originalError: error.message, stack: error.stack }
                );
            }

            throw new TransactionOperationError(
                'Failed to create transaction',
                'TRANSACTION_CREATION_FAILED',
                { originalError: String(error) }
            );

        } finally {
            await queryRunner.release();
        }
    }
    async updateTransaction(
        id: string,
        data: Partial<CreateTransactionParams>
    ): Promise<Transaction> {
        // Add this method to handle transaction updates
        const transaction = await this.findById(id);
        if (!transaction) {
            throw new Error('Transaction not found');
        }
        
        Object.assign(transaction, data);
        return this.repository.save(transaction);
    }

    async updateTransactionStatus(
        transactionId: string,
        status: TransactionStatus,
        metadata?: Record<string, any>
    ): Promise<Transaction> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const transaction = await this.transactionRepository.findOne({
                where: { id: transactionId }
            });

            if (!transaction) {
                throw new TransactionOperationError(
                    'Transaction not found',
                    'TRANSACTION_NOT_FOUND',
                    { transactionId }
                );
            }

            transaction.status = status;
            if (metadata) {
                transaction.metadata = {
                    ...transaction.metadata,
                    ...metadata,
                    statusUpdatedAt: new Date()
                };
            }

            const updatedTransaction = await queryRunner.manager.save(transaction);
            await queryRunner.commitTransaction();
            return updatedTransaction;

        } catch (error: unknown) {
            await queryRunner.rollbackTransaction();

            if (error instanceof TransactionOperationError) {
                throw error;
            }

            if (error instanceof Error) {
                throw new TransactionOperationError(
                    'Failed to update transaction status',
                    'STATUS_UPDATE_FAILED',
                    { 
                        transactionId,
                        status,
                        originalError: error.message,
                        stack: error.stack
                    }
                );
            }

            throw new TransactionOperationError(
                'Failed to update transaction status',
                'STATUS_UPDATE_FAILED',
                { 
                    transactionId,
                    status,
                    originalError: String(error)
                }
            );

        } finally {
            await queryRunner.release();
        }
    }

    async getTransactionsByAddress(
        address: string,
        options?: {
            startDate?: Date;
            endDate?: Date;
            status?: TransactionStatus;
            limit?: number;
            offset?: number;
        }
    ): Promise<{ transactions: Transaction[]; total: number }> {
        try {
            const query = this.transactionRepository.createQueryBuilder('transaction')
                .leftJoinAndSelect('transaction.fromWallet', 'fromWallet')
                .leftJoinAndSelect('transaction.toWallet', 'toWallet')
                .where('transaction.fromAddress = :address OR transaction.toAddress = :address', { address });

            if (options?.startDate && options?.endDate) {
                query.andWhere('transaction.createdAt BETWEEN :startDate AND :endDate', {
                    startDate: options.startDate,
                    endDate: options.endDate
                });
            }

            if (options?.status) {
                query.andWhere('transaction.status = :status', { status: options.status });
            }

            const total = await query.getCount();

            if (options?.limit) {
                query.take(options.limit);
            }

            if (options?.offset) {
                query.skip(options.offset);
            }

            query.orderBy('transaction.createdAt', 'DESC');

            const transactions = await query.getMany();

            return { transactions, total };

        } catch (error: unknown) {
            if (error instanceof TransactionOperationError) {
                throw error;
            }

            if (error instanceof Error) {
                throw new TransactionOperationError(
                    'Failed to fetch transactions',
                    'TRANSACTION_FETCH_FAILED',
                    { 
                        address,
                        originalError: error.message,
                        stack: error.stack
                    }
                );
            }

            throw new TransactionOperationError(
                'Failed to fetch transactions',
                'TRANSACTION_FETCH_FAILED',
                { 
                    address,
                    originalError: String(error)
                }
            );
        }
    }
    async getTransactionsByStatus(
        status: TransactionStatus,
        options?: {
            limit?: number;
            offset?: number;
        }
    ): Promise<Transaction[]> { // Changed from EntityTransaction[] to Transaction[]
        try {
            const query = this.transactionRepository.createQueryBuilder('transaction')
                .where('transaction.status = :status', { status })
                .orderBy('transaction.createdAt', 'DESC');
    
            if (options?.limit) {
                query.take(options.limit);
            }
    
            if (options?.offset) {
                query.skip(options.offset);
            }
    
            return query.getMany();
    
        } catch (error: unknown) {
            if (error instanceof TransactionOperationError) {
                throw error;
            }
    
            if (error instanceof Error) {
                throw new TransactionOperationError(
                    'Failed to fetch transactions by status',
                    'STATUS_FETCH_FAILED',
                    { 
                        status,
                        originalError: error.message,
                        stack: error.stack
                    }
                );
            }
    
            throw new TransactionOperationError(
                'Failed to fetch transactions by status',
                'STATUS_FETCH_FAILED',
                { status }
            );
        }
    }
}