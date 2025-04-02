// apps/backend/src/services/ai/recommendation.service.ts

import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../utils/logger';
import { ConfigService } from '@nestjs/config';
import { TransactionAnalyticsService } from '../analytics/transaction-analytics.service';
import { TransactionTrackingService, Transaction } from '../core/payment/transaction-tracking.service';
import { TransactionType } from '../../db/models/transaction.entity';
import { TransactionStatus } from '../../types';
import { 
  Recommendation, 
  RecommendationType, 
  ConfidenceLevel, 
  CreateRecommendationParams 
} from './models/recommendation.model';

/**
 * Service for generating AI-powered recommendations
 */
@Injectable()
export class RecommendationService {
  private logger: Logger;
  private recommendations: Map<string, Recommendation[]> = new Map();
  
  constructor(
    private configService: ConfigService,
    private transactionAnalyticsService: TransactionAnalyticsService,
    private transactionTrackingService: TransactionTrackingService
  ) {
    this.logger = new Logger('RecommendationService');
  }
  
  /**
   * Get recommendations for a user
   */
  async getUserRecommendations(userId: string): Promise<Recommendation[]> {
    // Get user recommendations from storage
    const userRecommendations = this.recommendations.get(userId) || [];
    
    // Filter out expired and dismissed recommendations
    const now = new Date();
    const activeRecommendations = userRecommendations.filter(rec => {
      if (rec.dismissed) return false;
      if (rec.expiresAt && rec.expiresAt < now) return false;
      return true;
    });
    
    return activeRecommendations;
  }
  
  /**
   * Create a new recommendation
   */
  async createRecommendation(params: CreateRecommendationParams): Promise<Recommendation> {
    const recommendation: Recommendation = {
      id: uuidv4(),
      userId: params.userId,
      type: params.type,
      title: params.title,
      description: params.description,
      suggestedAction: params.suggestedAction,
      confidenceLevel: params.confidenceLevel,
      relatedTransactionIds: params.relatedTransactionIds || [],
      metadata: params.metadata || {},
      createdAt: new Date(),
      expiresAt: params.expiresAt,
      dismissed: false
    };
    
    // Store recommendation
    if (!this.recommendations.has(params.userId)) {
      this.recommendations.set(params.userId, []);
    }
    this.recommendations.get(params.userId)!.push(recommendation);
    
    this.logger.info(`Created ${recommendation.type} recommendation for user ${params.userId}`);
    return recommendation;
  }
  
  /**
   * Dismiss a recommendation
   */
  async dismissRecommendation(userId: string, recommendationId: string): Promise<boolean> {
    const userRecommendations = this.recommendations.get(userId);
    if (!userRecommendations) return false;
    
    const recommendation = userRecommendations.find(r => r.id === recommendationId);
    if (!recommendation) return false;
    
    recommendation.dismissed = true;
    return true;
  }
  
  /**
   * Apply a recommendation
   */
  async applyRecommendation(userId: string, recommendationId: string): Promise<boolean> {
    const userRecommendations = this.recommendations.get(userId);
    if (!userRecommendations) return false;
    
    const recommendation = userRecommendations.find(r => r.id === recommendationId);
    if (!recommendation) return false;
    
    recommendation.appliedAt = new Date();
    return true;
  }
  
