// apps/backend/src/services/ai/models/recommendation.model.ts

/**
 * Types of recommendations the AI can generate
 */
export enum RecommendationType {
  PAYMENT_METHOD = 'payment_method',
  FRAUD_ALERT = 'fraud_alert',
  EXCHANGE_RATE = 'exchange_rate',
  PAYMENT_TIMING = 'payment_timing',
  FEE_OPTIMIZATION = 'fee_optimization'
}

/**
 * Confidence level of a recommendation
 */
export enum ConfidenceLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  VERY_HIGH = 'very_high'
}

/**
 * Recommendation model
 */
export interface Recommendation {
  id: string;
  userId: string;
  type: RecommendationType;
  title: string;
  description: string;
  suggestedAction?: string;
  confidenceLevel: ConfidenceLevel;
  relatedTransactionIds?: string[];
  metadata?: Record<string, any>;
  createdAt: Date;
  expiresAt?: Date;
  dismissed?: boolean;
  appliedAt?: Date;
}

/**
 * Parameters for creating a new recommendation
 */
export interface CreateRecommendationParams {
  userId: string;
  type: RecommendationType;
  title: string;
  description: string;
  suggestedAction?: string;
  confidenceLevel: ConfidenceLevel;
  relatedTransactionIds?: string[];
  metadata?: Record<string, any>;
  expiresAt?: Date;
}
