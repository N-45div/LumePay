// apps/backend/src/services/core/payment/scheduled-payment.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { 
  ScheduledPayment, 
  ScheduleFrequency, 
  ScheduleStatus, 
  ScheduleType 
} from '../../../db/models/scheduled-payment.entity';
import { ScheduledPaymentRepository } from '../../../db/repositories/scheduled-payment.repository';
import { FiatBridgeService } from './fiat-bridge.service';
import { ConversionService } from '../conversion/conversion.service';
import { Logger } from '../../../utils/logger';
import { Result, createSuccessResult, createErrorResult } from '../../../common/types/result.types';
import { addDays, addWeeks, addMonths, addYears } from 'date-fns';
import { TransactionType, TransactionStatus } from '../../../common/types/transaction.types';

export interface CreateScheduleDto {
  userId: string;
  name: string;
  type: ScheduleType;
  amount: number;
  currency: string;
  frequency: ScheduleFrequency;
  nextExecutionDate: Date;
  metadata?: any;
  processorName?: string;
  processorAccountId?: string;
  destinationId?: string;
  maxExecutions?: number;
  endDate?: Date;
}

export interface ScheduleUpdateDto {
  name?: string;
  amount?: number;
  currency?: string;
  frequency?: ScheduleFrequency;
  nextExecutionDate?: Date;
  status?: ScheduleStatus;
  metadata?: any;
  processorName?: string;
  processorAccountId?: string;
  destinationId?: string;
  maxExecutions?: number;
  endDate?: Date;
}

@Injectable()
export class ScheduledPaymentService {
  constructor(
    private readonly scheduledPaymentRepository: ScheduledPaymentRepository,
    private readonly fiatBridgeService: FiatBridgeService,
    private readonly conversionService: ConversionService,
    private readonly configService: ConfigService,
    private readonly logger: Logger
  ) {}

  /**
   * Create a new scheduled payment
   */
  async createSchedule(
    data: CreateScheduleDto
  ): Promise<Result<ScheduledPayment>> {
    try {
      // Validate inputs based on type
      if (!this.validateScheduleData(data)) {
        return createErrorResult(
          'INVALID_SCHEDULE_DATA',
          'Invalid schedule data provided',
          undefined
        );
      }

      const scheduledPayment = await this.scheduledPaymentRepository.create({
        ...data,
        executionCount: 0,
        status: ScheduleStatus.ACTIVE
      });

      return createSuccessResult(scheduledPayment);
    } catch (error: any) {
      this.logger.error(
        `Error creating scheduled payment: ${error.message}`,
        {
          stack: error.stack,
          errorDetails: error.toString()
        }
      );
      return createErrorResult(
        'SCHEDULE_CREATION_ERROR',
        'Failed to create scheduled payment',
        error.message
      );
    }
  }

  /**
   * Get a scheduled payment by ID
   */
  async getScheduleById(id: string): Promise<Result<ScheduledPayment>> {
    try {
      const schedule = await this.scheduledPaymentRepository.findById(id);
      
      if (!schedule) {
        return createErrorResult(
          'SCHEDULE_NOT_FOUND',
          `Scheduled payment with ID ${id} not found`,
          undefined
        );
      }

      return createSuccessResult(schedule);
    } catch (error: any) {
      this.logger.error(
        `Error getting scheduled payment ${id}: ${error.message}`,
        {
          stack: error.stack,
          errorDetails: error.toString()
        }
      );
      return createErrorResult(
        'SCHEDULE_FETCH_ERROR',
        'Failed to fetch scheduled payment',
        error.message
      );
    }
  }

  /**
   * Update a scheduled payment
   */
  async updateSchedule(
    id: string,
    data: ScheduleUpdateDto
  ): Promise<Result<ScheduledPayment>> {
    try {
      const existingSchedule = await this.scheduledPaymentRepository.findById(id);
      
      if (!existingSchedule) {
        return createErrorResult(
          'SCHEDULE_NOT_FOUND',
          `Scheduled payment with ID ${id} not found`,
          undefined
        );
      }

      const updatedSchedule = await this.scheduledPaymentRepository.update(id, data);

      return createSuccessResult(updatedSchedule);
    } catch (error: any) {
      this.logger.error(
        `Error updating scheduled payment ${id}: ${error.message}`,
        {
          stack: error.stack,
          errorDetails: error.toString()
        }
      );
      return createErrorResult(
        'SCHEDULE_UPDATE_ERROR',
        'Failed to update scheduled payment',
        error.message
      );
    }
  }

