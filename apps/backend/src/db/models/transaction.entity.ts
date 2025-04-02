import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Wallet } from './wallet.entity';
import { TransactionStatus } from '../../common/types/transaction.types';

export enum TransactionType {
    FIAT_PAYMENT = 'fiat_payment',
    CRYPTO_PAYMENT = 'crypto_payment',
    FIAT_TO_CRYPTO = 'fiat_to_crypto',
    CRYPTO_TO_FIAT = 'crypto_to_fiat',
    FIAT_TRANSFER = 'fiat_transfer'
}

@Entity('transactions')
export class Transaction extends BaseEntity {
    @Column({ name: 'user_id' })
    userId: string;

    @Column({ name: 'from_address', nullable: true })
    fromAddress: string;

    @Column({ name: 'to_address', nullable: true })
    toAddress: string;

    @Column('decimal', { precision: 18, scale: 6 })
    amount: number;

    @Column()
    currency: string;

    @Column({
        type: 'enum',
        enum: TransactionStatus,
        default: TransactionStatus.PENDING
    })
    status: TransactionStatus;

    @Column({
        type: 'enum',
        enum: TransactionType,
        default: TransactionType.CRYPTO_PAYMENT
    })
    type: TransactionType;

    @Column({ name: 'source_id', nullable: true })
    sourceId: string;

    @Column({ name: 'destination_id', nullable: true })
    destinationId: string;

    @Column({ name: 'processor_name', nullable: true })
    processorName: string;

    @Column({ name: 'processor_transaction_id', nullable: true })
    processorTransactionId: string;

    @Column({ type: 'timestamp', name: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    timestamp: Date;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;

    @Column({ type: 'jsonb', default: [] })
    statusHistory: Array<{
        status: TransactionStatus;
        timestamp: Date;
        reason?: string;
    }>;

    @Column({ nullable: true })
    network: 'solana' | 'traditional';

    @ManyToOne(() => Wallet, { nullable: true })
    @JoinColumn({ name: 'from_wallet_id' })
    fromWallet: Wallet;

    @ManyToOne(() => Wallet, { nullable: true })
    @JoinColumn({ name: 'to_wallet_id' })
    toWallet: Wallet;
}