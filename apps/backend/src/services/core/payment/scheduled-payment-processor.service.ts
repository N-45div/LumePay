// apps/backend/src/services/core/payment/scheduled-payment-processor.service.ts

import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { ScheduledPaymentRepository } from '../../../db/repositories/scheduled-payment.repository';
import { ScheduledPaymentService } from './scheduled-payment.service';
import { ScheduleStatus, ScheduledPayment, ScheduleFrequency, ScheduleType } from '../../../db/models/scheduled-payment.entity';
import { Logger } from '../../../utils/logger';
import { addDays, addWeeks, addMonths, addYears } from 'date-fns';
import { ConfigService } from '@nestjs/config';
import { ScheduledPaymentMonitoringDto } from '../../../api/dtos/scheduled-payment-monitoring.dto';

interface ExecutionRecord {
  timestamp: Date;
  processedCount: number;
  successCount: number;
  failureCount: number;
  durationMs: number;
}

/**
 * Service responsible for processing scheduled payments that are due
 */
@Injectable()
export class ScheduledPaymentProcessorService {
  private readonly logger = new Logger(ScheduledPaymentProcessorService.name);
  private readonly maxRetries: number;
  private readonly maxConcurrentProcessing: number;
  private isProcessing: boolean = false;
  
  // Monitoring metrics
  private lastProcessingTime: Date | null = null;
  private processingDurationMs: number | null = null;
  private paymentsProcessedInLastRun: number = 0;
  private totalProcessingTimeMs: number = 0;
  private totalPaymentsProcessed: number = 0;
  private recentExecutions: ExecutionRecord[] = [];
  private maxExecutionHistory: number = 10;

  constructor(
    @InjectRepository(ScheduledPaymentRepository)
    private readonly scheduledPaymentRepository: ScheduledPaymentRepository,
    private readonly scheduledPaymentService: ScheduledPaymentService,
    private readonly configService: ConfigService,
  ) {
    this.maxRetries = this.configService.get<number>('SCHEDULED_PAYMENT_MAX_RETRIES', 3);
    this.maxConcurrentProcessing = this.configService.get<number>('SCHEDULED_PAYMENT_CONCURRENT_LIMIT', 10);
    this.logger.info('ScheduledPaymentProcessorService initialized');
  }

  /**
   * Process scheduled payments that are due
   * Runs every 5 minutes by default
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async processScheduledPayments(): Promise<void> {
    if (this.isProcessing) {
      this.logger.info('Scheduled payment processing already in progress. Skipping...');
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();
    let successCount = 0;
    let failureCount = 0;
    
    try {
      this.logger.info('Starting scheduled payment processing');

      // Find payments that are due
      const duePayments = await this.scheduledPaymentRepository.findDue();
      
      if (duePayments.length === 0) {
        this.logger.info('No scheduled payments due for processing');
        this.paymentsProcessedInLastRun = 0;
        return;
      }

      this.logger.info(`Found ${duePayments.length} scheduled payments due for processing`);

      // Process payments in batches to avoid overloading the system
      // This helps with scaling when there are many scheduled payments
      const batches = this.batchArray(duePayments, this.maxConcurrentProcessing);
      
      for (const batch of batches) {
        const results = await Promise.all(
          batch.map(payment => this.processPayment(payment).then(success => {
            if (success) successCount++;
            else failureCount++;
            return success;
          }))
        );
      }

      this.logger.info('Completed scheduled payment processing');
      this.paymentsProcessedInLastRun = duePayments.length;
      this.totalPaymentsProcessed += duePayments.length;
    } catch (error) {
      failureCount++;
      if (error instanceof Error) {
        this.logger.error('Error during scheduled payment processing', {
          message: error.message,
          stack: error.stack
        });
      } else {
        this.logger.error('Unknown error during scheduled payment processing', {
          error: String(error)
        });
      }
    } finally {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Update monitoring metrics
      this.lastProcessingTime = new Date();
      this.processingDurationMs = duration;
      this.totalProcessingTimeMs += duration;
      
      // Add to execution history
      this.recordExecution({
        timestamp: new Date(),
        processedCount: this.paymentsProcessedInLastRun,
        successCount,
        failureCount,
        durationMs: duration
      });
      
      this.isProcessing = false;
    }
  }

  /**
   * Record execution details for monitoring
   */
  private recordExecution(record: ExecutionRecord): void {
    this.recentExecutions.unshift(record);
    
    // Limit the history size
    if (this.recentExecutions.length > this.maxExecutionHistory) {
      this.recentExecutions = this.recentExecutions.slice(0, this.maxExecutionHistory);
    }
  }

