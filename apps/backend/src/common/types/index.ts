export * from './transaction.types';
export type ProcessorStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded';
export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'AUD' | 'CNY';
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
