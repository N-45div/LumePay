// apps/backend/src/services/bridge/errors/bridge-errors.ts

/**
 * Error codes for bridge operations
 */
export type BridgeErrorCode = 
  | 'INVALID_AMOUNT'
  | 'INVALID_CURRENCY'
  | 'INSUFFICIENT_FUNDS'
  | 'EXCHANGE_FAILED'
  | 'WALLET_NOT_FOUND'
  | 'ACCOUNT_NOT_FOUND'
  | 'RATE_LIMIT_EXCEEDED'
  | 'PROCESSING_ERROR';

/**
 * Error class for bridge operations
 */
export class BridgeError extends Error {
  constructor(
    public readonly code: BridgeErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'BridgeError';
    
    // Ensure instanceof works correctly
    Object.setPrototypeOf(this, BridgeError.prototype);
  }
}
