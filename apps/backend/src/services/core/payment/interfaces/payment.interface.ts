import { Result } from '../../../../utils/result';
import { PaymentError } from '../errors/PaymentErrors';

// Defines the structure for payment requests and responses
export interface PaymentRequest {
    fromAddress: string;
    toAddress: string;
    amount: number;
    currency: string;
}

export interface PaymentResponse {
    transactionId: string;
    status: string;
    timestamp: Date;
    details: {
        from: string;
        to: string;
        amount: number;
        currency: string;
    };
}

export interface IPaymentProcessor {
    processPayment(request: PaymentRequest): Promise<Result<PaymentResponse, PaymentError>>;
    validateTransaction(transactionId: string): Promise<boolean>;
    getTransactionStatus(transactionId: string): Promise<string>;
}
