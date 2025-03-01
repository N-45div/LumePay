import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Wallet } from './wallet.entity';

@Entity('wallet_balances')
export class WalletBalance extends BaseEntity {
    @ManyToOne(() => Wallet)
    @JoinColumn({ name: 'wallet_id' })
    wallet: Wallet;

    @Column('decimal', { precision: 18, scale: 6 })
    amount: number;

    @Column()
    currency: string;

    @Column({ type: 'timestamp' })
    timestamp: Date;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;
}