  /**
   * Generate payment method recommendations based on transaction history
   */
  async generatePaymentMethodRecommendations(userId: string): Promise<Recommendation[]> {
    try {
      // Get user's transaction history
      const transactionsResult = await this.transactionTrackingService.getUserTransactions(userId);
      if (!transactionsResult.success) {
        this.logger.warn(`Failed to get transactions for user ${userId}`);
        return [];
      }
      
      const transactions = transactionsResult.data;
      if (transactions.length === 0) {
        this.logger.info(`No transactions found for user ${userId}, skipping recommendations`);
        return [];
      }
      
      const recommendations: Recommendation[] = [];
      
      // Analyze past transactions to find patterns
      const processorSuccessRates = this.calculateProcessorSuccessRates(transactions);
      const bestProcessor = this.findBestProcessor(processorSuccessRates);
      const worstProcessor = this.findWorstProcessor(processorSuccessRates);
      
      // Generate recommendation based on best processor
      if (bestProcessor && processorSuccessRates[bestProcessor] > 0.9) {
        const recommendation = await this.createRecommendation({
          userId,
          type: RecommendationType.PAYMENT_METHOD,
          title: 'Recommended Payment Method',
          description: `Based on your transaction history, ${this.formatProcessorName(bestProcessor)} has been your most reliable payment method with a ${(processorSuccessRates[bestProcessor] * 100).toFixed(1)}% success rate.`,
          suggestedAction: `Consider using ${this.formatProcessorName(bestProcessor)} for your future payments.`,
          confidenceLevel: ConfidenceLevel.HIGH,
          metadata: {
            processor: bestProcessor,
            successRate: processorSuccessRates[bestProcessor]
          }
        });
        
        recommendations.push(recommendation);
      }
      
      // Generate recommendation to avoid worst processor
      if (worstProcessor && processorSuccessRates[worstProcessor] < 0.7) {
        const recommendation = await this.createRecommendation({
          userId,
          type: RecommendationType.PAYMENT_METHOD,
          title: 'Payment Method Warning',
          description: `${this.formatProcessorName(worstProcessor)} has had a lower success rate (${(processorSuccessRates[worstProcessor] * 100).toFixed(1)}%) compared to your other payment methods.`,
          suggestedAction: `You might want to try an alternative payment method for more reliable transactions.`,
          confidenceLevel: ConfidenceLevel.MEDIUM,
          metadata: {
            processor: worstProcessor,
            successRate: processorSuccessRates[worstProcessor]
          }
        });
        
        recommendations.push(recommendation);
      }
      
      return recommendations;
    } catch (error) {
      this.logger.error(`Error generating payment method recommendations: ${error}`);
      return [];
    }
  }
  
  /**
   * Generate fraud alert recommendations based on transaction patterns
   */
  async generateFraudAlertRecommendations(userId: string): Promise<Recommendation[]> {
    try {
      // Get user's recent transactions
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const transactionsResult = await this.transactionTrackingService.getUserTransactions(userId);
      if (!transactionsResult.success) {
        this.logger.warn(`Failed to get transactions for user ${userId}`);
        return [];
      }
      
      const transactions = transactionsResult.data;
      if (transactions.length === 0) {
        return [];
      }
      
      const recommendations: Recommendation[] = [];
      
      // Check for unusual transaction patterns
      const unusualTransactions = this.detectUnusualTransactions(transactions);
      
      for (const transaction of unusualTransactions) {
        const recommendation = await this.createRecommendation({
          userId,
          type: RecommendationType.FRAUD_ALERT,
          title: 'Potential Unusual Activity',
          description: `We detected a transaction of ${transaction.amount} ${transaction.currency} that differs from your usual spending patterns.`,
          suggestedAction: 'Please review this transaction and contact support if you don\'t recognize it.',
          confidenceLevel: ConfidenceLevel.MEDIUM,
          relatedTransactionIds: [transaction.id],
          metadata: {
            transactionAmount: transaction.amount,
            transactionCurrency: transaction.currency,
            reason: 'unusual_amount'
          }
        });
        
        recommendations.push(recommendation);
      }
      
      return recommendations;
    } catch (error) {
      this.logger.error(`Error generating fraud alert recommendations: ${error}`);
      return [];
    }
  }
  