  /**
   * Cancel a scheduled payment
   */
  async cancelSchedule(id: string): Promise<Result<ScheduledPayment>> {
    try {
      const existingSchedule = await this.scheduledPaymentRepository.findById(id);
      
      if (!existingSchedule) {
        return createErrorResult(
          'SCHEDULE_NOT_FOUND',
          `Scheduled payment with ID ${id} not found`,
          undefined
        );
      }

      const updatedSchedule = await this.scheduledPaymentRepository.update(id, {
        status: ScheduleStatus.CANCELLED
      });

      return createSuccessResult(updatedSchedule);
    } catch (error: any) {
      this.logger.error(
        `Error cancelling scheduled payment ${id}: ${error.message}`,
        {
          stack: error.stack,
          errorDetails: error.toString()
        }
      );
      return createErrorResult(
        'SCHEDULE_CANCELLATION_ERROR',
        'Failed to cancel scheduled payment',
        error.message
      );
    }
  }

  /**
   * Get all scheduled payments for a user
   */
  async getUserSchedules(userId: string): Promise<Result<ScheduledPayment[]>> {
    try {
      const schedules = await this.scheduledPaymentRepository.findByUserId(userId);

      return createSuccessResult(schedules);
    } catch (error: any) {
      this.logger.error(
        `Error getting user schedules for ${userId}: ${error.message}`,
        {
          stack: error.stack,
          errorDetails: error.toString()
        }
      );
      return createErrorResult(
        'USER_SCHEDULES_FETCH_ERROR',
        'Failed to fetch user scheduled payments',
        error.message
      );
    }
  }

  /**
   * Validate the scheduled payment data before creating
   */
  private validateScheduleData(data: CreateScheduleDto): boolean {
    // Common validations
    if (data.amount <= 0) {
      return false;
    }

    // Type-specific validations
    switch (data.type) {
      case ScheduleType.FIAT_TO_CRYPTO:
        // Validate fiat currency is supported
        if (!this.conversionService.isSupportedFiatCurrency(data.currency)) {
          return false;
        }
        // Validate destination is a supported crypto
        if (!data.destinationId || !this.conversionService.isSupportedCryptoCurrency(data.destinationId)) {
          return false;
        }
        break;

      case ScheduleType.CRYPTO_TO_FIAT:
        // Validate crypto currency is supported
        if (!this.conversionService.isSupportedCryptoCurrency(data.currency)) {
          return false;
        }
        // Validate destination is a supported fiat
        if (!data.destinationId || !this.conversionService.isSupportedFiatCurrency(data.destinationId)) {
          return false;
        }
        break;

      case ScheduleType.FIAT_DEPOSIT:
        // Ensure processor name is provided
        if (!data.processorName) {
          return false;
        }
        break;

      case ScheduleType.FIAT_WITHDRAWAL:
        // Ensure processor name and destination are provided
        if (!data.processorName || !data.destinationId) {
          return false;
        }
        break;
    }

    return true;
  }

  /**
   * Calculate the next execution date based on frequency
   */
  private calculateNextExecutionDate(
    currentDate: Date,
    frequency: ScheduleFrequency
  ): Date | null {
    switch (frequency) {
      case ScheduleFrequency.DAILY:
        return addDays(currentDate, 1);
        
      case ScheduleFrequency.WEEKLY:
        return addWeeks(currentDate, 1);
        
      case ScheduleFrequency.BIWEEKLY:
        return addWeeks(currentDate, 2);
        
      case ScheduleFrequency.MONTHLY:
        return addMonths(currentDate, 1);
        
      case ScheduleFrequency.QUARTERLY:
        return addMonths(currentDate, 3);
        
      case ScheduleFrequency.YEARLY:
        return addYears(currentDate, 1);
        
      case ScheduleFrequency.ONCE:
        return null; // No next date for one-time payments
        
      default:
        this.logger.warn(`Unknown frequency: ${frequency}, defaulting to monthly`);
        return addMonths(currentDate, 1);
    }
  }

