// apps/backend/src/db/entities/transaction.entity.ts

import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { TransactionStatus } from '../../common/types/transaction.types';

/**
 * Enum representing different transaction types
 */
export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  TRANSFER = 'transfer',
  EXCHANGE = 'exchange',
  PAYMENT = 'payment',
  REFUND = 'refund',
  FEE = 'fee',
  SCHEDULED = 'scheduled'
}

/**
 * Entity representing a financial transaction in the system
 */
@Entity('transactions')
export class Transaction {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 36 })
  @Index()
  userId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  fromAddress?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  toAddress?: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  amount: number;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  network?: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  fromWalletId?: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  toWalletId?: string;

  @Column({ 
    type: 'enum', 
    enum: TransactionType, 
    default: TransactionType.TRANSFER 
  })
  type: TransactionType;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sourceId?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  destinationId?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  processorName?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  processorTransactionId?: string;

  @Column({ 
    type: 'enum', 
    enum: TransactionStatus, 
    default: TransactionStatus.PENDING 
  })
  status: TransactionStatus;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'json', default: '[]' })
  statusHistory: Array<{
    status: TransactionStatus;
    timestamp: Date;
    reason?: string;
  }>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  completedAt?: Date;

  @Column({ nullable: true })
  failedAt?: Date;
}
