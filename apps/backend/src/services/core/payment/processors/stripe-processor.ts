// apps/backend/src/services/core/payment/processors/stripe-processor.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Result, createSuccess, createError, isSuccess } from '../../../../utils/result';
import { PaymentError } from '../errors/PaymentErrors';
import { BasePaymentProcessor } from './base-payment-processor';
import { 
  ProcessorPaymentRequest, 
  ProcessorPaymentResponse,
  ProcessorStatusRequest
} from '../interfaces/payment-processor.interface';
import { TransactionStatus } from '../../../../common/types/transaction.types';

/**
 * Stripe API integration - in a real app, we would use the official Stripe SDK
 * For the demo, we're creating a thin wrapper that simulates Stripe API calls
 */
class StripeClient {
  private readonly apiKey: string;
  private readonly apiVersion: string = '2023-10-16';
  private readonly baseUrl: string = 'https://api.stripe.com/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Create a payment intent
   * In a real implementation, this would call the Stripe API
   */
  async createPaymentIntent(params: {
    amount: number;
    currency: string;
    description?: string;
    metadata?: Record<string, any>;
  }): Promise<any> {
    // Simulate API call
    await this.simulateApiDelay();

    // In production, this would be an actual Stripe API response
    return {
      id: `pi_${Math.random().toString(36).substring(2, 15)}`,
      object: 'payment_intent',
      amount: params.amount * 100, // Stripe uses smallest currency unit (cents)
      currency: params.currency.toLowerCase(),
      status: 'requires_payment_method',
      description: params.description,
      metadata: params.metadata,
      created: Math.floor(Date.now() / 1000),
      client_secret: `pi_${Math.random().toString(36).substring(2, 15)}_secret_${Math.random().toString(36).substring(2, 15)}`,
    };
  }

  /**
   * Retrieve a payment intent
   * In a real implementation, this would call the Stripe API
   */
  async retrievePaymentIntent(id: string): Promise<any> {
    // Simulate API call
    await this.simulateApiDelay();
    
    // For demo purposes, simulate a random status
    const statuses = ['requires_payment_method', 'requires_confirmation', 'processing', 'succeeded', 'canceled'];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

    // In production, this would be an actual Stripe API response
    return {
      id,
      object: 'payment_intent',
      amount: 5000, // Example: $50.00
      currency: 'usd',
      status: randomStatus,
      created: Math.floor(Date.now() / 1000) - 300, // 5 minutes ago
      metadata: {
        userId: 'example-user-id',
        transactionId: 'example-transaction-id'
      }
    };
  }

  /**
   * Cancel a payment intent
   * In a real implementation, this would call the Stripe API
   */
  async cancelPaymentIntent(id: string): Promise<any> {
    // Simulate API call
    await this.simulateApiDelay();

    // In production, this would be an actual Stripe API response
    return {
      id,
      object: 'payment_intent',
      status: 'canceled',
      canceled_at: Math.floor(Date.now() / 1000)
    };
  }

  private async simulateApiDelay(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200));
  }
}

/**
 * Stripe payment processor implementation
 */
@Injectable()
export class StripeProcessor extends BasePaymentProcessor {
  private stripeClient: StripeClient;
  
