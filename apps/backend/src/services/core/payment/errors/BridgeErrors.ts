// apps/backend/src/services/core/payment/errors/BridgeErrors.ts

/**
 * Base class for all bridge errors
 */
export class BridgeError extends Error {
  code: string;
  details?: any;

  constructor(code: string, message: string, details?: any) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Error thrown when a processor is not available
 */
export class ProcessorNotAvailableError extends BridgeError {
  constructor(processorName: string, details?: any) {
    super(
      'PROCESSOR_NOT_AVAILABLE',
      `Payment processor '${processorName}' is not available`,
      details
    );
    this.name = 'ProcessorNotAvailableError';
  }
}

/**
 * Error thrown when a processor operation fails
 */
export class ProcessorOperationError extends BridgeError {
  constructor(processorName: string, operation: string, details?: any) {
    super(
      'PROCESSOR_OPERATION_FAILED',
      `Operation '${operation}' failed for processor '${processorName}'`,
      details
    );
    this.name = 'ProcessorOperationError';
  }
}

/**
 * Error thrown when a transaction is not found
 */
export class TransactionNotFoundError extends BridgeError {
  constructor(transactionId: string, details?: any) {
    super(
      'TRANSACTION_NOT_FOUND',
      `Transaction with ID '${transactionId}' was not found`,
      details
    );
    this.name = 'TransactionNotFoundError';
  }
}

/**
 * Error thrown when a payment method is not found
 */
export class PaymentMethodNotFoundError extends BridgeError {
  constructor(paymentMethodId: string, details?: any) {
    super(
      'PAYMENT_METHOD_NOT_FOUND',
      `Payment method with ID '${paymentMethodId}' was not found`,
      details
    );
    this.name = 'PaymentMethodNotFoundError';
  }
}

/**
 * Error thrown when a deposit fails
 */
export class DepositFailedError extends BridgeError {
  constructor(details?: any) {
    super(
      'DEPOSIT_FAILED',
      'Deposit operation failed',
      details
    );
    this.name = 'DepositFailedError';
  }
}

/**
 * Error thrown when a withdrawal fails
 */
export class WithdrawalFailedError extends BridgeError {
  constructor(details?: any) {
    super(
      'WITHDRAWAL_FAILED',
      'Withdrawal operation failed',
      details
    );
    this.name = 'WithdrawalFailedError';
  }
}

/**
 * Error thrown when a transaction is in an invalid state
 */
export class InvalidTransactionStateError extends BridgeError {
  constructor(transactionId: string, currentState: string, expectedState: string, details?: any) {
    super(
      'INVALID_TRANSACTION_STATE',
      `Transaction with ID '${transactionId}' is in state '${currentState}', expected '${expectedState}'`,
      details
    );
    this.name = 'InvalidTransactionStateError';
  }
}
