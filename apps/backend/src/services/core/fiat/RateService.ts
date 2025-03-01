// apps/backend/src/services/core/fiat/RateService.ts

import { Injectable } from '@nestjs/common';
import { Logger } from '../../../utils/logger';
import { Result, createSuccess, createError } from '../../../utils/result';
import { PaymentError } from '../payment/errors/PaymentErrors';
import { IRateService } from './interfaces/rate.interface';

export interface ExchangeRate {
    fromCurrency: string;
    toCurrency: string;
    rate: number;
    timestamp: Date;
    source: string;
    confidence?: number;
}

export interface RateServiceConfig {
    updateInterval: number;
    stalePriceThreshold: number;
    priceDeviationThreshold: number;
    supportedPairs: Array<{
        fromCurrency: string;
        toCurrency: string;
    }>;
}

@Injectable()
export class RateService implements IRateService {
    private rates: Map<string, ExchangeRate> = new Map();
    private logger: Logger;
    private config: RateServiceConfig;
    private updateInterval: NodeJS.Timeout | null = null;

    constructor(config?: Partial<RateServiceConfig>) {
        this.logger = new Logger('RateService');
        this.config = {
            updateInterval: config?.updateInterval || 60000,
            stalePriceThreshold: config?.stalePriceThreshold || 300000,
            priceDeviationThreshold: config?.priceDeviationThreshold || 0.05,
            supportedPairs: config?.supportedPairs || [
                { 
                    fromCurrency: 'USD', 
                    toCurrency: 'USDC'
                },
                { 
                    fromCurrency: 'USDC', 
                    toCurrency: 'USD' 
                }
            ]
        };
    }

    async start(): Promise<void> {
        if (this.updateInterval) {
            return;
        }

        await this.updateRates();
        this.updateInterval = setInterval(
            async () => {
                await this.updateRates();
            },
            this.config.updateInterval
        );

        this.logger.info('Rate service started');
    }

    async stop(): Promise<void> {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        this.logger.info('Rate service stopped');
    }

    async getExchangeRate(
        fromCurrency: string,
        toCurrency: string
    ): Promise<Result<ExchangeRate, PaymentError>> {
        try {
            const rateKey = this.getRateKey(fromCurrency, toCurrency);
            const rate = this.rates.get(rateKey);

            if (!rate) {
                throw new PaymentError(
                    `Exchange rate not found for ${fromCurrency}/${toCurrency}`,
                    'RATE_NOT_FOUND'
                );
            }

            const now = new Date();
            const staleThreshold = now.getTime() - this.config.stalePriceThreshold;

            if (rate.timestamp.getTime() < staleThreshold) {
                this.logger.warn('Using stale exchange rate', { 
                    pair: rateKey,
                    timestamp: rate.timestamp
                });
            }

            return createSuccess(rate);
        } catch (error) {
            if (error instanceof PaymentError) {
                return createError(error);
            }
            return createError(new PaymentError(
                error instanceof Error ? error.message : 'Unknown error occurred',
                'RATE_ERROR'
            ));
        }
    }

    async calculateConversionAmount(
        amount: number,
        fromCurrency: string,
        toCurrency: string
    ): Promise<Result<{ amount: number; rate: ExchangeRate }, PaymentError>> {
        try {
            const rateResult = await this.getExchangeRate(fromCurrency, toCurrency);
            if (!rateResult.success) {
                throw rateResult.error;
            }

            const convertedAmount = amount * rateResult.data.rate;
            return createSuccess({
                amount: convertedAmount,
                rate: rateResult.data
            });
        } catch (error) {
            if (error instanceof PaymentError) {
                return createError(error);
            }
            return createError(new PaymentError(
                error instanceof Error ? error.message : 'Unknown error occurred',
                'CONVERSION_ERROR'
            ));
        }
    }

    private async updateRates(): Promise<void> {
        try {
            for (const pair of this.config.supportedPairs) {
                try {
                    const newRate = await this.fetchExchangeRate(
                        pair.fromCurrency,
                        pair.toCurrency
                    );

                    if (this.isValidRate(newRate)) {
                        const rateKey = this.getRateKey(
                            pair.fromCurrency,
                            pair.toCurrency
                        );
                        this.rates.set(rateKey, newRate);
                    }
                } catch (error) {
                    this.logger.error(`Failed to update rate for pair`, {
                        pair,
                        error
                    });
                }
            }
        } catch (error) {
            this.logger.error('Failed to update rates', { error });
        }
    }

    private async fetchExchangeRate(
        fromCurrency: string,
        toCurrency: string
    ): Promise<ExchangeRate> {
        // For now, only handle stablecoin pairs which have 1:1 rate
        if (
            (fromCurrency === 'USD' && toCurrency === 'USDC') ||
            (fromCurrency === 'USDC' && toCurrency === 'USD')
        ) {
            return {
                fromCurrency,
                toCurrency,
                rate: 1,
                timestamp: new Date(),
                source: 'fixed',
                confidence: 1
            };
        }

        throw new PaymentError(
            `Unable to fetch exchange rate for ${fromCurrency}/${toCurrency}`,
            'UNSUPPORTED_PAIR'
        );
    }

    private isValidRate(rate: ExchangeRate): boolean {
        // Get previous rate
        const rateKey = this.getRateKey(rate.fromCurrency, rate.toCurrency);
        const previousRate = this.rates.get(rateKey);

        if (!previousRate) {
            return true; // First rate is always valid
        }

        // Check for extreme price deviations
        const deviation = Math.abs(
            (rate.rate - previousRate.rate) / previousRate.rate
        );

        if (deviation > this.config.priceDeviationThreshold) {
            this.logger.warn('Suspicious price deviation detected', {
                pair: rateKey,
                oldRate: previousRate.rate,
                newRate: rate.rate,
                deviation
            });
            return false;
        }

        return true;
    }

    private getRateKey(fromCurrency: string, toCurrency: string): string {
        return `${fromCurrency.toUpperCase()}_${toCurrency.toUpperCase()}`;
    }

    getSupportedPairs(): Array<{ fromCurrency: string; toCurrency: string }> {
        return this.config.supportedPairs;
    }
}