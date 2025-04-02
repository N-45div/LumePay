// apps/backend/src/db/repositories/scheduled-payment.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, FindOptionsWhere, Between } from 'typeorm';
import { ScheduledPayment, ScheduleStatus, ScheduleType } from '../models/scheduled-payment.entity';
import { Logger } from '../../utils/logger';

@Injectable()
export class ScheduledPaymentRepository {
  constructor(
    @InjectRepository(ScheduledPayment)
    private readonly repository: Repository<ScheduledPayment>,
    private readonly logger: Logger
  ) {}

  /**
   * Create a new scheduled payment
   */
  async create(data: Partial<ScheduledPayment>): Promise<ScheduledPayment> {
    try {
      const scheduledPayment = this.repository.create(data);
      return await this.repository.save(scheduledPayment);
    } catch (error: any) {
      this.logger.error(`Error creating scheduled payment: ${error.message}`, {
        error: error.toString(),
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Find a scheduled payment by ID
   */
  async findById(id: string): Promise<ScheduledPayment | null> {
    try {
      return await this.repository.findOne({ where: { id } });
    } catch (error: any) {
      this.logger.error(`Error finding scheduled payment by ID ${id}: ${error.message}`, {
        error: error.toString(),
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Update a scheduled payment
   */
  async update(id: string, data: Partial<ScheduledPayment>): Promise<ScheduledPayment> {
    try {
      await this.repository.update(id, data);
      const updated = await this.findById(id);
      if (!updated) {
        throw new Error(`Scheduled payment with ID ${id} not found after update`);
      }
      return updated;
    } catch (error: any) {
      this.logger.error(`Error updating scheduled payment ${id}: ${error.message}`, {
        error: error.toString(),
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Delete a scheduled payment
   */
  async remove(scheduledPayment: ScheduledPayment): Promise<void> {
    try {
      await this.repository.remove(scheduledPayment);
    } catch (error: any) {
      this.logger.error(`Error removing scheduled payment ${scheduledPayment.id}: ${error.message}`, {
        error: error.toString(),
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Find scheduled payments by user ID
   */
  async findByUserId(userId: string): Promise<ScheduledPayment[]> {
    try {
      return await this.repository.find({
        where: { userId },
        order: { nextExecutionDate: 'ASC' }
      });
    } catch (error: any) {
      this.logger.error(`Error finding scheduled payments for user ${userId}: ${error.message}`, {
        error: error.toString(),
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Find active scheduled payments due for execution
   */
  async findDuePayments(date: Date = new Date()): Promise<ScheduledPayment[]> {
    try {
      return await this.repository.find({
        where: {
          status: ScheduleStatus.ACTIVE,
          nextExecutionDate: LessThanOrEqual(date)
        },
        order: { nextExecutionDate: 'ASC' }
      });
    } catch (error: any) {
      this.logger.error(`Error finding due scheduled payments: ${error.message}`, {
        error: error.toString(),
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Find scheduled payments by type and status
   */
  async findByTypeAndStatus(
    type: ScheduleType,
    status: ScheduleStatus
  ): Promise<ScheduledPayment[]> {
    try {
      return await this.repository.find({
        where: { type, status },
        order: { nextExecutionDate: 'ASC' }
      });
    } catch (error: any) {
      this.logger.error(`Error finding scheduled payments by type ${type} and status ${status}: ${error.message}`, {
        error: error.toString(),
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Find scheduled payments for a specific processor
   */
  async findByProcessor(processorName: string): Promise<ScheduledPayment[]> {
    try {
      return await this.repository.find({
        where: { processorName, status: ScheduleStatus.ACTIVE },
        order: { nextExecutionDate: 'ASC' }
      });
    } catch (error: any) {
      this.logger.error(`Error finding scheduled payments for processor ${processorName}: ${error.message}`, {
        error: error.toString(),
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Advanced search for scheduled payments
   */
  async search(params: {
    userId?: string;
    type?: ScheduleType;
    status?: ScheduleStatus;
    processorName?: string;
    startDate?: Date;
    endDate?: Date;
    minAmount?: number;
    maxAmount?: number;
  }): Promise<ScheduledPayment[]> {
    try {
      const where: FindOptionsWhere<ScheduledPayment> = {};
      
      if (params.userId) where.userId = params.userId;
      if (params.type) where.type = params.type;
      if (params.status) where.status = params.status;
      if (params.processorName) where.processorName = params.processorName;
      
      if (params.startDate && params.endDate) {
        where.nextExecutionDate = Between(params.startDate, params.endDate);
      } else if (params.startDate) {
        where.nextExecutionDate = MoreThanOrEqual(params.startDate);
      } else if (params.endDate) {
        where.nextExecutionDate = LessThanOrEqual(params.endDate);
      }
      
      // Amount filtering needs to be done in JS due to TypeORM limitations with decimal columns
      let results = await this.repository.find({
        where,
        order: { nextExecutionDate: 'ASC' }
      });
      
      if (params.minAmount !== undefined) {
        results = results.filter(payment => Number(payment.amount) >= params.minAmount!);
      }
      
      if (params.maxAmount !== undefined) {
        results = results.filter(payment => Number(payment.amount) <= params.maxAmount!);
      }
      
      return results;
    } catch (error: any) {
      this.logger.error(`Error searching scheduled payments: ${error.message}`, {
        error: error.toString(),
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Update the next execution date for a scheduled payment
   */
  async updateNextExecutionDate(id: string, nextDate: Date): Promise<ScheduledPayment> {
    try {
      await this.repository.update(id, {
        nextExecutionDate: nextDate,
        lastExecutionDate: new Date()
      });
      const updated = await this.findById(id);
      if (!updated) {
        throw new Error(`Scheduled payment with ID ${id} not found after updating next execution date`);
      }
      return updated;
    } catch (error: any) {
      this.logger.error(`Error updating next execution date for payment ${id}: ${error.message}`, {
        error: error.toString(),
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Increment execution count and update related fields
   */
  async incrementExecutionCount(id: string): Promise<ScheduledPayment> {
    try {
      const payment = await this.findById(id);
      
      if (!payment) {
        throw new Error(`Scheduled payment ${id} not found`);
      }
      
      payment.executionCount += 1;
      payment.lastExecutionDate = new Date();
      
      // If max executions reached, mark as completed
      if (payment.maxExecutions && payment.executionCount >= payment.maxExecutions) {
        payment.status = ScheduleStatus.COMPLETED;
      }
      
      return await this.repository.save(payment);
    } catch (error: any) {
      this.logger.error(`Error incrementing execution count for payment ${id}: ${error.message}`, {
        error: error.toString(),
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Find scheduled payments that are due for processing
   */
  async findDue(): Promise<ScheduledPayment[]> {
    try {
      const now = new Date();
      return await this.repository.find({
        where: {
          status: ScheduleStatus.ACTIVE,
          nextExecutionDate: LessThanOrEqual(now)
        },
        order: {
          nextExecutionDate: 'ASC'
        }
      });
    } catch (error: any) {
      this.logger.error(`Error finding due scheduled payments: ${error.message}`, {
        error: error.toString(),
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Find all scheduled payments (with optional limit)
   */
  async findAll(limit?: number): Promise<ScheduledPayment[]> {
    try {
      const query = this.repository.createQueryBuilder('scheduledPayment');
      
      if (limit) {
        query.take(limit);
      }
      
      query.orderBy('scheduledPayment.createdAt', 'DESC');
      
      return await query.getMany();
    } catch (error: any) {
      this.logger.error(`Error finding all scheduled payments: ${error.message}`, {
        error: error.toString(),
        stack: error.stack
      });
      throw error;
    }
  }
  
  /**
   * Find scheduled payments by status
   */
  async findByStatus(status: ScheduleStatus): Promise<ScheduledPayment[]> {
    try {
      return await this.repository.find({
        where: { status },
        order: {
          createdAt: 'DESC'
        }
      });
    } catch (error: any) {
      this.logger.error(`Error finding scheduled payments by status ${status}: ${error.message}`, {
        error: error.toString(),
        stack: error.stack
      });
      throw error;
    }
  }
}
