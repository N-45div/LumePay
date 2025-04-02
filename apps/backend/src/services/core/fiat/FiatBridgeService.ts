// apps/backend/src/services/core/fiat/FiatBridgeService.ts

import { Injectable, Inject } from '@nestjs/common';
import { Logger } from '../../../utils/logger';
import { Result, createSuccess, createError } from '../../../utils/result';
import { PaymentError } from '../payment/errors/PaymentErrors';
import { TransactionStatus } from '../../../types';
import { IRateService } from './interfaces/rate.interface';
import { PaymentProcessorRegistry } from './payment-processor-registry.service';
import { 
  IPaymentProcessor, 
  InitiatePaymentParams, 
  ProcessorTransactionDetails, 
  CheckPaymentStatusParams 
} from './interfaces/payment-processor.interface';
import { v4 as uuidv4 } from 'uuid';
import { 
  TransactionTrackingService, 
  TransactionType 
} from '../payment/transaction-tracking.service';

export interface ConversionQuote {
    id: string;
    fromCurrency: string;
    toCurrency: string;
    fromAmount: number;
    toAmount: number;
    exchangeRate: number;
    fee: number;
    totalWithFee: number;
    expiresAt: Date;
    path: string[];
}

export interface ConversionResult {
    id: string;
    quote: ConversionQuote;
    status: TransactionStatus;
    fromTxHash?: string;
    toTxHash?: string;
    error?: string;
    timestamp: Date;
}

export interface FiatPaymentRequest {
    userId: string; 
    amount: number;
    currency: string;
    sourceId: string;
    description?: string;
    metadata?: Record<string, any>;
    preferredProcessor?: string;
}

export interface BridgeConfig {
    feePercentage: number;
    quoteValidityDuration: number; 
    minAmount: Record<string, number>;
    maxAmount: Record<string, number>;
    supportedPairs: Array<{
        from: string;
        to: string;
        path: string[];
    }>;
}

@Injectable()
export class FiatBridgeService {
    private logger: Logger;
    private activeQuotes: Map<string, ConversionQuote> = new Map();
    private config: BridgeConfig;

    constructor(
        @Inject('RATE_SERVICE') private rateService: IRateService,
        private processorRegistry: PaymentProcessorRegistry,
        private transactionTrackingService: TransactionTrackingService
    ) {
        this.logger = new Logger('FiatBridgeService');
        
        this.config = {
            feePercentage: 0.01, 
            quoteValidityDuration: 30000, 
            minAmount: {
                'USD': 10,
                'USDC': 10
            },
            maxAmount: {
                'USD': 10000,
                'USDC': 10000
            },
            supportedPairs: [
                {
                    from: 'USD',
                    to: 'USDC',
                    path: ['USD', 'USDC']
                },
                {
                    from: 'USDC',
                    to: 'USD',
                    path: ['USDC', 'USD']
                }
            ]
        };
    }

    async getConversionQuote(
        fromCurrency: string,
        toCurrency: string,
        fromAmount: number
    ): Promise<Result<ConversionQuote, PaymentError>> {
        try {
            this.validateCurrencyPair(fromCurrency, toCurrency);
            this.validateAmount(fromCurrency, fromAmount);

            const path = await this.findConversionPath(fromCurrency, toCurrency);
            
            const conversionResult = await this.rateService.calculateConversionAmount(
                fromAmount,
                fromCurrency,
                toCurrency
            );

            if (!conversionResult.success) {
                throw conversionResult.error;
            }

            const { amount: finalAmount, rate } = conversionResult.data;
            const fee = finalAmount * this.config.feePercentage;
            const totalWithFee = finalAmount - fee;

            const quote: ConversionQuote = {
                id: this.generateQuoteId(),
                fromCurrency,
                toCurrency,
                fromAmount,
                toAmount: finalAmount,
                exchangeRate: rate.rate,
                fee,
                totalWithFee,
                expiresAt: new Date(Date.now() + this.config.quoteValidityDuration),
                path
            };

            this.activeQuotes.set(quote.id, quote);
            return createSuccess(quote);
        } catch (error) {
            if (error instanceof PaymentError) {
                return createError(error);
            }
            return createError(new PaymentError(
                error instanceof Error ? error.message : 'Unknown error occurred',
                'CONVERSION_QUOTE_ERROR'
            ));
        }
    }

