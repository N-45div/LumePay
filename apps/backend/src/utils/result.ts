// apps/backend/src/utils/result.ts

import { PaymentError } from '../services/core/payment/errors/PaymentErrors';

export type Result<T, E = PaymentError> = {
    success: true;
    data: T;
} | {
    success: false;
    error: E;
};

export const createSuccess = <T>(data: T): Result<T, PaymentError> => ({
    success: true,
    data,
});

export const createError = <E extends PaymentError>(error: E): Result<never, E> => ({
    success: false,
    error,
});

export const convertError = (error: Error): PaymentError => {
    if (error instanceof PaymentError) {
        return error;
    }
    return new PaymentError(
        error.message,
        'INTERNAL_ERROR',
        { originalError: error }
    );
};

export const mapSolanaResult = <T>(result: Result<T, Error>): Result<T, PaymentError> => {
    if (result.success) {
        return createSuccess(result.data);
    }
    return createError(convertError(result.error));
};