// apps/backend/src/db/models/scheduled-payment.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ScheduleFrequency {
  ONCE = 'ONCE',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  BIWEEKLY = 'BIWEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  YEARLY = 'YEARLY'
}

export enum ScheduleStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

export enum ScheduleType {
  FIAT_DEPOSIT = 'FIAT_DEPOSIT',
  FIAT_WITHDRAWAL = 'FIAT_WITHDRAWAL',
  FIAT_TO_CRYPTO = 'FIAT_TO_CRYPTO',
  CRYPTO_TO_FIAT = 'CRYPTO_TO_FIAT'
}

@Entity('scheduled_payments')
export class ScheduledPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'userId', type: 'varchar', length: 100 })
  userId: string;

  @Column({ type: 'varchar', length: 50 })
  name: string;

  @Column({ type: 'enum', enum: ScheduleType })
  type: ScheduleType;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  amount: number;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({ type: 'enum', enum: ScheduleFrequency })
  frequency: ScheduleFrequency;

  @Column({ type: 'timestamptz' })
  nextExecutionDate: Date;

  @Column({ type: 'enum', enum: ScheduleStatus, default: ScheduleStatus.ACTIVE })
  status: ScheduleStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  @Column({ type: 'varchar', length: 100, nullable: true })
  processorName: string;

  @Column({ name: 'processorAccountId', type: 'varchar', length: 255, nullable: true })
  processorAccountId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  destinationId: string;

  @Column({ type: 'int', default: 0 })
  executionCount: number;

  @Column({ type: 'int', nullable: true })
  maxExecutions: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastExecutionDate: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endDate: Date;

  @Column({ type: 'int', default: 0 })
  failureCount: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lastFailureMessage: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastFailureDate: Date;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
