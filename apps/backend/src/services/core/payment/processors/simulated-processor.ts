// apps/backend/src/services/core/payment/processors/simulated-processor.ts

import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Result, createSuccess, createError } from '../../../../utils/result';
import { PaymentError } from '../errors/PaymentErrors';
import { BasePaymentProcessor } from './base-payment-processor';
import { 
  ProcessorPaymentRequest, 
  ProcessorPaymentResponse,
  ProcessorStatusRequest
} from '../interfaces/payment-processor.interface';
import { TransactionStatus } from '../../../../common/types/transaction.types';

/**
 * A simulated payment processor for testing and development
 */
@Injectable()
export class SimulatedPaymentProcessor extends BasePaymentProcessor {
  private transactions: Map<string, ProcessorPaymentResponse> = new Map();
  private failureRate: number = 0.1; // 10% chance of payment failure for testing
  private delayedTransactions: Map<string, NodeJS.Timeout> = new Map();
  
  constructor() {
    // Support all major fiat currencies for simulation
    super('simulated_processor', ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD']);
  }
  
  /**
   * Process a payment with the simulated processor
   */
  async processPayment(request: ProcessorPaymentRequest): Promise<Result<ProcessorPaymentResponse, PaymentError>> {
    try {
      this.logger.info(`Processing ${request.amount} ${request.currency} payment for user ${request.userId}`);
      
      // Simulate network delay
      await this.delay(500);
      
      // Random failure for testing error handling
      if (Math.random() < this.failureRate) {
        return createError(new PaymentError('PAYMENT_FAILED', 'Simulated payment failure'));
      }
      
      // Generate a unique transaction ID
      const processorTransactionId = `sim-${uuidv4()}`;
      
      // Calculate a mock fee
      const fee = request.amount * 0.029 + 0.30; // Common payment processor fee structure
      
      // Create a response with initial PENDING status
      const response: ProcessorPaymentResponse = this.createStandardResponse(
        processorTransactionId,
        TransactionStatus.PENDING,
        request.amount,
        request.currency,
        {
          fee,
          description: request.description || 'Simulated payment',
          simulatedPayment: true,
          ...request.metadata
        }
      );
      
      // Store the transaction
      this.transactions.set(processorTransactionId, response);
      
      // 80% of transactions complete after a delay, 10% fail, 10% stay pending
      const randomOutcome = Math.random();
      if (randomOutcome < 0.8) {
        // Schedule the transaction to complete after a delay
        const timeout = setTimeout(() => {
          const updatedResponse = { 
            ...response, 
            status: TransactionStatus.COMPLETED,
            metadata: { ...response.metadata, completedAt: new Date().toISOString() }
          };
          this.transactions.set(processorTransactionId, updatedResponse);
          this.delayedTransactions.delete(processorTransactionId);
        }, 3000 + Math.random() * 7000); // Random delay between 3-10 seconds
        
        this.delayedTransactions.set(processorTransactionId, timeout);
      } else if (randomOutcome < 0.9) {
        // Schedule the transaction to fail after a delay
        const timeout = setTimeout(() => {
          const updatedResponse = { 
            ...response, 
            status: TransactionStatus.FAILED,
            metadata: { ...response.metadata, failedAt: new Date().toISOString(), reason: 'Simulated failure' }
          };
          this.transactions.set(processorTransactionId, updatedResponse);
          this.delayedTransactions.delete(processorTransactionId);
        }, 3000 + Math.random() * 7000);
        
        this.delayedTransactions.set(processorTransactionId, timeout);
      }
      
      return createSuccess(response);
    } catch (error: any) {
      this.logger.error(`Error processing payment: ${error.message}`);
      return createError(new PaymentError('PROCESSOR_ERROR', error.message));
    }
  }
  
  /**
   * Check the status of a payment
   */
  async checkPaymentStatus(request: ProcessorStatusRequest): Promise<Result<ProcessorPaymentResponse, PaymentError>> {
    try {
      // Simulate network delay
      await this.delay(300);
      
      // Look up the transaction
      const transaction = this.transactions.get(request.processorTransactionId);
      
      if (!transaction) {
        return createError(new PaymentError('TRANSACTION_NOT_FOUND', `Transaction ${request.processorTransactionId} not found`));
      }
      
      return createSuccess(transaction);
    } catch (error: any) {
      this.logger.error(`Error checking payment status: ${error.message}`);
      return createError(new PaymentError('PROCESSOR_ERROR', error.message));
    }
  }
  
  /**
   * Cancel a payment if it's still pending
   */
  async cancelPayment(processorTransactionId: string): Promise<Result<ProcessorPaymentResponse, PaymentError>> {
    try {
      // Simulate network delay
      await this.delay(400);
      
      // Look up the transaction
      const transaction = this.transactions.get(processorTransactionId);
      
      if (!transaction) {
        return createError(new PaymentError('TRANSACTION_NOT_FOUND', `Transaction ${processorTransactionId} not found`));
      }
      
      // Can only cancel pending transactions
      if (transaction.status !== TransactionStatus.PENDING) {
        return createError(new PaymentError('INVALID_TRANSACTION_STATE', 
          `Cannot cancel transaction in ${transaction.status} state`));
      }
      
      // Clear any pending status change
      if (this.delayedTransactions.has(processorTransactionId)) {
        clearTimeout(this.delayedTransactions.get(processorTransactionId));
        this.delayedTransactions.delete(processorTransactionId);
      }
      
      // Update the transaction status
      const updatedTransaction: ProcessorPaymentResponse = {
        ...transaction,
        status: TransactionStatus.CANCELLED,
        metadata: {
          ...transaction.metadata,
          cancelledAt: new Date().toISOString()
        }
      };
      
      // Store the updated transaction
      this.transactions.set(processorTransactionId, updatedTransaction);
      
      return createSuccess(updatedTransaction);
    } catch (error: any) {
      this.logger.error(`Error cancelling payment: ${error.message}`);
      return createError(new PaymentError('PROCESSOR_ERROR', error.message));
    }
  }
  
  /**
   * Set the simulated failure rate (0-1)
   */
  setFailureRate(rate: number): void {
    this.failureRate = Math.max(0, Math.min(1, rate));
  }
  
  /**
   * Helper method to simulate delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
