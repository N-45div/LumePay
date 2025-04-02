// apps/backend/src/db/interfaces/transaction.interfaces.ts
import { TransactionStatus } from '../../common/types/transaction.types';
import { TransactionType } from '../models/transaction.entity';

export interface CreateTransactionParams {
    id?: string;
    userId: string;
    fromAddress?: string;
    toAddress?: string;
    amount: number;
    currency: string;
    network?: 'solana' | 'traditional';
    fromWalletId?: string;
    toWalletId?: string;
    type: TransactionType;
    sourceId?: string;
    destinationId?: string;
    processorName?: string;
    processorTransactionId?: string;
    metadata?: Record<string, any>;
    status?: TransactionStatus;
}

export interface TransactionStatusHistoryItem {
    status: TransactionStatus;
    timestamp: Date;
    reason?: string;
}