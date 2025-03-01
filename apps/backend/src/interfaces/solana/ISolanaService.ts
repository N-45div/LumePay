// apps/backend/src/interfaces/solana/ISolanaService.ts

import { Result } from '../../utils/result';

export interface SwapQuote {
    id: string;
    fromAmount: number;
    toAmount: number;
    rate: number;
    expiresAt: Date;
}

export interface SwapResult {
    txHash: string;
    status: 'completed' | 'failed' | 'pending';
    inputAmount: number;
    outputAmount: number;
    fee: number;
    timestamp: Date;
}

export interface TransactionStatus {
    status: 'completed' | 'failed' | 'pending';
    confirmations?: number;
    error?: string;
}

export interface SwapRequest {
    fromAddress: string;
    toAddress: string;
    amount: number;
    currency: string;
}

export interface ISolanaService {
    // Swap operations
    getSwapQuote(
        fromCurrency: string,
        toCurrency: string,
        amount: number,
        slippage?: number
    ): Promise<Result<SwapQuote, Error>>;

    executeSwap(
        quoteId: string,
        walletAddress: string
    ): Promise<Result<SwapResult, Error>>;

    // Transaction status
    getTransactionStatus(
        txHash: string
    ): Promise<Result<TransactionStatus, Error>>;

    // Balance operations
    getBalance(
        address: string,
        currency: string
    ): Promise<Result<number, Error>>;
}