  /**
   * Generate exchange rate optimization recommendations
   */
  async generateExchangeRateRecommendations(userId: string): Promise<Recommendation[]> {
    try {
      // This would typically connect to an exchange rate service to get real-time data
      // For now, we'll use mock data for demonstration
      const currencies = ['USD', 'EUR', 'GBP'];
      const recommendations: Recommendation[] = [];
      
      // Mock favorable exchange rate detected
      const recommendation = await this.createRecommendation({
        userId,
        type: RecommendationType.EXCHANGE_RATE,
        title: 'Favorable Exchange Rate Alert',
        description: 'Current USD to EUR exchange rates are particularly favorable compared to the 30-day average.',
        suggestedAction: 'Consider making EUR payments or conversions now to take advantage of the current rate.',
        confidenceLevel: ConfidenceLevel.MEDIUM,
        metadata: {
          fromCurrency: 'USD',
          toCurrency: 'EUR',
          currentRate: 0.92,
          averageRate: 0.89,
          percentImprovement: 3.4
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Expires in 24 hours
      });
      
      recommendations.push(recommendation);
      
      return recommendations;
    } catch (error) {
      this.logger.error(`Error generating exchange rate recommendations: ${error}`);
      return [];
    }
  }
  
  /**
   * Calculate success rates for each payment processor used by the user
   */
  private calculateProcessorSuccessRates(transactions: Transaction[]): Record<string, number> {
    const processorStats: Record<string, { total: number, successful: number }> = {};
    
    for (const transaction of transactions) {
      if (!transaction.processorName) continue;
      
      if (!processorStats[transaction.processorName]) {
        processorStats[transaction.processorName] = { total: 0, successful: 0 };
      }
      
      processorStats[transaction.processorName].total++;
      
      // Use string comparison instead of enum comparison to avoid type issues
      if (transaction.status === 'completed') {
        processorStats[transaction.processorName].successful++;
      }
    }
    
    const successRates: Record<string, number> = {};
    
    for (const [processor, stats] of Object.entries(processorStats)) {
      if (stats.total >= 3) { // Only consider processors with at least 3 transactions
        successRates[processor] = stats.successful / stats.total;
      }
    }
    
    return successRates;
  }
  
  /**
   * Find the payment processor with the highest success rate
   */
  private findBestProcessor(successRates: Record<string, number>): string | null {
    let bestProcessor = null;
    let bestRate = 0;
    
    for (const [processor, rate] of Object.entries(successRates)) {
      if (rate > bestRate) {
        bestRate = rate;
        bestProcessor = processor;
      }
    }
    
    return bestProcessor;
  }
  
  /**
   * Find the payment processor with the lowest success rate
   */
  private findWorstProcessor(successRates: Record<string, number>): string | null {
    let worstProcessor = null;
    let worstRate = 1;
    
    for (const [processor, rate] of Object.entries(successRates)) {
      if (rate < worstRate) {
        worstRate = rate;
        worstProcessor = processor;
      }
    }
    
    return worstProcessor;
  }
  
  /**
   * Format processor name for display
   */
  private formatProcessorName(processorName: string): string {
    // Convert camelCase or snake_case to Title Case
    return processorName
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, char => char.toUpperCase());
  }
  
  /**
   * Detect unusual transactions based on user's typical patterns
   */
  private detectUnusualTransactions(transactions: Transaction[]): Transaction[] {
    if (transactions.length < 5) return []; // Not enough data to establish patterns
    
    // Calculate average and standard deviation of transaction amounts
    let totalAmount = 0;
    const amounts: number[] = [];
    
    for (const transaction of transactions) {
      if (transaction.amount) {
        totalAmount += transaction.amount;
        amounts.push(transaction.amount);
      }
    }
    
    const avgAmount = totalAmount / amounts.length;
    
    // Calculate standard deviation
    let sumSquaredDiff = 0;
    for (const amount of amounts) {
      sumSquaredDiff += Math.pow(amount - avgAmount, 2);
    }
    const stdDev = Math.sqrt(sumSquaredDiff / amounts.length);
    
    // Consider transactions unusual if they are more than 2 standard deviations from mean
    const threshold = 2.0;
    const unusualTransactions: Transaction[] = [];
    
    for (const transaction of transactions) {
      if (transaction.amount) {
        const zScore = Math.abs(transaction.amount - avgAmount) / stdDev;
        if (zScore > threshold) {
          unusualTransactions.push(transaction);
        }
      }
    }
    
    // Sort by most recent and limit to the most recent 3 unusual transactions
    return unusualTransactions
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3);
  }
}
