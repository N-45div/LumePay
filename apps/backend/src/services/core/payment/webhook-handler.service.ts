// apps/backend/src/services/core/payment/webhook-handler.service.ts

import { Injectable } from '@nestjs/common';
import { Logger } from '../../../utils/logger';
import { TransactionTrackingService } from './transaction-tracking.service';
import { PaymentProcessorRegistry } from './payment-processor-registry';
import { TransactionStatus } from '../../../types';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

// Interfaces for webhook handling
export interface WebhookEvent {
  processorName: string;
  payload: Record<string, any>;
  headers: Record<string, string>;
  signature?: string;
}

export interface WebhookValidationResult {
  isValid: boolean;
  transactionId?: string;
  processorTransactionId?: string;
  status?: string; 
  errorMessage?: string;
}

@Injectable()
export class WebhookHandlerService {
  private logger: Logger;
  private webhookSecrets: Record<string, string> = {};

  constructor(
    private transactionTrackingService: TransactionTrackingService,
    private paymentProcessorRegistry: PaymentProcessorRegistry,
    private configService: ConfigService
  ) {
    this.logger = new Logger('WebhookHandlerService');
    
    // Load webhook secrets from config for each processor
    const processors = ['stripe', 'paypal', 'plaid'];
    processors.forEach(processor => {
      const secret = this.configService.get<string>(`payment.webhooks.${processor}.secret`);
      if (secret) {
        this.webhookSecrets[processor] = secret;
      }
    });
  }