  /**
   * Execute a scheduled payment
   * This is the core method that processes the payment based on its type
   */
  private async executeScheduledPayment(schedule: ScheduledPayment): Promise<boolean> {
    try {
      this.logger.info(`Executing scheduled payment ${schedule.id} of type ${schedule.type}`);
      
      let success = false;
      
      switch (schedule.type) {
        case ScheduleType.FIAT_DEPOSIT:
          // Process a fiat deposit using transferFunds
          const depositResult = await this.fiatBridgeService.transferFunds({
            userId: schedule.userId,
            amount: schedule.amount,
            currency: schedule.currency,
            destinationAccountId: schedule.processorAccountId,
            preferredProcessor: schedule.processorName,
            metadata: { 
              isScheduled: true,
              scheduleId: schedule.id,
              type: 'deposit'
            }
          });
          success = depositResult.success;
          break;

        case ScheduleType.FIAT_WITHDRAWAL:
          // Process a fiat withdrawal using transferFunds
          const withdrawalResult = await this.fiatBridgeService.transferFunds({
            userId: schedule.userId,
            amount: schedule.amount,
            currency: schedule.currency,
            destinationAccountId: schedule.destinationId,
            preferredProcessor: schedule.processorName,
            metadata: { 
              isScheduled: true,
              scheduleId: schedule.id,
              type: 'withdrawal'
            }
          });
          success = withdrawalResult.success;
          break;

        case ScheduleType.FIAT_TO_CRYPTO:
          // Convert fiat to crypto
          // destinationId should contain target crypto currency
          const fiatToCryptoResult = await this.conversionService.convertFiatToCrypto(
            schedule.userId,
            schedule.amount,
            schedule.currency,
            schedule.destinationId || 'SOL' // Target crypto currency
          );
          success = fiatToCryptoResult.success;
          if (!success) {
            this.logger.error(`Failed to convert fiat to crypto: ${fiatToCryptoResult.error?.message || 'Unknown error'}`);
          }
          break;

        case ScheduleType.CRYPTO_TO_FIAT:
          // Convert crypto to fiat
          // destinationId should contain target fiat currency
          const cryptoToFiatResult = await this.conversionService.convertCryptoToFiat(
            schedule.userId,
            schedule.amount,
            schedule.currency,
            schedule.destinationId || 'USD' // Target fiat currency
          );
          success = cryptoToFiatResult.success;
          if (!success) {
            this.logger.error(`Failed to convert crypto to fiat: ${cryptoToFiatResult.error?.message || 'Unknown error'}`);
          }
          break;

        default:
          this.logger.error(`Unknown schedule type: ${schedule.type}`);
          return false;
      }

      if (success) {
        // Update execution count
        await this.scheduledPaymentRepository.incrementExecutionCount(schedule.id);

        // Calculate and update next execution date
        if (schedule.frequency !== ScheduleFrequency.ONCE) {
          const nextDate = this.calculateNextExecutionDate(
            new Date(),
            schedule.frequency
          );

          // If end date is set and next date exceeds it, mark as completed
          if (nextDate && schedule.endDate && nextDate > schedule.endDate) {
            await this.scheduledPaymentRepository.update(schedule.id, {
              status: ScheduleStatus.COMPLETED,
              lastExecutionDate: new Date()
            });
          } else if (nextDate) {
            await this.scheduledPaymentRepository.updateNextExecutionDate(schedule.id, nextDate);
          }
        } else {
          // For one-time payments, mark as completed
          await this.scheduledPaymentRepository.update(schedule.id, {
            status: ScheduleStatus.COMPLETED,
            lastExecutionDate: new Date()
          });
        }

        return true;
      } else {
        // Mark as failed if the payment couldn't be processed
        await this.scheduledPaymentRepository.update(schedule.id, {
          status: ScheduleStatus.FAILED,
          lastExecutionDate: new Date()
        });
        return false;
      }
    } catch (error: any) {
      this.logger.error(
        `Error executing scheduled payment ${schedule.id}: ${error.message}`,
        {
          stack: error.stack,
          errorDetails: error.toString()
        }
      );
      return false;
    }
  }

