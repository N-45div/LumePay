import { PaymentError } from '../services/core/payment/errors/PaymentErrors';

export function convertToPaymentError(error: unknown): PaymentError {
    if (error instanceof PaymentError) {
        return error;
    }

    if (error instanceof Error) {
        return new PaymentError(
            error.message,
            'TRANSACTION_ERROR',
            { originalError: error }
        );
    }

    return new PaymentError(
        'An unknown error occurred',
        'UNKNOWN_ERROR',
        { originalError: error }
    );
}