export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  NEEDS_REVIEW = 'needs_review',
  UNKNOWN = 'unknown'
}
export enum TransactionType {
  FIAT_DEPOSIT = 'FIAT_DEPOSIT',
  FIAT_WITHDRAWAL = 'FIAT_WITHDRAWAL',
  FIAT_TRANSFER = 'FIAT_TRANSFER',
  CRYPTO_DEPOSIT = 'CRYPTO_DEPOSIT',
  CRYPTO_WITHDRAWAL = 'CRYPTO_WITHDRAWAL',
  CRYPTO_TRANSFER = 'CRYPTO_TRANSFER',
  EXCHANGE = 'EXCHANGE',
  FEE = 'FEE',
  FIAT_TO_CRYPTO = 'FIAT_TO_CRYPTO',
  CRYPTO_TO_FIAT = 'CRYPTO_TO_FIAT'
}
export type BridgeErrorCode = 
  | 'INVALID_AMOUNT'
  | 'INVALID_CURRENCY'
  | 'INSUFFICIENT_FUNDS'
  | 'EXCHANGE_FAILED'
  | 'WALLET_NOT_FOUND'
  | 'ACCOUNT_NOT_FOUND'
  | 'RATE_LIMIT_EXCEEDED'
  | 'PROCESSING_ERROR';
export class BridgeError extends Error {
  constructor(
    public readonly code: BridgeErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'BridgeError';
    Object.setPrototypeOf(this, BridgeError.prototype);
  }
}
export enum PaymentErrorCode {
  INVALID_AMOUNT = 'invalid_amount',
  INVALID_CURRENCY = 'invalid_currency',
  INSUFFICIENT_FUNDS = 'insufficient_funds',
  PAYMENT_FAILED = 'payment_failed',
  PROVIDER_ERROR = 'provider_error',
  TRANSACTION_NOT_FOUND = 'transaction_not_found',
  INVALID_ACCOUNT = 'invalid_account',
  ACCOUNT_NOT_FOUND = 'account_not_found',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded'
}
export class PaymentError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'PaymentError';
    Object.setPrototypeOf(this, PaymentError.prototype);
  }
  toBridgeError(): BridgeError {
    return convertPaymentErrorToBridgeError(this);
  }
}
export function convertPaymentErrorToBridgeError(error: PaymentError): BridgeError {
  let bridgeErrorCode: BridgeErrorCode;
  switch (error.code) {
    case 'INVALID_AMOUNT':
      bridgeErrorCode = 'INVALID_AMOUNT';
      break;
    case 'INVALID_CURRENCY':
      bridgeErrorCode = 'INVALID_CURRENCY';
      break;
    case 'INSUFFICIENT_FUNDS':
      bridgeErrorCode = 'INSUFFICIENT_FUNDS';
      break;
    case 'TRANSACTION_NOT_FOUND':
    case 'INVALID_ACCOUNT':
    case 'ACCOUNT_NOT_FOUND':
      bridgeErrorCode = 'ACCOUNT_NOT_FOUND';
      break;
    case 'RATE_LIMIT_EXCEEDED':
      bridgeErrorCode = 'RATE_LIMIT_EXCEEDED';
      break;
    case 'PAYMENT_FAILED':
    case 'PROVIDER_ERROR':
    default:
      bridgeErrorCode = 'PROCESSING_ERROR';
  }
  return new BridgeError(bridgeErrorCode, error.message);
}