  /**
   * Handle an incoming webhook from a payment processor
   * 
   * @param event Webhook event information
   * @returns Success status and message
   */
  async handleWebhook(event: WebhookEvent): Promise<{ success: boolean; message: string }> {
    this.logger.info(`Received webhook from ${event.processorName}`);
    
    try {
      // 1. Validate the webhook signature if available
      if (event.signature && this.webhookSecrets[event.processorName]) {
        const isValid = this.validateSignature(
          event.processorName,
          event.signature,
          event.payload
        );
        
        if (!isValid) {
          this.logger.warn(`Invalid webhook signature from ${event.processorName}`);
          return {
            success: false,
            message: 'Invalid webhook signature'
          };
        }
      }
      
      // 2. Extract transaction information based on processor
      const validationResult = await this.validateAndExtractTransactionInfo(event);
      
      if (!validationResult.isValid) {
        this.logger.warn(`Invalid webhook payload from ${event.processorName}: ${validationResult.errorMessage}`);
        return {
          success: false,
          message: validationResult.errorMessage || 'Invalid webhook payload'
        };
      }
      
      // 3. Find our transaction by processor transaction ID
      if (!validationResult.transactionId && validationResult.processorTransactionId) {
        const transactionResult = await this.transactionTrackingService.findByProcessorTransactionId(
          validationResult.processorTransactionId,
          event.processorName
        );
        
        if (transactionResult.success && transactionResult.data) {
          validationResult.transactionId = transactionResult.data.id;
        } else {
          this.logger.warn(`Transaction not found for ${validationResult.processorTransactionId} from ${event.processorName}`);
          return {
            success: false,
            message: 'Transaction not found'
          };
        }
      }
      
      // 4. Update transaction status
      if (validationResult.transactionId && validationResult.status) {
        let transactionStatus: TransactionStatus;
        
        // Map processor status to our system status
        switch (validationResult.status) {
          case 'succeeded':
          case 'completed':
          case 'success':
          case 'processed':
            transactionStatus = TransactionStatus.COMPLETED;
            break;
          case 'failed':
          case 'failure':
          case 'error':
            transactionStatus = TransactionStatus.FAILED;
            break;
          case 'processing':
          case 'in_progress':
            transactionStatus = TransactionStatus.PROCESSING;
            break;
          case 'pending':
          case 'requires_action':
          case 'requires_capture':
            transactionStatus = TransactionStatus.PENDING;
            break;
          case 'refunded':
          case 'reversed':
            // Use string literal since REFUNDED might not be defined in all versions of TransactionStatus
            transactionStatus = 'refunded' as TransactionStatus;
            break;
          case 'canceled':
          case 'cancelled':
            transactionStatus = TransactionStatus.CANCELLED;
            break;
          default:
            transactionStatus = TransactionStatus.NEEDS_REVIEW;
        }
        
        // Update transaction in our system
        await this.transactionTrackingService.updateTransactionStatus({
          transactionId: validationResult.transactionId,
          status: transactionStatus,
          reason: `Webhook update from ${event.processorName}`,
          metadata: {
            webhookPayload: event.payload,
            webhookReceivedAt: new Date().toISOString()
          }
        });
        
        this.logger.info(`Updated transaction ${validationResult.transactionId} status to ${transactionStatus} from webhook`);
        
        return {
          success: true,
          message: `Transaction ${validationResult.transactionId} updated to ${transactionStatus}`
        };
      }
      
      this.logger.warn(`Webhook processing completed but no action taken`);
      return {
        success: true,
        message: 'Webhook received but no action taken'
      };
    } catch (error) {
      this.logger.error(`Error processing webhook: ${error}`);
      return {
        success: false,
        message: `Error processing webhook: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  /**
   * Validate webhook signature using the secret for the processor
   */
  private validateSignature(processorName: string, signature: string, payload: Record<string, any>): boolean {
    try {
      const secret = this.webhookSecrets[processorName];
      if (!secret) {
        this.logger.warn(`No webhook secret configured for ${processorName}`);
        return false;
      }
      
      // Get the processor from registry to use its signature validation
      const processor = this.paymentProcessorRegistry.getProcessor(processorName);
      if (processor && typeof processor.validateWebhookSignature === 'function') {
        // Use processor's specific validation if available
        return processor.validateWebhookSignature(signature, payload, secret);
      }
      
      // Generic HMAC validation as fallback
      const hmac = crypto.createHmac('sha256', secret);
      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const calculatedSignature = hmac.update(payloadString).digest('hex');
      
      return crypto.timingSafeEqual(
        Buffer.from(calculatedSignature),
        Buffer.from(signature)
      );
    } catch (error) {
      this.logger.error(`Error validating signature: ${error}`);
      return false;
    }
  }
  
  /**
   * Extract transaction information from webhook payload
   * This method uses processor-specific logic to extract transaction ID and status
   */
  private async validateAndExtractTransactionInfo(event: WebhookEvent): Promise<WebhookValidationResult> {
    try {
      // Try to use processor-specific extraction logic
      const processor = this.paymentProcessorRegistry.getProcessor(event.processorName);
      if (processor && typeof processor.parseWebhookEvent === 'function') {
        return await processor.parseWebhookEvent(event.payload);
      }
      
      // Generic extraction based on processor
      switch (event.processorName.toLowerCase()) {
        case 'stripe':
          return this.extractStripeInfo(event.payload);
        case 'paypal':
          return this.extractPayPalInfo(event.payload);
        case 'plaid':
          return this.extractPlaidInfo(event.payload);
        default:
          return {
            isValid: false,
            errorMessage: `Unsupported processor: ${event.processorName}`
          };
      }
    } catch (error) {
      this.logger.error(`Error extracting transaction info: ${error}`);
      return {
        isValid: false,
        errorMessage: `Error extracting transaction info: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  /**
   * Extract transaction information from Stripe webhook
   */
  private extractStripeInfo(payload: Record<string, any>): WebhookValidationResult {
    if (!payload.type || !payload.data || !payload.data.object) {
      return {
        isValid: false,
        errorMessage: 'Invalid Stripe webhook payload structure'
      };
    }
    
    // Handle different event types
    const eventType = payload.type;
    const object = payload.data.object;
    
    if (eventType.startsWith('payment_intent.')) {
      return {
        isValid: true,
        processorTransactionId: object.id,
        status: object.status
      };
    } else if (eventType.startsWith('charge.')) {
      return {
        isValid: true,
        processorTransactionId: object.payment_intent || object.id,
        status: object.status
      };
    } else if (eventType.startsWith('checkout.session.')) {
      return {
        isValid: true,
        processorTransactionId: object.payment_intent,
        status: object.payment_status
      };
    }
    
    return {
      isValid: false,
      errorMessage: `Unsupported Stripe event type: ${eventType}`
    };
  }
  
  /**
   * Extract transaction information from PayPal webhook
   */
  private extractPayPalInfo(payload: Record<string, any>): WebhookValidationResult {
    if (!payload.event_type || !payload.resource) {
      return {
        isValid: false,
        errorMessage: 'Invalid PayPal webhook payload structure'
      };
    }
    
    const eventType = payload.event_type;
    const resource = payload.resource;
    
    if (eventType.startsWith('PAYMENT.') || eventType.startsWith('CHECKOUT.')) {
      return {
        isValid: true,
        processorTransactionId: resource.id,
        status: this.mapPayPalStatus(resource.status || resource.state)
      };
    }
    
    return {
      isValid: false,
      errorMessage: `Unsupported PayPal event type: ${eventType}`
    };
  }
  
  /**
   * Map PayPal status to our system status
   */
  private mapPayPalStatus(paypalStatus: string): string {
    switch (paypalStatus.toLowerCase()) {
      case 'completed':
      case 'approved':
        return 'completed';
      case 'failed':
      case 'denied':
        return 'failed';
      case 'pending':
      case 'in_progress':
        return 'pending';
      case 'refunded':
      case 'reversed':
        return 'refunded';
      case 'canceled':
      case 'cancelled':
        return 'canceled';
      default:
        return 'needs_review';
    }
  }
  
  /**
   * Extract transaction information from Plaid webhook
   */
  private extractPlaidInfo(payload: Record<string, any>): WebhookValidationResult {
    if (!payload.webhook_type || !payload.webhook_code) {
      return {
        isValid: false,
        errorMessage: 'Invalid Plaid webhook payload structure'
      };
    }
    
    const webhookType = payload.webhook_type;
    const webhookCode = payload.webhook_code;
    
    if (webhookType === 'TRANSACTIONS') {
      // For transaction updates, we might need to check our internal records
      return {
        isValid: true,
        status: 'needs_review', // Further processing required
        errorMessage: 'Plaid transaction webhooks require additional processing'
      };
    } else if (webhookType === 'AUTH') {
      // For auth events
      return {
        isValid: true,
        status: webhookCode === 'AUTOMATICALLY_VERIFIED' ? 'completed' : 'needs_review'
      };
    }
    
    return {
      isValid: false,
      errorMessage: `Unsupported Plaid webhook type: ${webhookType}`
    };
  }
}
