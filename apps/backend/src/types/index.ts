// Types for core payment functionality
import { TransactionStatus } from '../common/types/transaction.types';

export { TransactionStatus };

export interface Transaction {
    id: string;
    fromAddress: string;
    toAddress: string;
    amount: number;
    currency: string;
    status: TransactionStatus;
    timestamp: Date;
    network: 'solana' | 'traditional';
    metadata?: Record<string, any>;
}

// Types for user management
export interface User {
    id: string;
    email: string;
    walletAddress?: string;
    createdAt: Date;
    updatedAt: Date;
}
