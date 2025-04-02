import { Injectable } from '@nestjs/common';
import { Logger } from '../../../utils/logger';
import { Transaction } from '../../../db/models/transaction.entity';
import { TransactionStatus } from '../../../common/types/transaction.types';
import { TransactionType } from '../../../db/models/transaction.entity';
import { PaymentRequest, PaymentResponse, IPaymentProcessor } from './interfaces/payment.interface';
import { 
    PaymentError, 
    InsufficientFundsError,
    InvalidAddressError
} from './errors/PaymentErrors';
import { 
    Result, 
    createSuccess, 
    createError 
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

    /**
     * Process a payment request
     * @param request Payment request details
     * @returns Payment response or error
     */
    async processPayment(request: PaymentRequest): Promise<Result<PaymentResponse, PaymentError>> {
        this.logger.info(`Processing payment of ${request.amount} ${request.currency} from ${request.fromAddress} to ${request.toAddress}`);
        
        let transaction: Transaction | null = null;
        
        try {
            // Validate the request
            const validationResult = await this.validateRequest(request);
            if (!validationResult.success) {
                return validationResult;
            }
            
            // Get the network type (solana or traditional)
            const network = this.determinePaymentNetwork(request.currency);
            
            // Get wallet information
            const fromWallet = await this.walletRepository.findByAddress(request.fromAddress);
            const toWallet = await this.walletRepository.findByAddress(request.toAddress);
            
            if (!fromWallet || !toWallet) {
                return createError(new InvalidAddressError('Invalid wallet address'));
            }
            
            // Create transaction record
            transaction = await this.transactionRepository.createTransaction({
                userId: request.userId || 'system', // Use provided userId or default to system
                fromAddress: request.fromAddress,
                toAddress: request.toAddress,
                amount: request.amount,
                currency: request.currency,
                network: network,
                fromWalletId: fromWallet.id,
                toWalletId: toWallet.id,
                type: TransactionType.CRYPTO_PAYMENT, // Default to crypto payment type
                status: TransactionStatus.PENDING,
                metadata: request.metadata || {}
            });
    
            if (!transaction) {
                return createError(new PaymentError('TRANSACTION_CREATION_FAILED', 'Failed to create transaction record'));
            }
            
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
                this.logger.error(`Payment error: ${error.message}`);
                
                // Update transaction status if it was created
                if (transaction) {
                    await this.transactionRepository.updateTransactionStatus(
                        transaction.id,
                        TransactionStatus.FAILED,
                        {
                            failureReason: error.code,
                            errorDetails: error.message
                        }
                    );
                }
                
                return createError(error);
            }
            
            this.logger.error(`Unhandled payment error: ${error instanceof Error ? error.message : String(error)}`);
            
            // Update transaction status if it was created
            if (transaction) {
                await this.transactionRepository.updateTransactionStatus(
                    transaction.id,
                    TransactionStatus.FAILED,
                    {
                        failureReason: 'PAYMENT_FAILED',
                        errorDetails: error instanceof Error ? error.message : String(error)
                    }
                );
            }
            
            return createError(new PaymentError('PAYMENT_FAILED', error instanceof Error ? error.message : 'Unknown error'));
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

    private async validateRequest(request: PaymentRequest): Promise<Result<boolean, PaymentError>> {
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
                return createError(error);
            }

            // Handle other errors
            if (error instanceof Error) {
                if (error.message.includes('invalid address')) {
                    return createError(new InvalidAddressError('Invalid address provided', {
                        originalError: error.message
                    }));
                }
                
                return createError(new PaymentError(
                    error.message,
                    'VALIDATION_ERROR',
                    { originalError: error }
                ));
            }

            return createError(new PaymentError(
                'An unknown error occurred during validation',
                'UNKNOWN_ERROR',
                { originalError: error }
            ));
        }

        return createSuccess(true);
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