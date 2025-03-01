export interface CreateTransactionParams {
    id?: string;
    fromAddress: string;
    toAddress: string;
    amount: number;
    currency: string;
    network: 'solana' | 'traditional';
    fromWalletId: string;
    toWalletId: string;
    metadata?: Record<string, any>;
}