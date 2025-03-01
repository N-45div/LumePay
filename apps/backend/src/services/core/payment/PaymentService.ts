import { Injectable } from '@nestjs/common';
import { Logger } from '../../../utils/logger';
import { Transaction, TransactionStatus } from '../../../types';
import { PaymentRequest, PaymentResponse, IPaymentProcessor } from './interfaces/payment.interface';
import { 
    PaymentError, 
    InsufficientFundsError,
    InvalidAddressError
} from './errors/PaymentErrors';
import { 
    Result, 
    createSuccess, 
    createError,
    mapSolanaResult 
} from '../../../utils/result';
import { 
    ISolanaService,
    SwapResult,
    SwapQuote,
    TransactionStatus as SolanaTransactionStatus
} from '../../../interfaces/solana/ISolanaService';
import { TransactionRepository } from '../../../db/repositories/transaction.repository';
import { WalletRepository } from '../../../db/repositories/wallet.repository';
import { WalletBalanceRepository } from '../../../db/repositories/wallet-balance.repository';

@Injectable()
export class PaymentService implements IPaymentProcessor {
    private logger: Logger;

    constructor(
        private transactionRepository: TransactionRepository,
        private walletRepository: WalletRepository,
        private walletBalanceRepository: WalletBalanceRepository,
        private solanaService: ISolanaService
    ) {
        this.logger = new Logger('PaymentService');
    }

    async processPayment(request: PaymentRequest): Promise<Result<PaymentResponse, PaymentError>> {
        let transaction: Transaction | undefined;
        
        try {
            // Validate the request
            await this.validateRequest(request);
            const network = this.determinePaymentNetwork(request.currency);
    
            // Get or create wallets
            const [fromWallet, toWallet] = await Promise.all([
                this.ensureWallet(request.fromAddress, network),
                this.ensureWallet(request.toAddress, network)
            ]);
    
            // Create initial transaction record
            transaction = await this.transactionRepository.createTransaction({
                fromAddress: request.fromAddress,
                toAddress: request.toAddress,
                amount: request.amount,
                currency: request.currency,
                network: network,
                fromWalletId: fromWallet.id,
                toWalletId: toWallet.id,
                status: TransactionStatus.PENDING,
                metadata: {}
            });
    
            if (network === 'solana') {
                const swapResult = await this.handleSolanaPayment(transaction);
                if (!swapResult.success) {
                    throw swapResult.error;
                }
            }
    
            const response: PaymentResponse = {
                transactionId: transaction.id,
                status: transaction.status,
                timestamp: new Date(),
                details: {
                    from: transaction.fromAddress,
                    to: transaction.toAddress,
                    amount: transaction.amount,
                    currency: transaction.currency
                }
            };
    
            return createSuccess(response);
        } catch (error) {
            if (error instanceof PaymentError) {
                if (transaction?.id) {
                    await this.transactionRepository.updateTransactionStatus(
                        transaction.id,
                        TransactionStatus.FAILED,
                        {
                            failureReason: error.code,
                            errorDetails: error.details
                        }
                    );
                }
                return createError(error);
            }
    
            return createError(new PaymentError(
                error instanceof Error ? error.message : 'Unknown error occurred',
                'PAYMENT_PROCESSING_ERROR'
            ));
        }
    }

    private async handleSolanaPayment(transaction: Transaction): Promise<Result<SwapResult, PaymentError>> {
        try {
            // Get swap quote
            const quoteResult = await this.solanaService.getSwapQuote(
                transaction.currency,
                transaction.currency, // Target currency (same for direct transfers)
                transaction.amount
            );

            if (!quoteResult.success) {
                throw quoteResult.error;
            }

            // Execute the swap
            const swapResult = await this.solanaService.executeSwap(
                quoteResult.data.id,
                transaction.fromAddress
            );

            if (!swapResult.success) {
                throw swapResult.error;
            }

            // Update transaction status
            await this.transactionRepository.updateTransactionStatus(
                transaction.id,
                this.mapSolanaStatus(swapResult.data.status),
                {
                    swapDetails: swapResult.data,
                    quoteId: quoteResult.data.id,
                    processedAt: new Date()
                }
            );

            return swapResult;
        } catch (error) {
            if (error instanceof PaymentError) {
                throw error;
            }
            throw new PaymentError(
                error instanceof Error ? error.message : 'Solana payment failed',
                'SOLANA_PAYMENT_ERROR',
                { originalError: error }
            );
        }
    }

