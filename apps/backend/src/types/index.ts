// Types for core payment functionality
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

export enum TransactionStatus {
    PENDING = 'pending',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    FAILED = 'failed',
    UNKNOWN = 'unknown'
}

// Types for user management
export interface User {
    id: string;
    email: string;
    walletAddress?: string;
    createdAt: Date;
    updatedAt: Date;
}
