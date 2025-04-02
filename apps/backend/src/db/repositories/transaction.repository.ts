// apps/backend/src/db/repositories/transaction.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, LessThan, DeepPartial } from 'typeorm';
import { Transaction, TransactionType } from '../models/transaction.entity';
import { BaseRepository } from './base.repository';
import { TransactionStatus } from '../../common/types/transaction.types';
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
            // Create transaction entity without id field if not provided
            const transactionData: DeepPartial<Transaction> = {
                userId: data.userId,
                fromAddress: data.fromAddress,
                toAddress: data.toAddress,
                amount: data.amount,
                currency: data.currency,
                status: TransactionStatus.PENDING,
                network: data.network,
                metadata: data.metadata || {},
                type: data.type || TransactionType.CRYPTO_PAYMENT,
                sourceId: data.sourceId,
                destinationId: data.destinationId,
                processorName: data.processorName,
                processorTransactionId: data.processorTransactionId,
                statusHistory: [{
                    status: TransactionStatus.PENDING,
                    timestamp: new Date(),
                    reason: 'Transaction created'
                }]
            };
            
            // Add wallet references if provided
            if (data.fromWalletId) {
                transactionData.fromWallet = { id: data.fromWalletId } as any;
            }
            
            if (data.toWalletId) {
                transactionData.toWallet = { id: data.toWalletId } as any;
            }
            
            // Add ID if provided
            if (data.id) {
                transactionData.id = data.id;
            }
            
            const transaction = this.transactionRepository.create(transactionData);
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
        metadata?: Record<string, any>,
        reason?: string
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

            // Add status change to history
            if (!transaction.statusHistory) {
                transaction.statusHistory = [];
            }
            
            transaction.statusHistory.push({
                status,
                timestamp: new Date(),
                reason
            });

            // Update main status
            transaction.status = status;
            
            // Update metadata if provided
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
            if (error instanceof Error) {
                throw new TransactionOperationError(
                    'Failed to fetch transactions by address',
                    'TRANSACTIONS_FETCH_FAILED',
                    { 
                        address,
                        originalError: error.message,
                        stack: error.stack
                    }
                );
            }

            throw new TransactionOperationError(
                'Failed to fetch transactions by address',
                'TRANSACTIONS_FETCH_FAILED',
                { 
                    address,
                    originalError: String(error)
                }
            );
        }
    }

    /**
     * Find all transactions by user ID
     */
    async findByUserId(userId: string): Promise<Transaction[]> {
        try {
            return this.transactionRepository.find({
                where: { userId },
                order: { createdAt: 'DESC' }
            });
        } catch (error) {
            if (error instanceof Error) {
                throw new TransactionOperationError(
                    'Failed to fetch user transactions',
                    'USER_TRANSACTIONS_FETCH_FAILED',
                    { 
                        userId,
                        originalError: error.message,
                        stack: error.stack
                    }
                );
            }

            throw new TransactionOperationError(
                'Failed to fetch user transactions',
                'USER_TRANSACTIONS_FETCH_FAILED',
                { 
                    userId,
                    originalError: String(error)
                }
            );
        }
    }

    /**
     * Find a transaction by processor name and processor transaction ID
     */
    async findByProcessorId(processorName: string, processorTransactionId: string): Promise<Transaction | null> {
        try {
            return this.transactionRepository.findOne({
                where: {
                    processorName,
                    processorTransactionId
                }
            });
        } catch (error) {
            if (error instanceof Error) {
                throw new TransactionOperationError(
                    'Failed to fetch transaction by processor ID',
                    'PROCESSOR_ID_FETCH_FAILED',
                    { 
                        processorName,
                        processorTransactionId,
                        originalError: error.message,
                        stack: error.stack
                    }
                );
            }

            throw new TransactionOperationError(
                'Failed to fetch transaction by processor ID',
                'PROCESSOR_ID_FETCH_FAILED',
                { 
                    processorName,
                    processorTransactionId,
                    originalError: String(error)
                }
            );
        }
    }

    /**
     * Find transactions within a date range
     */
    async findByDateRange(startDate: Date, endDate: Date): Promise<Transaction[]> {
        try {
            return this.transactionRepository.find({
                where: {
                    createdAt: Between(startDate, endDate)
                },
                order: {
                    createdAt: 'DESC'
                }
            });
        } catch (error) {
            if (error instanceof Error) {
                throw new TransactionOperationError(
                    'Failed to fetch transactions by date range',
                    'FIND_BY_DATE_RANGE_FAILED',
                    { 
                        startDate,
                        endDate,
                        originalError: error.message,
                        stack: error.stack
                    }
                );
            }

            throw new TransactionOperationError(
                'Failed to fetch transactions by date range',
                'FIND_BY_DATE_RANGE_FAILED',
                { 
                    startDate,
                    endDate,
                    originalError: String(error)
                }
            );
        }
    }

    /**
     * Find all transactions with a specific status
     */
    async findByStatus(status: TransactionStatus): Promise<Transaction[]> {
        try {
            return this.transactionRepository.find({
                where: { status }
            });
        } catch (error) {
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
                { 
                    status,
                    originalError: String(error)
                }
            );
        }
    }

    /**
     * Find transactions that have been in a particular status for too long
     */
    async findStaleTransactions(status: TransactionStatus, threshold: Date): Promise<Transaction[]> {
        try {
            return this.transactionRepository
                .createQueryBuilder('transaction')
                .where('transaction.status = :status', { status })
                .andWhere('transaction.updatedAt < :threshold', { threshold })
                .getMany();
        } catch (error) {
            if (error instanceof Error) {
                throw new TransactionOperationError(
                    'Failed to fetch stale transactions',
                    'STALE_TRANSACTIONS_FETCH_FAILED',
                    { 
                        status,
                        threshold,
                        originalError: error.message,
                        stack: error.stack
                    }
                );
            }

            throw new TransactionOperationError(
                'Failed to fetch stale transactions',
                'STALE_TRANSACTIONS_FETCH_FAILED',
                { 
                    status,
                    threshold,
                    originalError: String(error)
                }
            );
        }
    }

    /**
     * Save a transaction record
     */
    async save(transaction: Partial<Transaction>): Promise<Transaction> {
        try {
            return await this.transactionRepository.save(transaction);
        } catch (error) {
            if (error instanceof Error) {
                throw new TransactionOperationError(
                    'Failed to save transaction',
                    'TRANSACTION_SAVE_FAILED',
                    { 
                        transaction,
                        originalError: error.message,
                        stack: error.stack
                    }
                );
            }

            throw new TransactionOperationError(
                'Failed to save transaction',
                'TRANSACTION_SAVE_FAILED',
                { 
                    transaction,
                    originalError: String(error)
                }
            );
        }
    }
}