  constructor(private configService: ConfigService) {
    // Stripe supports all major currencies
    super('stripe', ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SGD', 'HKD']);
    
    // Initialize Stripe client
    const apiKey = this.configService.get<string>('STRIPE_API_KEY', 'sk_test_example');
    this.stripeClient = new StripeClient(apiKey);
    
    this.logger.info('Stripe processor initialized');
  }
  
  /**
   * Convert Stripe payment intent status to our TransactionStatus
   */
  private mapStripeStatus(stripeStatus: string): TransactionStatus {
    switch (stripeStatus) {
      case 'succeeded':
        return TransactionStatus.COMPLETED;
      case 'canceled':
        return TransactionStatus.CANCELLED;
      case 'requires_payment_method':
      case 'requires_confirmation':
      case 'requires_action':
      case 'requires_capture':
        return TransactionStatus.PENDING;
      case 'processing':
        return TransactionStatus.PROCESSING;
      default:
        return TransactionStatus.UNKNOWN;
    }
  }
  
  /**
   * Process a payment using Stripe
   */
  async processPayment(request: ProcessorPaymentRequest): Promise<Result<ProcessorPaymentResponse, PaymentError>> {
    try {
      this.logger.info(`Processing Stripe payment of ${request.amount} ${request.currency} for user ${request.userId}`);
      
      // Create payment intent
      const paymentIntent = await this.stripeClient.createPaymentIntent({
        amount: request.amount,
        currency: request.currency.toLowerCase(),
        description: request.description || `Payment for user ${request.userId}`,
        metadata: {
          userId: request.userId,
          sourceId: request.sourceId,
          destinationId: request.destinationId,
          transactionId: request.transactionId, // Add transaction ID to metadata for webhook linking
          ...request.metadata
        }
      });
      
      // Map the response
      return createSuccess(this.createStandardResponse(
        paymentIntent.id,
        this.mapStripeStatus(paymentIntent.status),
        request.amount,
        request.currency,
        {
          clientSecret: paymentIntent.client_secret,
          stripeStatus: paymentIntent.status,
          requiresAction: ['requires_action', 'requires_confirmation'].includes(paymentIntent.status),
          ...request.metadata
        }
      ));
    } catch (error: any) {
      this.logger.error(`Stripe payment error: ${error.message}`);
      return createError(new PaymentError('PAYMENT_PROCESSOR_ERROR', error.message));
    }
  }
  
  /**
   * Check payment status with Stripe
   */
  async checkPaymentStatus(request: ProcessorStatusRequest): Promise<Result<ProcessorPaymentResponse, PaymentError>> {
    try {
      this.logger.info(`Checking Stripe payment status for transaction ${request.processorTransactionId}`);
      
      // Retrieve payment intent
      const paymentIntent = await this.stripeClient.retrievePaymentIntent(request.processorTransactionId);
      
      if (!paymentIntent) {
        return createError(new PaymentError('TRANSACTION_NOT_FOUND', `Payment intent ${request.processorTransactionId} not found`));
      }
      
      // Map the response
      return createSuccess(this.createStandardResponse(
        paymentIntent.id,
        this.mapStripeStatus(paymentIntent.status),
        paymentIntent.amount / 100, // Convert from cents to dollars
        paymentIntent.currency,
        {
          stripeStatus: paymentIntent.status,
          ...paymentIntent.metadata
        }
      ));
    } catch (error: any) {
      this.logger.error(`Stripe status check error: ${error.message}`);
      return createError(new PaymentError('STATUS_CHECK_FAILED', error.message));
    }
  }
  
  /**
   * Cancel a payment with Stripe
   */
  async cancelPayment(processorTransactionId: string): Promise<Result<ProcessorPaymentResponse, PaymentError>> {
    try {
      this.logger.info(`Cancelling Stripe payment ${processorTransactionId}`);
      
      // Cancel payment intent
      const paymentIntent = await this.stripeClient.cancelPaymentIntent(processorTransactionId);
      
      // Map the response
      return createSuccess(this.createStandardResponse(
        paymentIntent.id,
        TransactionStatus.CANCELLED,
        paymentIntent.amount / 100, // Convert from cents to dollars
        paymentIntent.currency,
        {
          stripeStatus: paymentIntent.status,
          cancelledAt: new Date(paymentIntent.canceled_at * 1000).toISOString(),
          ...paymentIntent.metadata
        }
      ));
    } catch (error: any) {
      this.logger.error(`Stripe cancellation error: ${error.message}`);
      return createError(new PaymentError('CANCELLATION_FAILED', error.message));
    }
  }
}
