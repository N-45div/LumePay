// apps/backend/src/db/models/bank-account.entity.ts

import { Entity, Column } from 'typeorm';
import { BaseEntity } from './base.entity';

// Import the enum directly to avoid circular dependencies
export enum BankAccountStatus {
    PENDING = 'pending',
    ACTIVE = 'active',
    FAILED = 'failed',
    DISABLED = 'disabled'
}

@Entity('bank_accounts')
export class BankAccount extends BaseEntity {
    @Column({ name: 'user_id' })
    userId: string;

    @Column({
        type: 'enum',
        enum: BankAccountStatus,
        default: BankAccountStatus.PENDING
    })
    accountType: 'checking' | 'savings';

    @Column({ name: 'account_number' })
    accountNumber: string;

    @Column({ name: 'routing_number' })
    routingNumber: string;

    @Column({ name: 'bank_name' })
    bankName: string;

    @Column({ name: 'holder_name' })
    holderName: string;

    @Column({
        type: 'enum',
        enum: BankAccountStatus,
        default: BankAccountStatus.PENDING
    })
    status: BankAccountStatus;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;
}