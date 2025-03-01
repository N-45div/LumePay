// apps/backend/src/services/core/fiat/interfaces/rate.interface.ts

import { Result } from '../../../../utils/result';
import { ExchangeRate } from '../RateService';

export interface IRateService {
    getExchangeRate(
        fromCurrency: string,
        toCurrency: string
    ): Promise<Result<ExchangeRate, Error>>;

    calculateConversionAmount(
        amount: number,
        fromCurrency: string,
        toCurrency: string
    ): Promise<Result<{ amount: number; rate: ExchangeRate }, Error>>;

    start(): Promise<void>;
    stop(): Promise<void>;
}