    async executeConversion(
        quoteId: string,
        userId: string 
    ): Promise<Result<ConversionResult, PaymentError>> {
        try {
            const quote = this.activeQuotes.get(quoteId);
            if (!quote) {
                throw new PaymentError(
                    `Quote ${quoteId} not found`,
                    'QUOTE_NOT_FOUND'
                );
            }

            if (new Date() > quote.expiresAt) {
                throw new PaymentError(
                    'Quote has expired',
                    'QUOTE_EXPIRED'
                );
            }

            const conversionId = this.generateConversionId();
            
            const transactionResult = await this.transactionTrackingService.createTransaction({
                userId,
                amount: quote.fromAmount,
                currency: quote.fromCurrency,
                type: TransactionType.FIAT_TO_CRYPTO, 
                status: TransactionStatus.PENDING,
                metadata: {
                    quoteId,
                    targetCurrency: quote.toCurrency,
                    targetAmount: quote.toAmount,
                    exchangeRate: quote.exchangeRate,
                    fee: quote.fee
                }
            });

            if (!transactionResult.success) {
                throw transactionResult.error;
            }

            const result: ConversionResult = {
                id: conversionId,
                quote,
                status: TransactionStatus.PENDING,
                timestamp: new Date()
            };

            setTimeout(async () => {
                try {
                    const success = Math.random() < 0.95;
                    
                    if (success) {
                        await this.transactionTrackingService.updateTransactionStatus({
                            transactionId: transactionResult.data.id,
                            status: TransactionStatus.COMPLETED,
                            reason: 'Conversion completed successfully',
                            metadata: {
                                fromTxHash: `mock_from_tx_${Date.now()}`,
                                toTxHash: `mock_to_tx_${Date.now()}`
                            }
                        });
                    } else {
                        await this.transactionTrackingService.updateTransactionStatus({
                            transactionId: transactionResult.data.id,
                            status: TransactionStatus.FAILED,
                            reason: 'Conversion failed due to insufficient liquidity',
                            metadata: {
                                error: 'INSUFFICIENT_LIQUIDITY'
                            }
                        });
                    }
                } catch (error) {
                    this.logger.error(`Error updating conversion transaction: ${error}`);
                }
            }, 5000); 

            this.activeQuotes.delete(quoteId);

            return createSuccess(result);
        } catch (error) {
            if (error instanceof PaymentError) {
                return createError(error);
            }
            return createError(new PaymentError(
                error instanceof Error ? error.message : 'Unknown error occurred',
                'CONVERSION_EXECUTION_ERROR'
            ));
        }
    }

    async initiateFiatPayment(
        request: FiatPaymentRequest
    ): Promise<Result<ProcessorTransactionDetails, PaymentError>> {
        try {
            this.validateAmount(request.currency, request.amount);
            
            const processorResult = await this.processorRegistry.getBestProcessorForCurrency(
                request.currency,
                request.amount,
                request.preferredProcessor
            );
            
            if (!processorResult.success) {
                return createError(processorResult.error);
            }
            
            const processor = processorResult.data;
            this.logger.info(`Selected processor ${processor.processorName} for payment in ${request.currency}`);
            
            const transactionResult = await this.transactionTrackingService.createTransaction({
                userId: request.userId,
                amount: request.amount,
                currency: request.currency,
                type: TransactionType.FIAT_PAYMENT,
                status: TransactionStatus.PENDING,
                sourceId: request.sourceId,
                processorName: processor.processorName,
                metadata: {
                    ...request.metadata,
                    description: request.description
                }
            });

            if (!transactionResult.success) {
                return createError(transactionResult.error);
            }

            const transaction = transactionResult.data;
            
            const paymentParams: InitiatePaymentParams = {
                amount: request.amount,
                currency: request.currency,
                sourceId: request.sourceId,
                metadata: {
                    ...request.metadata,
                    description: request.description,
                    internalTransactionId: transaction.id
                },
                idempotencyKey: uuidv4()
            };
            
            const paymentResult = await processor.initiatePayment(paymentParams);
            
            if (!paymentResult.success) {
                await this.transactionTrackingService.updateTransactionStatus({
                    transactionId: transaction.id,
                    status: TransactionStatus.FAILED,
                    reason: paymentResult.error.message,
                    metadata: {
                        errorCode: paymentResult.error.code
                    }
                });
                
                return createError(paymentResult.error);
            }
            
            const paymentDetails = paymentResult.data;
            
            await this.transactionTrackingService.updateTransactionStatus({
                transactionId: transaction.id,
                status: TransactionStatus.PENDING, 
                reason: 'Payment initiated with processor',
                metadata: {
                    processorTransactionId: paymentDetails.id,
                    processorMetadata: paymentDetails.metadata
                }
            });
            
            return createSuccess(paymentDetails);
        } catch (error) {
            if (error instanceof PaymentError) {
                return createError(error);
            }
            return createError(new PaymentError(
                error instanceof Error ? error.message : 'Unknown error occurred',
                'FIAT_PAYMENT_INITIATION_ERROR'
            ));
        }
    }
    
