// apps/backend/src/services/core/routing/transaction-routing.interface.ts

import { Result } from '../../../common/types/result.types';

/**
 * Represents a transaction route with all necessary parameters
 */
export interface TransactionRoute {
  // Route identifier
  id: string;
  
  // Route type (fiat, crypto, hybrid)
  type: RouteType;
  
  // Payment processors used in this route
  processors: string[];
  
  // Expected time to complete the transaction (in seconds)
  estimatedTimeSeconds: number;
  
  // Estimated fees for this route
  estimatedFees: {
    amount: number;
    currency: string;
    breakdown?: {
      processorFees: number;
      networkFees: number;
      platformFees: number;
    };
  };
  
  // Route score (higher is better)
  score: number;
  
  // Confidence level (0-100)
  confidenceLevel: number;
  
  // Risk level (0-100)
  riskLevel: number;
  
  // Any additional metadata
  metadata?: Record<string, any>;
}

/**
 * Routing types
 */
export enum RouteType {
  FIAT_ONLY = 'FIAT_ONLY',         // Traditional banking only
  CRYPTO_ONLY = 'CRYPTO_ONLY',     // Crypto only
  HYBRID = 'HYBRID',               // Mix of fiat and crypto
  OPTIMIZED = 'OPTIMIZED'          // System decides best route
}

/**
 * Routing request parameters
 */
export interface RoutingRequest {
  // User making the transaction
  userId: string;
  
  // Source information
  sourceAmount: number;
  sourceCurrency: string;
  sourceType?: 'BANK_ACCOUNT' | 'WALLET' | 'CARD';
  sourceId?: string;
  
  // Destination information
  destinationAmount?: number;   // Optional: Either source or destination amount is required
  destinationCurrency: string;
  destinationType?: 'BANK_ACCOUNT' | 'WALLET' | 'EMAIL' | 'PHONE';
  destinationId?: string;
  
  // Routing preferences
  preferences?: {
    prioritizeFee?: boolean;    // Prioritize lower fees
    prioritizeSpeed?: boolean;  // Prioritize speed
    preferredRouteType?: RouteType;
    maxFeeAmount?: number;
    minConfidenceLevel?: number;
  };
  
  // Transaction purpose
  purpose?: 'PAYMENT' | 'TRANSFER' | 'EXCHANGE' | 'SCHEDULED';
  
  // Additional metadata
  metadata?: Record<string, any>;
}

/**
 * Routing error codes
 */
export enum RoutingErrorCode {
  NO_ROUTE_FOUND = 'NO_ROUTE_FOUND',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  UNSUPPORTED_CURRENCY = 'UNSUPPORTED_CURRENCY',
  USER_RESTRICTIONS = 'USER_RESTRICTIONS',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED'
}

/**
 * Routing error
 */
export class RoutingError extends Error {
  constructor(
    public code: RoutingErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'RoutingError';
  }
}

/**
 * Transaction Router Interface
 */
export interface ITransactionRouter {
  /**
   * Find all possible routes for a transaction
   * @param request Routing request parameters
   * @returns A result containing an array of possible routes or an error
   */
  findRoutes(request: RoutingRequest): Promise<Result<TransactionRoute[]>>;
  
  /**
   * Get the best route for a transaction based on routing preferences
   * @param request Routing request parameters
   * @returns A result containing the best route or an error
   */
  getBestRoute(request: RoutingRequest): Promise<Result<TransactionRoute>>;
  
  /**
   * Get a specific route by ID
   * @param routeId Route identifier
   * @returns A result containing the route or an error
   */
  getRouteById(routeId: string): Promise<Result<TransactionRoute>>;
  
  /**
   * Validate if a route is still valid
   * @param routeId Route identifier
   * @returns A result indicating if the route is still valid
   */
  validateRoute(routeId: string): Promise<Result<boolean>>;
}
