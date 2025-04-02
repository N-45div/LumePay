// apps/backend/src/db/models/bank-account.entity.ts

import { Entity, Column } from 'typeorm';
import { BaseEntity } from './base.entity';

// Bank account types
export enum BankAccountType {
    CHECKING = 'checking',
    SAVINGS = 'savings',
    BUSINESS = 'business'
}

// Updated status enum to match our interface
export enum BankAccountStatus {
    PENDING_VERIFICATION = 'pending_verification',
    VERIFIED = 'verified',
    VERIFICATION_FAILED = 'verification_failed',
    DISABLED = 'disabled'
}

// Verification methods
export enum VerificationMethod {
    MICRO_DEPOSITS = 'micro_deposits',
    PLAID = 'plaid',
    INSTANT = 'instant',
    MANUAL = 'manual'
}

@Entity('bank_accounts')
export class BankAccount extends BaseEntity {
    @Column({ name: 'user_id' })
    userId: string;

    @Column({ name: 'name', nullable: true })
    name: string;

    @Column({
        name: 'account_type',
        type: 'enum',
        enum: BankAccountType,
        default: BankAccountType.CHECKING
    })
    accountType: BankAccountType;

    @Column({ name: 'account_number_last4' })
    accountNumberLast4: string;

    @Column({ name: 'routing_number' })
    routingNumber: string;

    @Column({ name: 'institution_name' })
    institutionName: string;

    @Column({
        type: 'enum',
        enum: BankAccountStatus,
        default: BankAccountStatus.PENDING_VERIFICATION
    })
    status: BankAccountStatus;

    @Column({
        name: 'verification_method',
        type: 'enum',
        enum: VerificationMethod,
        default: VerificationMethod.MICRO_DEPOSITS,
        nullable: true
    })
    verificationMethod: VerificationMethod;

    @Column({ name: 'processor_token', nullable: true })
    processorToken: string;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;
}