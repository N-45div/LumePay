// apps/backend/src/types.ts

/**
 * Common transaction status values used throughout the application
 */
export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  NEEDS_REVIEW = 'needs_review'
}

/**
 * Common payment processor status responses
 */
export type ProcessorStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded';

/**
 * Common currency codes
 */
export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'AUD' | 'CNY';

/**
 * Common error codes for the payment system
 */
export enum PaymentErrorCode {
  INVALID_AMOUNT = 'invalid_amount',
  INVALID_CURRENCY = 'invalid_currency',
  INSUFFICIENT_FUNDS = 'insufficient_funds',
  PROCESSOR_ERROR = 'processor_error',
  INVALID_ACCOUNT = 'invalid_account',
  TRANSACTION_NOT_FOUND = 'transaction_not_found',
  UNAUTHORIZED = 'unauthorized',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  INTERNAL_ERROR = 'internal_error'
}
