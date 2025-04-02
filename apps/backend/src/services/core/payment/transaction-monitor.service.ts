// apps/backend/src/services/core/payment/transaction-monitor.service.ts

import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Logger } from '../../../utils/logger';
import { TransactionTrackingService, Transaction, TransactionType } from './transaction-tracking.service';
import { FiatBridgeService } from '../fiat/FiatBridgeService';
import { TransactionStatus } from '../../../types';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TransactionMonitorService {
  private logger: Logger;
  private staleThresholdMinutes: number;
  private maxRetries: number;

  constructor(
    private transactionTrackingService: TransactionTrackingService,
    private fiatBridgeService: FiatBridgeService,
    private configService: ConfigService
  ) {
    this.logger = new Logger('TransactionMonitorService');
    this.staleThresholdMinutes = configService.get<number>('payment.staleThresholdMinutes', 30);
    this.maxRetries = configService.get<number>('payment.maxRetries', 3);
  }

  /**
   * Periodically check for pending transactions and update their status
   * Runs every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async monitorPendingTransactions() {
    this.logger.info('Running pending transaction monitoring job');
    
    try {
      const pendingResult = await this.transactionTrackingService.getPendingTransactions();
      
      if (!pendingResult.success) {
        this.logger.error(`Failed to fetch pending transactions: ${pendingResult.error.message}`);
        return;
      }
      
      const pendingTransactions = pendingResult.data;
      this.logger.info(`Found ${pendingTransactions.length} pending transactions to check`);
      
      // Process each pending transaction
      for (const transaction of pendingTransactions) {
        await this.processTransaction(transaction);
      }
      
      this.logger.info('Completed pending transaction monitoring job');
    } catch (error) {
      this.logger.error(`Error in transaction monitoring job: ${error}`);
    }
  }
  
  /**
   * Periodically check for stale transactions (stuck in pending state for too long)
   * Runs every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async monitorStaleTransactions() {
    this.logger.info('Running stale transaction monitoring job');
    
    try {
      const staleResult = await this.transactionTrackingService.getStaleTransactions(this.staleThresholdMinutes);
      
      if (!staleResult.success) {
        this.logger.error(`Failed to fetch stale transactions: ${staleResult.error.message}`);
        return;
      }
      
      const staleTransactions = staleResult.data;
      this.logger.info(`Found ${staleTransactions.length} stale transactions to process`);
      
      // Process each stale transaction
      for (const transaction of staleTransactions) {
        await this.handleStaleTransaction(transaction);
      }
      
      this.logger.info('Completed stale transaction monitoring job');
    } catch (error) {
      this.logger.error(`Error in stale transaction monitoring job: ${error}`);
    }
  }
  
  /**
   * Process a pending transaction
   */
  private async processTransaction(transaction: Transaction) {
    try {
      this.logger.info(`Processing transaction ${transaction.id} of type ${transaction.type}`);
      
      switch (transaction.type) {
        case TransactionType.FIAT_PAYMENT:
          await this.processFiatPayment(transaction);
          break;
        case TransactionType.FIAT_TO_CRYPTO:
        case TransactionType.CRYPTO_TO_FIAT:
        case TransactionType.CRYPTO_PAYMENT:
          // These would be handled by the blockchain monitoring service
          this.logger.info(`Transaction ${transaction.id} is a blockchain transaction, skipping in fiat monitor`);
          break;
        default:
          this.logger.warn(`Unknown transaction type for transaction ${transaction.id}: ${transaction.type}`);
      }
    } catch (error) {
      this.logger.error(`Error processing transaction ${transaction.id}: ${error}`);
    }
  }
  
  /**
   * Process a fiat payment transaction
   */
  private async processFiatPayment(transaction: Transaction) {
    if (!transaction.processorName || !transaction.processorTransactionId) {
      this.logger.warn(`Fiat payment ${transaction.id} missing processor information`);
      return;
    }
    
    // Check the payment status with the payment processor
    const statusResult = await this.fiatBridgeService.checkFiatPaymentStatus(
      transaction.processorTransactionId,
      transaction.processorName
    );
    
    if (!statusResult.success) {
      this.logger.error(`Failed to check status for transaction ${transaction.id}: ${statusResult.error.message}`);
      
      // Update retry count
      const retryCount = (transaction.metadata?.retryCount || 0) + 1;
      if (retryCount >= this.maxRetries) {
        // Mark as failed after max retries
        await this.transactionTrackingService.updateTransactionStatus({
          transactionId: transaction.id,
          status: TransactionStatus.FAILED,
          reason: `Failed to check status after ${this.maxRetries} attempts: ${statusResult.error.message}`,
          metadata: {
            ...transaction.metadata,
            retryCount,
            lastError: statusResult.error.message
          }
        });
      } else {
        // Update retry count in metadata
        await this.transactionTrackingService.updateTransactionStatus({
          transactionId: transaction.id,
          status: transaction.status, // Keep the same status
          reason: `Status check failed, will retry (attempt ${retryCount}/${this.maxRetries})`,
          metadata: {
            ...transaction.metadata,
            retryCount,
            lastError: statusResult.error.message
          }
        });
      }
      return;
    }
    
    const paymentStatus = statusResult.data;
    
    // If status has changed, update our transaction
    if (paymentStatus.status === 'completed' && transaction.status !== TransactionStatus.COMPLETED) {
      await this.transactionTrackingService.updateTransactionStatus({
        transactionId: transaction.id,
        status: TransactionStatus.COMPLETED,
        reason: 'Payment completed successfully',
        metadata: {
          ...transaction.metadata,
          processorDetails: paymentStatus
        }
      });
      this.logger.info(`Updated transaction ${transaction.id} status to COMPLETED`);
    } else if (paymentStatus.status === 'failed' && transaction.status !== TransactionStatus.FAILED) {
      await this.transactionTrackingService.updateTransactionStatus({
        transactionId: transaction.id,
        status: TransactionStatus.FAILED,
        reason: paymentStatus.errorMessage || 'Payment failed at processor',
        metadata: {
          ...transaction.metadata,
          processorDetails: paymentStatus
        }
      });
      this.logger.info(`Updated transaction ${transaction.id} status to FAILED`);
    } else {
      this.logger.info(`Transaction ${transaction.id} status unchanged: ${transaction.status}`);
      
      // Update last checked timestamp
      await this.transactionTrackingService.updateTransactionStatus({
        transactionId: transaction.id,
        status: transaction.status,
        reason: 'Status check performed, no change',
        metadata: {
          ...transaction.metadata,
          lastChecked: new Date().toISOString(),
          processorDetails: paymentStatus
        }
      });
    }
  }
  
  /**
   * Handle a transaction that has been pending for too long
   */
  private async handleStaleTransaction(transaction: Transaction) {
    this.logger.warn(`Handling stale transaction ${transaction.id}, pending for > ${this.staleThresholdMinutes} minutes`);
    
    // For fiat payments, we can try a final status check
    if (transaction.type === TransactionType.FIAT_PAYMENT &&
        transaction.processorName && 
        transaction.processorTransactionId) {
      
      const statusResult = await this.fiatBridgeService.checkFiatPaymentStatus(
        transaction.processorTransactionId,
        transaction.processorName
      );
      
      if (statusResult.success) {
        const paymentStatus = statusResult.data;
        
        if (paymentStatus.status === 'completed') {
          await this.transactionTrackingService.updateTransactionStatus({
            transactionId: transaction.id,
            status: TransactionStatus.COMPLETED,
            reason: 'Payment recovered from stale state',
            metadata: {
              ...transaction.metadata,
              processorDetails: paymentStatus,
              recovered: true
            }
          });
          this.logger.info(`Recovered stale transaction ${transaction.id} to COMPLETED`);
          return;
        } else if (paymentStatus.status === 'failed') {
          await this.transactionTrackingService.updateTransactionStatus({
            transactionId: transaction.id,
            status: TransactionStatus.FAILED,
            reason: paymentStatus.errorMessage || 'Payment failed at processor',
            metadata: {
              ...transaction.metadata,
              processorDetails: paymentStatus
            }
          });
          this.logger.info(`Updated stale transaction ${transaction.id} to FAILED`);
          return;
        }
      }
    }
    
    // If we couldn't resolve the status, mark as requiring manual review
    await this.transactionTrackingService.updateTransactionStatus({
      transactionId: transaction.id,
      status: TransactionStatus.NEEDS_REVIEW,
      reason: `Transaction stuck in ${transaction.status} state for > ${this.staleThresholdMinutes} minutes`,
      metadata: {
        ...transaction.metadata,
        staleAt: new Date().toISOString()
      }
    });
    
    this.logger.info(`Marked stale transaction ${transaction.id} for manual review`);
  }
}