  /**
   * Process all due scheduled payments
   * Runs every 5 minutes by default
   */
  @Cron('0 */5 * * * *')
  async processScheduledPayments() {
    try {
      this.logger.info('Starting scheduled payments processing');
      
      // Find all due payments
      const duePayments = await this.scheduledPaymentRepository.findDuePayments();
      
      if (duePayments.length === 0) {
        this.logger.info('No due scheduled payments found');
        return;
      }
      
      this.logger.info(`Found ${duePayments.length} due scheduled payments to process`);
      
      // Process each payment
      const results = await Promise.all(
        duePayments.map(async (payment) => {
          try {
            const success = await this.executeScheduledPayment(payment);
            return { id: payment.id, success };
          } catch (error: any) {
            this.logger.error(
              `Error processing scheduled payment ${payment.id}: ${error.message}`,
              {
                stack: error.stack, 
                errorDetails: error.toString()
              }
            );
            return { id: payment.id, success: false, error: error.message };
          }
        })
      );
      
      // Log results
      const successCount = results.filter(r => r.success).length;
      this.logger.info(
        `Completed scheduled payments processing. Success: ${successCount}/${duePayments.length}`
      );
      
      // Log failures
      const failures = results.filter(r => !r.success);
      if (failures.length > 0) {
        failures.forEach(failure => {
          this.logger.error(`Failed to process scheduled payment ${failure.id}: ${failure.error || 'Unknown error'}`);
        });
      }
    } catch (error: any) {
      this.logger.error(
        `Error in scheduled payments processing: ${error.message}`,
        {
          stack: error.stack,
          errorDetails: error.toString()
        }
      );
    }
  }

  /**
   * Pause a scheduled payment
   */
  async pauseSchedule(id: string): Promise<Result<ScheduledPayment>> {
    try {
      const existingSchedule = await this.scheduledPaymentRepository.findById(id);
      
      if (!existingSchedule) {
        return createErrorResult(
          'SCHEDULE_NOT_FOUND',
          `Scheduled payment with ID ${id} not found`,
          undefined
        );
      }

      const updatedSchedule = await this.scheduledPaymentRepository.update(id, {
        status: ScheduleStatus.PAUSED
      });

      return createSuccessResult(updatedSchedule);
    } catch (error: any) {
      this.logger.error(
        `Error pausing scheduled payment ${id}: ${error.message}`,
        {
          stack: error.stack,
          errorDetails: error.toString()
        }
      );
      return createErrorResult(
        'SCHEDULE_PAUSE_ERROR',
        'Failed to pause scheduled payment',
        error.message
      );
    }
  }

  /**
   * Resume a paused scheduled payment
   */
  async resumeSchedule(id: string): Promise<Result<ScheduledPayment>> {
    try {
      const existingSchedule = await this.scheduledPaymentRepository.findById(id);
      
      if (!existingSchedule) {
        return createErrorResult(
          'SCHEDULE_NOT_FOUND',
          `Scheduled payment with ID ${id} not found`,
          undefined
        );
      }

      if (existingSchedule.status !== ScheduleStatus.PAUSED) {
        return createErrorResult(
          'SCHEDULE_NOT_PAUSED',
          'Cannot resume a schedule that is not paused',
          undefined
        );
      }

      const updatedSchedule = await this.scheduledPaymentRepository.update(id, {
        status: ScheduleStatus.ACTIVE
      });

      return createSuccessResult(updatedSchedule);
    } catch (error: any) {
      this.logger.error(
        `Error resuming scheduled payment ${id}: ${error.message}`,
        {
          stack: error.stack,
          errorDetails: error.toString()
        }
      );
      return createErrorResult(
        'SCHEDULE_RESUME_ERROR',
        'Failed to resume scheduled payment',
        error.message
      );
    }
  }

