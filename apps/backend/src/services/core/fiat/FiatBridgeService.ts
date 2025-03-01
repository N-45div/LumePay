// apps/backend/src/services/core/fiat/FiatBridgeService.ts

import { Injectable } from '@nestjs/common';
import { Logger } from '../../../utils/logger';
import { Result, createSuccess, createError } from '../../../utils/result';
import { PaymentError } from '../payment/errors/PaymentErrors';
import { TransactionStatus } from '../../../types';
import { IRateService } from './interfaces/rate.interface';

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

export interface BridgeConfig {
    feePercentage: number;
    quoteValidityDuration: number; // in milliseconds
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

    constructor(private rateService: IRateService) {
        this.logger = new Logger('FiatBridgeService');
        
        this.config = {
            feePercentage: 0.01, // 1%
            quoteValidityDuration: 30000, // 30 seconds
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
        quoteId: string
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

            // Execute the conversion
            const result: ConversionResult = {
                id: this.generateConversionId(),
                quote,
                status: TransactionStatus.COMPLETED,
                fromTxHash: `mock_from_tx_${Date.now()}`,
                toTxHash: `mock_to_tx_${Date.now()}`,
                timestamp: new Date()
            };

            // Remove quote after execution
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

        if (amount < min) {
            throw new PaymentError(
                `Amount below minimum for ${currency}: ${min}`,
                'AMOUNT_BELOW_MINIMUM'
            );
        }

        if (amount > max) {
            throw new PaymentError(
                `Amount above maximum for ${currency}: ${max}`,
                'AMOUNT_ABOVE_MAXIMUM'
            );
        }
    }

    private async findConversionPath(
        fromCurrency: string,
        toCurrency: string
    ): Promise<string[]> {
        const pair = this.config.supportedPairs.find(
            p => p.from === fromCurrency && p.to === toCurrency
        );

        if (!pair) {
            throw new PaymentError(
                `No conversion path found for ${fromCurrency} to ${toCurrency}`,
                'PATH_NOT_FOUND'
            );
        }

        return pair.path;
    }

    private generateQuoteId(): string {
        return `quote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateConversionId(): string {
        return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}