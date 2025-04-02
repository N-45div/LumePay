// apps/backend/src/services/core/payment/transaction-tracking.service.ts

import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { TransactionRepository } from '../../../db/repositories/transaction.repository';
import { Logger } from '../../../utils/logger';
import { Result, createSuccess, createError } from '../../../utils/result';
import { PaymentError } from './errors/PaymentErrors';
import { TransactionStatus } from '../../../common/types/transaction.types';

export enum TransactionType {
  FIAT_PAYMENT = 'fiat_payment',
  CRYPTO_PAYMENT = 'crypto_payment',
  FIAT_TO_CRYPTO = 'fiat_to_crypto',
  CRYPTO_TO_FIAT = 'crypto_to_fiat',
  FIAT_TRANSFER = 'fiat_transfer'
}

export interface CreateTransactionParams {
  userId: string;
  amount: number;
  currency: string;
  type: TransactionType;
  status: TransactionStatus;
  sourceId?: string;
  destinationId?: string;
  processorName?: string;
  processorTransactionId?: string;
  metadata?: Record<string, any>;
}

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  type: TransactionType;
  status: TransactionStatus;
  sourceId?: string;
  destinationId?: string;
  processorName?: string;
  processorTransactionId?: string;
  metadata?: Record<string, any>;
  statusHistory: Array<{
    status: TransactionStatus;
    timestamp: Date;
    reason?: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateTransactionStatusParams {
  transactionId: string;
  status: TransactionStatus;
  reason?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class TransactionTrackingService {
  private logger: Logger;

  constructor(private transactionRepository: TransactionRepository) {
    this.logger = new Logger('TransactionTrackingService');
  }

  /**
   * Create a new transaction
   * @param params Transaction parameters
   * @returns Result with transaction or error
   */
  async createTransaction(params: CreateTransactionParams): Promise<Result<any, PaymentError>> {
    try {
      const transaction = this.createNewTransaction(params);

      const savedTransaction = await this.transactionRepository.save(transaction);
      this.logger.info(`Created transaction ${savedTransaction.id} for user ${savedTransaction.userId}`);

      return createSuccess(savedTransaction);
    } catch (error) {
      this.logger.error(`Error creating transaction: ${error}`);
      return createError(new PaymentError(
        error instanceof Error ? error.message : 'Unknown error creating transaction',
        'TRANSACTION_CREATION_ERROR'
      ));
    }
  }

  private createNewTransaction(params: CreateTransactionParams): Transaction {
    const now = new Date();
    
    return {
      id: uuidv4(),
      userId: params.userId,
      amount: params.amount,
      currency: params.currency,
      type: params.type,
      status: params.status,
      sourceId: params.sourceId,
      destinationId: params.destinationId,
      processorName: params.processorName,
      processorTransactionId: params.processorTransactionId,
      metadata: params.metadata || {},
      statusHistory: [
        {
          status: params.status,
          timestamp: now,
        }
      ],
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Update transaction status
   */
  async updateTransactionStatus(params: UpdateTransactionStatusParams): Promise<Result<Transaction, PaymentError>> {
    try {
      const transaction = await this.transactionRepository.findById(params.transactionId);

      if (!transaction) {
        return createError(new PaymentError(
          `Transaction ${params.transactionId} not found`,
          'TRANSACTION_NOT_FOUND'
        ));
      }

      // Add to status history
      if (!transaction.statusHistory) {
        transaction.statusHistory = [];
      }
      
      transaction.statusHistory.push({
        status: params.status,
        timestamp: new Date(),
        reason: params.reason
      });

      // Update transaction data
      const updateData = {
        status: params.status,
        updatedAt: new Date(),
        statusHistory: transaction.statusHistory,
        metadata: params.metadata ? 
          { ...transaction.metadata, ...params.metadata } : 
          transaction.metadata
      };

      const updatedTransaction = await this.transactionRepository.update(
        params.transactionId,
        updateData
      );

      this.logger.info(`Updated transaction ${transaction.id} status to ${params.status}`);
      
      if (!updatedTransaction) {
        throw new Error(`Failed to update transaction ${params.transactionId}`);
      }
      
      return createSuccess(updatedTransaction);
    } catch (error) {
      this.logger.error(`Error updating transaction status: ${error}`);
      return createError(new PaymentError(
        error instanceof Error ? error.message : 'Unknown error updating transaction status',
        'TRANSACTION_UPDATE_ERROR'
      ));
    }
  }

  /**
   * Get transaction by ID
   */
  async getTransaction(id: string): Promise<Result<Transaction, PaymentError>> {
    try {
      const transaction = await this.transactionRepository.findById(id);

      if (!transaction) {
        return createError(new PaymentError(
          `Transaction ${id} not found`,
          'TRANSACTION_NOT_FOUND'
        ));
      }

      return createSuccess(transaction);
    } catch (error) {
      this.logger.error(`Error retrieving transaction: ${error}`);
      return createError(new PaymentError(
        error instanceof Error ? error.message : 'Unknown error retrieving transaction',
        'TRANSACTION_RETRIEVAL_ERROR'
      ));
    }
  }

  /**
   * Get transactions for a user
   */
  async getUserTransactions(userId: string): Promise<Result<Transaction[], PaymentError>> {
    try {
      const transactions = await this.transactionRepository.findByUserId(userId);
      return createSuccess(transactions);
    } catch (error) {
      this.logger.error(`Error retrieving user transactions: ${error}`);
      return createError(new PaymentError(
        error instanceof Error ? error.message : 'Unknown error retrieving user transactions',
        'USER_TRANSACTIONS_RETRIEVAL_ERROR'
      ));
    }
  }

  /**
   * Get transaction by processor transaction ID
   */
  async getTransactionByProcessorId(
    processorName: string, 
    processorTransactionId: string
  ): Promise<Result<Transaction, PaymentError>> {
    try {
      const transaction = await this.transactionRepository.findByProcessorId(
        processorName, 
        processorTransactionId
      );
      
      if (!transaction) {
        return createError(new PaymentError(
          `Transaction with processor ID ${processorTransactionId} not found`,
          'TRANSACTION_NOT_FOUND'
        ));
      }
      
      return createSuccess(transaction);
    } catch (error) {
      this.logger.error(`Error getting transaction by processor ID: ${error}`);
      return createError(new PaymentError(
        `Failed to get transaction: ${error instanceof Error ? error.message : String(error)}`,
        'TRANSACTION_FETCH_ERROR'
      ));
    }
  }
  
  /**
   * Find transaction by processor transaction ID
   * Alias for getTransactionByProcessorId to match webhook handler expectations
   */
  async findByProcessorTransactionId(
    processorTransactionId: string,
    processorName: string
  ): Promise<Result<Transaction, PaymentError>> {
    return this.getTransactionByProcessorId(processorName, processorTransactionId);
  }

  /**
   * Get pending transactions
   */
  async getPendingTransactions(): Promise<Result<Transaction[], PaymentError>> {
    try {
      const transactions = await this.transactionRepository.findByStatus(TransactionStatus.PENDING);
      return createSuccess(transactions);
    } catch (error: any) {
      this.logger.error(`Failed to get pending transactions: ${error.message}`);
      return createError(new PaymentError('TRANSACTION_QUERY_FAILED', error.message));
    }
  }

  /**
   * Find transactions that are stuck in pending state for too long
   */
  async getStaleTransactions(thresholdMinutes: number = 30): Promise<Result<Transaction[], PaymentError>> {
    try {
      const threshold = new Date();
      threshold.setMinutes(threshold.getMinutes() - thresholdMinutes);

      const transactions = await this.transactionRepository.findStaleTransactions(
        TransactionStatus.PENDING,
        threshold
      );

      return createSuccess(transactions);
    } catch (error: any) {
      this.logger.error(`Failed to get stale transactions: ${error.message}`);
      return createError(new PaymentError('TRANSACTION_QUERY_FAILED', error.message));
    }
  }

  /**
   * Get transactions by date range
   */
  async getTransactionsByDateRange(
    startDate: Date,
    endDate: Date
  ): Promise<Result<Transaction[], PaymentError>> {
    try {
      const transactions = await this.transactionRepository.findByDateRange(startDate, endDate);
      
      return createSuccess(transactions);
    } catch (error) {
      this.logger.error(`Error getting transactions by date range: ${error}`);
      return createError(new PaymentError(
        `Failed to get transactions: ${error instanceof Error ? error.message : String(error)}`,
        'TRANSACTION_FETCH_ERROR'
      ));
    }
  }
}
