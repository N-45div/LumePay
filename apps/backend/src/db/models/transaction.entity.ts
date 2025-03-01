import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Wallet } from './wallet.entity';
import { TransactionStatus } from '../../types';

@Entity('transactions')
export class Transaction extends BaseEntity {
    @Column({ name: 'from_address' })
    fromAddress: string;

    @Column({ name: 'to_address' })
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

    @Column({ type: 'timestamp', name: 'timestamp' })
    timestamp: Date;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;

    @Column()
    network: 'solana' | 'traditional';

    @ManyToOne(() => Wallet)
    @JoinColumn({ name: 'from_wallet_id' })
    fromWallet: Wallet;

    @ManyToOne(() => Wallet)
    @JoinColumn({ name: 'to_wallet_id' })
    toWallet: Wallet;
}