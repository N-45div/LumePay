// apps/backend/src/services/core/banking/errors/BankErrors.ts

export class BankError extends Error {
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

export class InvalidBankAccountError extends BankError {
    constructor(
        message: string = 'Invalid bank account details',
        details?: Record<string, any>
    ) {
        super(message, 'INVALID_BANK_ACCOUNT', details);
    }
}

export class BankAccountNotFoundError extends BankError {
    constructor(
        message: string = 'Bank account not found',
        details?: Record<string, any>
    ) {
        super(message, 'BANK_ACCOUNT_NOT_FOUND', details);
    }
}

export class BankAccountValidationError extends BankError {
    constructor(
        message: string = 'Bank account validation failed',
        details?: Record<string, any>
    ) {
        super(message, 'BANK_ACCOUNT_VALIDATION_FAILED', details);
    }
}