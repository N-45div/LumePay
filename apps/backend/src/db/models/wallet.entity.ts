import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Transaction } from './transaction.entity';

@Entity('wallets')
export class Wallet extends BaseEntity {
    @Column({ unique: true })
    address!: string;

    @Column({ nullable: true, type: 'varchar' })
    userId: string | null;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;

    @Column({ default: true })
    isActive: boolean;

    @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
    balance: number;

    @Column()
    network: 'solana' | 'traditional';

    @OneToMany(() => Transaction, transaction => transaction.fromWallet)
    sentTransactions: Transaction[];

    @OneToMany(() => Transaction, transaction => transaction.toWallet)
    receivedTransactions: Transaction[];
}