    async checkFiatPaymentStatus(
        paymentId: string,
        processorName: string
    ): Promise<Result<ProcessorTransactionDetails, PaymentError>> {
        try {
            const processorResult = this.processorRegistry.getProcessor(processorName);
            
            if (!processorResult.success) {
                return createError(processorResult.error);
            }
            
            const processor = processorResult.data;
            
            const statusResult = await processor.checkPaymentStatus({ paymentId });
            
            if (!statusResult.success) {
                return createError(statusResult.error);
            }

            try {
                const transactionResult = await this.transactionTrackingService.getTransactionByProcessorId(
                    processorName,
                    paymentId
                );
                
                if (transactionResult.success) {
                    const transaction = transactionResult.data;
                    const paymentStatus = statusResult.data;
                    
                    if (paymentStatus.status === 'completed' && transaction.status !== TransactionStatus.COMPLETED) {
                        await this.transactionTrackingService.updateTransactionStatus({
                            transactionId: transaction.id,
                            status: TransactionStatus.COMPLETED,
                            reason: 'Payment completed at processor',
                            metadata: {
                                processorDetails: paymentStatus
                            }
                        });
                    } else if (paymentStatus.status === 'failed' && transaction.status !== TransactionStatus.FAILED) {
                        await this.transactionTrackingService.updateTransactionStatus({
                            transactionId: transaction.id,
                            status: TransactionStatus.FAILED,
                            reason: paymentStatus.errorMessage || 'Payment failed at processor',
                            metadata: {
                                processorDetails: paymentStatus
                            }
                        });
                    }
                }
            } catch (error) {
                this.logger.error(`Error updating transaction status: ${error}`);
            }
            
            return createSuccess(statusResult.data);
        } catch (error) {
            if (error instanceof PaymentError) {
                return createError(error);
            }
            return createError(new PaymentError(
                error instanceof Error ? error.message : 'Unknown error occurred',
                'FIAT_PAYMENT_STATUS_CHECK_ERROR'
            ));
        }
    }
    
    async cancelFiatPayment(
        paymentId: string,
        processorName: string
    ): Promise<Result<boolean, PaymentError>> {
        try {
            const processorResult = this.processorRegistry.getProcessor(processorName);
            
            if (!processorResult.success) {
                return createError(processorResult.error);
            }
            
            const processor = processorResult.data;
            
            if (!processor.cancelPayment) {
                return createError(new PaymentError(
                    `Processor ${processorName} does not support payment cancellation`,
                    'CANCELLATION_NOT_SUPPORTED'
                ));
            }
            
            const cancelResult = await processor.cancelPayment(paymentId);
            
            if (!cancelResult.success) {
                return createError(cancelResult.error);
            }

            try {
                const transactionResult = await this.transactionTrackingService.getTransactionByProcessorId(
                    processorName,
                    paymentId
                );
                
                if (transactionResult.success) {
                    await this.transactionTrackingService.updateTransactionStatus({
                        transactionId: transactionResult.data.id,
                        status: TransactionStatus.CANCELLED,
                        reason: 'Payment cancelled by user',
                        metadata: {
                            cancelledAt: new Date().toISOString()
                        }
                    });
                }
            } catch (error) {
                this.logger.error(`Error updating transaction status after cancellation: ${error}`);
            }
            
            return createSuccess(cancelResult.data);
        } catch (error) {
            if (error instanceof PaymentError) {
                return createError(error);
            }
            return createError(new PaymentError(
                error instanceof Error ? error.message : 'Unknown error occurred',
                'FIAT_PAYMENT_CANCELLATION_ERROR'
            ));
        }
    }
    
    getAvailableProcessors(): string[] {
        return this.processorRegistry.getAllProcessors().map(p => p.processorName);
    }

    private validateCurrencyPair(fromCurrency: string, toCurrency: string): void {
        const pair = this.config.supportedPairs.find(
            p => p.from === fromCurrency && p.to === toCurrency
        );

        if (!pair) {
            throw new PaymentError(
                `Unsupported currency pair: ${fromCurrency}/${toCurrency}`,
                'UNSUPPORTED_PAIR'
            );
        }
    }

    private validateAmount(currency: string, amount: number): void {
        const min = this.config.minAmount[currency];
        const max = this.config.maxAmount[currency];

        if (min !== undefined && amount < min) {
            throw new PaymentError(
                `Amount below minimum for ${currency}: ${min}`,
                'AMOUNT_BELOW_MINIMUM'
            );
        }

        if (max !== undefined && amount > max) {
            throw new PaymentError(
                `Amount above maximum for ${currency}: ${max}`,
                'AMOUNT_ABOVE_MAXIMUM'
            );
        }
    }

    private async findConversionPath(fromCurrency: string, toCurrency: string): Promise<string[]> {
        const pair = this.config.supportedPairs.find(
            p => p.from === fromCurrency && p.to === toCurrency
        );

        if (pair) {
            return pair.path;
        }

        throw new PaymentError(
            `No conversion path found for ${fromCurrency} to ${toCurrency}`,
            'NO_CONVERSION_PATH'
        );
    }

    private generateQuoteId(): string {
        return `quote_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    private generateConversionId(): string {
        return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
}