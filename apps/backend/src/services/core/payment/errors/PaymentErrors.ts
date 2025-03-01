// apps/backend/src/services/core/payment/errors/PaymentErrors.ts

export class PaymentError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly details?: Record<string, any>
    ) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

export class InsufficientFundsError extends PaymentError {
    constructor(
        message: string = "Insufficient funds for transaction",
        details?: Record<string, any>
    ) {
        super(message, "INSUFFICIENT_FUNDS", details);
    }
}

export class InvalidAddressError extends PaymentError {
    constructor(
        message: string = "Invalid address provided",
        details?: Record<string, any>
    ) {
        super(message, "INVALID_ADDRESS", details);
    }
}