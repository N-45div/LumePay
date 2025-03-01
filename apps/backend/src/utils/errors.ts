export class SolanaError extends Error {
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

// Common error types the Solana team might need
export class InsufficientBalanceError extends SolanaError {
    constructor(
        message: string = "Insufficient balance",
        details?: Record<string, any>
    ) {
        super(message, "INSUFFICIENT_BALANCE", details);
    }
}

export class InvalidAddressError extends SolanaError {
    constructor(
        message: string = "Invalid address",
        details?: Record<string, any>
    ) {
        super(message, "INVALID_ADDRESS", details);
    }
}

export class TransactionError extends SolanaError {
    constructor(
        message: string = "Transaction failed",
        details?: Record<string, any>
    ) {
        super(message, "TRANSACTION_ERROR", details);
    }
}

export class QuoteError extends SolanaError {
    constructor(
        message: string = "Failed to get quote",
        details?: Record<string, any>
    ) {
        super(message, "QUOTE_ERROR", details);
    }
}