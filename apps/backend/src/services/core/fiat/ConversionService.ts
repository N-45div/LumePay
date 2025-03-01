// apps/backend/src/services/core/fiat/ConversionService.ts

import { Injectable } from '@nestjs/common';
import { Logger } from '../../../utils/logger';
import { Result, createSuccess, createError } from '../../../utils/result';
import { RateService, ExchangeRate } from './RateService';
import { PaymentError } from '../payment/errors/PaymentErrors';
import { convertToPaymentError } from '../../../utils/error-utils';

export interface ConversionQuote {
    fromCurrency: string;
    toCurrency: string;
    fromAmount: number;
    toAmount: number;
    rate: ExchangeRate;
    expiresAt: Date;
    fee: number;
    totalWithFee: number;
}

export interface ConversionResult {
    id: string;
    quote: ConversionQuote;
    status: 'completed' | 'failed';
    txHash?: string;
    error?: string;
    timestamp: Date;
}

interface ConversionConfig {
    feePercentage: number;
    quoteValidityDuration: number; // in milliseconds
    minAmount: Record<string, number>;
    maxAmount: Record<string, number>;
}

@Injectable()
export class ConversionService {
    private logger: Logger;
    private config: ConversionConfig;

    constructor(
        private rateService: RateService
    ) {
        this.logger = new Logger('ConversionService');
        this.config = {
            feePercentage: 0.01, // 1%
            quoteValidityDuration: 30000, // 30 seconds
            minAmount: {
                'USD': 1,
                'USDC': 1,
                'SOL': 0.01
            },
            maxAmount: {
                'USD': 10000,
                'USDC': 10000,
                'SOL': 100
            }
        };
    }

    async getConversionQuote(
        fromCurrency: string,
        toCurrency: string,
        fromAmount: number
    ): Promise<Result<ConversionQuote, PaymentError>> {
        try {
            // Validate amounts
            this.validateAmount(fromCurrency, fromAmount);

            // Get exchange rate
            const rateResult = await this.rateService.getExchangeRate(
                fromCurrency,
                toCurrency
            );

            if (!rateResult.success) {
                throw rateResult.error;
            }

            const rate = rateResult.data;
            const toAmount = fromAmount * rate.rate;

            // Calculate fee
            const fee = toAmount * this.config.feePercentage;
            const totalWithFee = toAmount - fee;

            // Validate converted amount
            this.validateAmount(toCurrency, totalWithFee);

            const quote: ConversionQuote = {
                fromCurrency,
                toCurrency,
                fromAmount,
                toAmount,
                rate,
                expiresAt: new Date(Date.now() + this.config.quoteValidityDuration),
                fee,
                totalWithFee
            };

            return createSuccess(quote);
        } catch (error) {
            return createError(convertToPaymentError(error));
        }
    }

    async executeConversion(
        quote: ConversionQuote
    ): Promise<Result<ConversionResult, PaymentError>> {
        try {
            // Validate quote expiration
            if (new Date() > quote.expiresAt) {
                throw new PaymentError(
                    'Conversion quote has expired',
                    'QUOTE_EXPIRED'
                );
            }

            // Execute the conversion
            // TODO: Implement actual conversion logic with liquidity providers
            const conversionResult: ConversionResult = {
                id: this.generateConversionId(),
                quote,
                status: 'completed',
                txHash: `mock_tx_${Date.now()}`,
                timestamp: new Date()
            };

            this.logger.info('Conversion executed', { 
                id: conversionResult.id,
                from: `${quote.fromAmount} ${quote.fromCurrency}`,
                to: `${quote.totalWithFee} ${quote.toCurrency}`
            });

            return createSuccess(conversionResult);
        } catch (error) {
            return createError(convertToPaymentError(error));
        }
    }

    private validateAmount(
        currency: string,
        amount: number
    ): void {
        const min = this.config.minAmount[currency];
        const max = this.config.maxAmount[currency];

        if (amount < min) {
            throw new PaymentError(
                `Amount below minimum for ${currency}`,
                'AMOUNT_BELOW_MINIMUM',
                { min, currency }
            );
        }

        if (amount > max) {
            throw new PaymentError(
                `Amount above maximum for ${currency}`,
                'AMOUNT_ABOVE_MAXIMUM',
                { max, currency }
            );
        }
    }

    private generateConversionId(): string {
        return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}