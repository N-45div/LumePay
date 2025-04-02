import { 
  Controller, 
  Post, 
  Headers, 
  Body, 
  RawBodyRequest, 
  Req,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';
import { TransactionTrackingService } from '../../services/core/payment/transaction-tracking.service';
import { TransactionStatus } from '../../common/types/transaction.types';
@Controller('webhooks/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);
  constructor(
    private readonly configService: ConfigService,
    private readonly transactionTrackingService: TransactionTrackingService
  ) {}
  private verifyStripeSignature(
    rawBody: string, 
    signature: string
  ): boolean {
    try {
      const webhookSecret = this.configService.get<string>('stripe.webhookSecret');
      if (!webhookSecret) {
        this.logger.error('Missing Stripe webhook secret');
        return false;
      }
      const details = signature.split(',').reduce((result, item) => {
        const [key, value] = item.split('=');
        result[key.trim()] = value;
        return result;
      }, {} as Record<string, string>);
      const timestamp = details.t;
      const eventAge = Math.floor(Date.now() / 1000) - Number(timestamp);
      if (eventAge > 300) { // 5 minutes
        this.logger.warn(`Webhook timestamp too old: ${eventAge} seconds`);
        return false;
      }
      const payloadToSign = `${timestamp}.${rawBody}`;
      const computedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payloadToSign)
        .digest('hex');
      const expectedSignature = details.v1;
      return crypto.timingSafeEqual(
        Buffer.from(computedSignature),
        Buffer.from(expectedSignature)
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error verifying Stripe signature: ${errorMessage}`);
      return false;
    }
  }
  @Post()
  async handleWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
    @Body() event: any
  ): Promise<any> {
    try {
      const rawBody = request.rawBody?.toString() || '';
      if (!signature || !this.verifyStripeSignature(rawBody, signature)) {
        this.logger.warn('Invalid Stripe webhook signature');
        throw new HttpException('Invalid signature', HttpStatus.BAD_REQUEST);
      }
      this.logger.log(`Received Stripe webhook event: ${event.type}`);
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event.data.object);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(event.data.object);
          break;
        case 'payment_intent.canceled':
          await this.handlePaymentIntentCanceled(event.data.object);
          break;
        case 'payment_intent.processing':
          await this.handlePaymentIntentProcessing(event.data.object);
          break;
        default:
          this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
          break;
      }
      return { received: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error handling Stripe webhook: ${errorMessage}`);
      return { received: true, error: errorMessage };
    }
  }
  private async handlePaymentIntentSucceeded(paymentIntent: any): Promise<void> {
    try {
      const transactionId = this.getTransactionIdFromMetadata(paymentIntent);
      if (!transactionId) return;
      await this.updateTransactionStatus(
        transactionId, 
        TransactionStatus.COMPLETED,
        {
          stripePaymentIntentId: paymentIntent.id,
          amountReceived: paymentIntent.amount_received / 100, // Convert from cents
          processorResponse: paymentIntent,
          completedAt: new Date().toISOString()
        }
      );
      this.logger.log(`Payment succeeded for transaction ${transactionId}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error handling payment_intent.succeeded: ${errorMessage}`);
    }
  }
  private async handlePaymentIntentFailed(paymentIntent: any): Promise<void> {
    try {
      const transactionId = this.getTransactionIdFromMetadata(paymentIntent);
      if (!transactionId) return;
      await this.updateTransactionStatus(
        transactionId,
        TransactionStatus.FAILED,
        {
          stripePaymentIntentId: paymentIntent.id,
          errorMessage: paymentIntent.last_payment_error?.message || 'Payment failed',
          errorCode: paymentIntent.last_payment_error?.code,
          processorResponse: paymentIntent,
          failedAt: new Date().toISOString()
        }
      );
      this.logger.log(`Payment failed for transaction ${transactionId}: ${paymentIntent.last_payment_error?.message || 'Unknown error'}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error handling payment_intent.payment_failed: ${errorMessage}`);
    }
  }
  private async handlePaymentIntentCanceled(paymentIntent: any): Promise<void> {
    try {
      const transactionId = this.getTransactionIdFromMetadata(paymentIntent);
      if (!transactionId) return;
      await this.updateTransactionStatus(
        transactionId,
        TransactionStatus.CANCELLED,
        {
          stripePaymentIntentId: paymentIntent.id,
          cancelReason: paymentIntent.cancellation_reason,
          processorResponse: paymentIntent,
          cancelledAt: new Date().toISOString()
        }
      );
      this.logger.log(`Payment cancelled for transaction ${transactionId}: ${paymentIntent.cancellation_reason || 'No reason provided'}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error handling payment_intent.canceled: ${errorMessage}`);
    }
  }
  private async handlePaymentIntentProcessing(paymentIntent: any): Promise<void> {
    try {
      const transactionId = this.getTransactionIdFromMetadata(paymentIntent);
      if (!transactionId) return;
      await this.updateTransactionStatus(
        transactionId,
        TransactionStatus.PROCESSING,
        {
          stripePaymentIntentId: paymentIntent.id,
          processorResponse: paymentIntent,
          processingStartedAt: new Date().toISOString()
        }
      );
      this.logger.log(`Payment processing for transaction ${transactionId}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error handling payment_intent.processing: ${errorMessage}`);
    }
  }
  private getTransactionIdFromMetadata(paymentIntent: any): string | null {
    if (!paymentIntent.metadata || !paymentIntent.metadata.transactionId) {
      this.logger.warn(`No transaction ID found in payment intent metadata: ${paymentIntent.id}`);
      return null;
    }
    return paymentIntent.metadata.transactionId;
  }
  private async updateTransactionStatus(
    transactionId: string, 
    status: TransactionStatus,
    metadata: Record<string, any>
  ): Promise<void> {
    const result = await this.transactionTrackingService.updateTransactionStatus({
      transactionId,
      status,
      metadata
    });
    if (!result.success) {
      throw new Error(`Failed to update transaction status: ${result.error.message}`);
    }
  }
}