  /**
   * Get scheduled payment statistics for a user
   */
  async getUserScheduleStats(
    userId: string
  ): Promise<Result<{ 
    total: number; 
    active: number; 
    paused: number; 
    completed: number; 
    failed: number;
    byType: { [key in ScheduleType]?: number };
    upcomingPayments: ScheduledPayment[];
  }>> {
    try {
      const schedules = await this.scheduledPaymentRepository.findByUserId(userId);
      
      const stats = {
        total: schedules.length,
        active: schedules.filter(s => s.status === ScheduleStatus.ACTIVE).length,
        paused: schedules.filter(s => s.status === ScheduleStatus.PAUSED).length,
        completed: schedules.filter(s => s.status === ScheduleStatus.COMPLETED).length,
        failed: schedules.filter(s => s.status === ScheduleStatus.FAILED).length,
        byType: {} as { [key in ScheduleType]?: number },
        upcomingPayments: schedules
          .filter(s => s.status === ScheduleStatus.ACTIVE)
          .sort((a, b) => a.nextExecutionDate.getTime() - b.nextExecutionDate.getTime())
          .slice(0, 5) // Get next 5 upcoming payments
      };
      
      // Count by type
      schedules.forEach(schedule => {
        if (!stats.byType[schedule.type]) {
          stats.byType[schedule.type] = 0;
        }
        stats.byType[schedule.type]!++;
      });

      return createSuccessResult(stats);
    } catch (error: any) {
      this.logger.error(
        `Error getting schedule stats for user ${userId}: ${error.message}`,
        {
          stack: error.stack,
          errorDetails: error.toString()
        }
      );
      return createErrorResult(
        'SCHEDULE_STATS_ERROR',
        'Failed to get scheduled payment statistics',
        error.message
      );
    }
  }

  /**
   * Force run a scheduled payment now
   */
  async executeNow(id: string): Promise<Result<boolean>> {
    try {
      const scheduleResult = await this.getScheduleById(id);
      
      if (!scheduleResult.success || !scheduleResult.data) {
        return createErrorResult(
          'SCHEDULE_NOT_FOUND',
          'Scheduled payment not found',
          undefined
        );
      }
      
      const schedule = scheduleResult.data;
      
      if (schedule.status !== ScheduleStatus.ACTIVE) {
        return createErrorResult(
          'INVALID_SCHEDULE_STATUS',
          `Cannot execute a payment with status ${schedule.status}`,
          undefined
        );
      }
      
      const result = await this.executeScheduledPayment(schedule);
      
      return createSuccessResult(result);
    } catch (error: any) {
      this.logger.error(
        `Error executing scheduled payment ${id}: ${error.message}`,
        {
          stack: error.stack,
          errorDetails: error.toString()
        }
      );
      return createErrorResult(
        'EXECUTION_ERROR',
        'Failed to execute scheduled payment',
        error.message
      );
    }
  }
  
  /**
   * Get payments that require attention (failed or in retry state)
   */
  async getPaymentsRequiringAttention(): Promise<Result<{
    failedPayments: ScheduledPayment[],
    retryPayments: ScheduledPayment[]
  }>> {
    try {
      // Get all failed payments
      const failedPayments = await this.scheduledPaymentRepository.findByStatus(
        ScheduleStatus.FAILED
      );
      
      // Get active payments with non-zero failure count (in retry state)
      const activePayments = await this.scheduledPaymentRepository.findByStatus(
        ScheduleStatus.ACTIVE
      );
      
      const retryPayments = activePayments.filter(
        payment => (payment.failureCount || 0) > 0
      );
      
      return createSuccessResult({
        failedPayments,
        retryPayments
      });
    } catch (error: any) {
      this.logger.error(
        `Error getting payments requiring attention: ${error.message}`,
        {
          stack: error.stack,
          errorDetails: error.toString()
        }
      );
      return createErrorResult(
        'ATTENTION_FETCH_ERROR',
        'Failed to fetch payments requiring attention',
        error.message
      );
    }
  }
}