    async validateTransaction(transactionId: string): Promise<boolean> {
        try {
            const transaction = await this.transactionRepository.findById(transactionId);
            if (!transaction) {
                return false;
            }

            if (transaction.network === 'solana') {
                const result = await this.solanaService.getTransactionStatus(transactionId);
                return result.success && result.data.status !== 'failed';
            }

            return true;
        } catch (error) {
            this.logger.error('Transaction validation failed', { transactionId, error });
            return false;
        }
    }

    async getTransactionStatus(transactionId: string): Promise<string> {
        try {
            const transaction = await this.transactionRepository.findById(transactionId);
            if (!transaction) {
                throw new PaymentError(
                    'Transaction not found',
                    'TRANSACTION_NOT_FOUND',
                    { transactionId }
                );
            }

            if (transaction.network === 'solana') {
                const result = await this.solanaService.getTransactionStatus(transactionId);
                if (result.success) {
                    return this.mapSolanaStatus(result.data.status);
                }
                throw result.error;
            }

            return transaction.status;
        } catch (error) {
            this.logger.error('Failed to get transaction status', { transactionId, error });
            throw error;
        }
    }

    private async validateRequest(request: PaymentRequest): Promise<void> {
        try {
            // Basic validation
            if (!request.fromAddress || !request.toAddress) {
                throw new InvalidAddressError('Missing address information');
            }

            const network = this.determinePaymentNetwork(request.currency);
            if (network === 'solana') {
                // Check if addresses are valid through transaction validation
                const fromBalanceResult = await this.solanaService.getBalance(
                    request.fromAddress,
                    request.currency
                );

                if (!fromBalanceResult.success) {
                    throw new InvalidAddressError('Invalid source address', {
                        address: request.fromAddress,
                        error: fromBalanceResult.error
                    });
                }

                const toBalanceResult = await this.solanaService.getBalance(
                    request.toAddress,
                    request.currency
                );

                if (!toBalanceResult.success) {
                    throw new InvalidAddressError('Invalid destination address', {
                        address: request.toAddress,
                        error: toBalanceResult.error
                    });
                }

                // Check sufficient balance
                if (fromBalanceResult.data < request.amount) {
                    throw new InsufficientFundsError(undefined, { 
                        available: fromBalanceResult.data, 
                        required: request.amount 
                    });
                }
            }
        } catch (error) {
            // Pass through our custom errors
            if (error instanceof PaymentError) {
                throw error;
            }

            // Handle other errors
            if (error instanceof Error) {
                if (error.message.includes('invalid address')) {
                    throw new InvalidAddressError('Invalid address provided', {
                        originalError: error.message
                    });
                }
                
                throw new PaymentError(
                    error.message,
                    'VALIDATION_ERROR',
                    { originalError: error }
                );
            }

            throw new PaymentError(
                'An unknown error occurred during validation',
                'UNKNOWN_ERROR',
                { originalError: error }
            );
        }
    }

    private async ensureWallet(address: string, network: 'solana' | 'traditional') {
        const existing = await this.walletRepository.findByAddress(address);
        if (existing) {
            return existing;
        }
        return this.walletRepository.createWallet(address, undefined, network);
    }

    private determinePaymentNetwork(currency: string): 'solana' | 'traditional' {
        return currency.toLowerCase() === 'sol' || currency.toLowerCase() === 'usdc' 
            ? 'solana' 
            : 'traditional';
    }

    private async processTraditionalTransaction(transaction: Transaction): Promise<void> {
        // Implementation for traditional payment processing
        this.logger.info('Processing traditional transaction', { transaction });
    }

    private generateTransactionId(): string {
        return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private mapSolanaStatus(status: 'completed' | 'failed' | 'pending'): TransactionStatus {
        switch (status) {
            case 'completed':
                return TransactionStatus.COMPLETED;
            case 'failed':
                return TransactionStatus.FAILED;
            case 'pending':
                return TransactionStatus.PENDING;
            default:
                return TransactionStatus.UNKNOWN;
        }
    }
}