  /**
   * Process a single payment
   */
  private async processPayment(payment: ScheduledPayment): Promise<boolean> {
    const { id, userId, frequency } = payment;
    this.logger.info(`Processing scheduled payment: ${id} for user: ${userId}`);

    try {
      // Execute the payment using executeNow which is public and returns a Result
      const executeResult = await this.scheduledPaymentService.executeNow(id);

      if (executeResult.success) {
        // Payment successful, update status and next execution date
        const nextDate = this.calculateNextExecutionDate(payment);
        const updateData: Partial<ScheduledPayment> = {
          lastExecutionDate: new Date(),
          executionCount: payment.executionCount + 1,
          nextExecutionDate: nextDate,
        };

        // If this was a one-time payment, mark it as completed
        if (frequency === 'ONCE') {
          updateData.status = ScheduleStatus.COMPLETED;
        }

        // If there's a maxExecutions and we've reached it, mark as completed
        if (payment.maxExecutions && payment.executionCount + 1 >= payment.maxExecutions) {
          updateData.status = ScheduleStatus.COMPLETED;
        }

        await this.scheduledPaymentRepository.update(id, updateData);
        this.logger.info(`Successfully processed scheduled payment: ${id}`);
        return true;
      } else {
        // Payment failed - extract error message from ErrorInfo object
        const errorMessage = executeResult.error 
          ? executeResult.error.message || `Error: ${executeResult.error.code}` 
          : 'Unknown error';
        this.handlePaymentFailure(payment, errorMessage);
        return false;
      }
    } catch (error) {
      let errorMessage = 'Unknown error';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        this.logger.error(`Error processing scheduled payment: ${id}`, {
          message: error.message,
          stack: error.stack
        });
      } else {
        this.logger.error(`Unknown error processing scheduled payment: ${id}`, {
          error: String(error)
        });
      }
      
      this.handlePaymentFailure(payment, errorMessage);
      return false;
    }
  }

  /**
   * Handle a payment failure
   */
  private async handlePaymentFailure(payment: ScheduledPayment, errorMessage: string): Promise<void> {
    const { id, failureCount = 0 } = payment;
    
    // Update failure count
    const newFailureCount = failureCount + 1;
    
    // If exceeded max retries, mark as failed
    if (newFailureCount >= this.maxRetries) {
      await this.scheduledPaymentRepository.update(id, {
        status: ScheduleStatus.FAILED,
        failureCount: newFailureCount,
        lastFailureMessage: errorMessage,
        lastFailureDate: new Date(),
      });
      this.logger.warn(`Scheduled payment ${id} has been marked as failed after ${newFailureCount} attempts`);
    } else {
      // Increment failure count but keep active
      await this.scheduledPaymentRepository.update(id, {
        failureCount: newFailureCount,
        lastFailureMessage: errorMessage,
        lastFailureDate: new Date(),
      });
      this.logger.warn(`Scheduled payment ${id} failed (attempt ${newFailureCount}/${this.maxRetries}). Will retry next cycle.`);
    }
  }

  /**
   * Calculate the next execution date based on frequency
   */
  private calculateNextExecutionDate(payment: ScheduledPayment): Date {
    const now = new Date();
    const { frequency } = payment;
    
    switch (frequency) {
      case 'DAILY':
        return addDays(now, 1);
      case 'WEEKLY':
        return addDays(now, 7);
      case 'BIWEEKLY':
        return addDays(now, 14);
      case 'MONTHLY':
        return addMonths(now, 1);
      case 'QUARTERLY':
        return addMonths(now, 3);
      case 'YEARLY':
        return addYears(now, 1);
      default:
        // For one-time payments, use current date (will be marked as completed anyway)
        return now;
    }
  }

  /**
   * Utility to split array into batches
   */
  private batchArray<T>(array: T[], batchSize: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      result.push(array.slice(i, i + batchSize));
    }
    return result;
  }

  /**
   * Manual trigger to process scheduled payments (for testing or admin panel)
   */
  async triggerProcessing(): Promise<string> {
    if (this.isProcessing) {
      return 'Processing already in progress';
    }
    
    // Process asynchronously
    this.processScheduledPayments();
    return 'Processing started';
  }
  
  /**
   * Get monitoring statistics for scheduled payments
   */
  async getMonitoringStats(): Promise<ScheduledPaymentMonitoringDto> {
    // Get counts of payments in different states
    const allPayments = await this.scheduledPaymentRepository.findAll();
    const activePayments = allPayments.filter(p => p.status === ScheduleStatus.ACTIVE);
    const duePayments = await this.scheduledPaymentRepository.findDue();
    const failedPayments = allPayments.filter(p => p.status === ScheduleStatus.FAILED);
    const retryingPayments = activePayments.filter(p => (p.failureCount || 0) > 0);
    
    // Count by type
    const paymentsByType: Record<string, number> = {};
    for (const type of Object.values(ScheduleType)) {
      paymentsByType[type] = allPayments.filter(p => p.type === type).length;
    }
    
    // Count by frequency
    const paymentsByFrequency: Record<string, number> = {};
    for (const frequency of Object.values(ScheduleFrequency)) {
      paymentsByFrequency[frequency] = allPayments.filter(p => p.frequency === frequency).length;
    }
    
    // Calculate average processing time
    const avgProcessingTime = this.totalPaymentsProcessed > 0
      ? this.totalProcessingTimeMs / this.totalPaymentsProcessed
      : null;
      
    return {
      totalScheduledPayments: allPayments.length,
      activeScheduledPayments: activePayments.length,
      duePayments: duePayments.length,
      
      lastProcessingTime: this.lastProcessingTime,
      processingDurationMs: this.processingDurationMs,
      paymentsProcessedInLastRun: this.paymentsProcessedInLastRun,
      
      failedPaymentsCount: failedPayments.length,
      retryingPaymentsCount: retryingPayments.length,
      
      averageProcessingTimeMs: avgProcessingTime,
      
      isCurrentlyProcessing: this.isProcessing,
      
      paymentsByType,
      paymentsByFrequency,
      
      recentExecutions: this.recentExecutions
    };
  }
}
