// apps/backend/src/services/analytics/transaction-analytics.service.ts

import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Logger } from '../../utils/logger';
import { TransactionTrackingService, Transaction, TransactionType } from '../core/payment/transaction-tracking.service';
import { TransactionStatus } from '../../types';
import { ConfigService } from '@nestjs/config';

export interface TransactionMetrics {
  totalCount: number;
  successCount: number;
  failureCount: number;
  pendingCount: number;
  averageCompletionTimeMs: number;
  processorBreakdown: Record<string, {
    totalCount: number;
    successRate: number;
    averageTimeMs: number;
    failureRate: number;
  }>;
  typeBreakdown: Record<string, {
    count: number;
    successRate: number;
  }>;
  // Daily metrics
  daily: {
    date: string;
    count: number;
    successRate: number;
    volumeTotal: number;
  }[];
}

@Injectable()
export class TransactionAnalyticsService {
  private logger: Logger;
  private metrics: TransactionMetrics | null = null;
  private lastUpdated: Date | null = null;
  private readonly CACHE_TTL_MINUTES = 60; // Cache for 1 hour

  constructor(
    private transactionTrackingService: TransactionTrackingService,
    private configService: ConfigService
  ) {
    this.logger = new Logger('TransactionAnalyticsService');
  }

  /**
   * Get transaction metrics - returns cached values if available and not expired
   */
  async getTransactionMetrics(): Promise<TransactionMetrics> {
    if (this.metrics && this.lastUpdated && 
        (new Date().getTime() - this.lastUpdated.getTime() < this.CACHE_TTL_MINUTES * 60 * 1000)) {
      return this.metrics;
    }
    
    // Cache expired or doesn't exist, generate new metrics
    return await this.generateTransactionMetrics();
  }
  
  /**
   * Generate transaction metrics from database
   * This is an expensive operation, so we cache the results
   */
  private async generateTransactionMetrics(): Promise<TransactionMetrics> {
    this.logger.info('Generating transaction metrics');
    
    try {
      // Get all transactions from the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const transactionsResult = await this.transactionTrackingService.getTransactionsByDateRange(
        thirtyDaysAgo,
        new Date()
      );
      
      if (!transactionsResult.success) {
        this.logger.error(`Failed to fetch transactions: ${transactionsResult.error.message}`);
        return this.getEmptyMetrics();
      }
      
      const transactions = transactionsResult.data;
      this.logger.info(`Analyzing ${transactions.length} transactions`);
      
      // Initialize metrics object
      const metrics: TransactionMetrics = this.getEmptyMetrics();
      
      // Process each transaction
      metrics.totalCount = transactions.length;
      
      // Process by status
      metrics.successCount = transactions.filter(t => t.status === TransactionStatus.COMPLETED).length;
      metrics.failureCount = transactions.filter(t => t.status === TransactionStatus.FAILED).length;
      metrics.pendingCount = transactions.filter(t => 
        t.status === TransactionStatus.PENDING || 
        t.status === TransactionStatus.PROCESSING).length;
      
      // Calculate completion times for successful transactions
      const completedTransactions = transactions.filter(t => t.status === TransactionStatus.COMPLETED);
      let totalTimeMs = 0;
      
      for (const tx of completedTransactions) {
        const createdAt = new Date(tx.createdAt).getTime();
        // Find completion timestamp from status history
        const completionEntry = tx.statusHistory?.find(sh => sh.status === TransactionStatus.COMPLETED);
        if (completionEntry) {
          const completedAt = new Date(completionEntry.timestamp).getTime();
          totalTimeMs += (completedAt - createdAt);
        }
      }
      
      metrics.averageCompletionTimeMs = completedTransactions.length > 0 ? 
        totalTimeMs / completedTransactions.length : 0;
      
      // Process by processor
      const processorMap = new Map<string, Transaction[]>();
      for (const tx of transactions) {
        if (tx.processorName) {
          if (!processorMap.has(tx.processorName)) {
            processorMap.set(tx.processorName, []);
          }
          processorMap.get(tx.processorName)!.push(tx);
        }
      }
      
      for (const [processor, txs] of processorMap.entries()) {
        const totalCount = txs.length;
        const successCount = txs.filter(t => t.status === TransactionStatus.COMPLETED).length;
        const failureCount = txs.filter(t => t.status === TransactionStatus.FAILED).length;
        
        // Calculate average time for completed transactions
        let processorTotalTimeMs = 0;
        const processorCompletedTxs = txs.filter(t => t.status === TransactionStatus.COMPLETED);
        
        for (const tx of processorCompletedTxs) {
          const createdAt = new Date(tx.createdAt).getTime();
          const completionEntry = tx.statusHistory?.find(sh => sh.status === TransactionStatus.COMPLETED);
          if (completionEntry) {
            const completedAt = new Date(completionEntry.timestamp).getTime();
            processorTotalTimeMs += (completedAt - createdAt);
          }
        }
        
        metrics.processorBreakdown[processor] = {
          totalCount,
          successRate: totalCount > 0 ? successCount / totalCount : 0,
          failureRate: totalCount > 0 ? failureCount / totalCount : 0,
          averageTimeMs: processorCompletedTxs.length > 0 ? 
            processorTotalTimeMs / processorCompletedTxs.length : 0
        };
      }
      
      // Process by transaction type
      const typeMap = new Map<TransactionType, Transaction[]>();
      for (const tx of transactions) {
        if (!typeMap.has(tx.type)) {
          typeMap.set(tx.type, []);
        }
        typeMap.get(tx.type)!.push(tx);
      }
      
      for (const [type, txs] of typeMap.entries()) {
        const totalCount = txs.length;
        const successCount = txs.filter(t => t.status === TransactionStatus.COMPLETED).length;
        
        metrics.typeBreakdown[type] = {
          count: totalCount,
          successRate: totalCount > 0 ? successCount / totalCount : 0
        };
      }
      
      // Generate daily metrics for the last 30 days
      const dailyMap = new Map<string, {
        count: number;
        successCount: number;
        volume: number;
      }>();
      
      // Initialize the map with all dates
      for (let i = 0; i < 30; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        dailyMap.set(dateStr, { count: 0, successCount: 0, volume: 0 });
      }
      
      // Fill in the data
      for (const tx of transactions) {
        const dateStr = new Date(tx.createdAt).toISOString().split('T')[0];
        if (dailyMap.has(dateStr)) {
          const daily = dailyMap.get(dateStr)!;
          daily.count++;
          if (tx.status === TransactionStatus.COMPLETED) {
            daily.successCount++;
            // Add to volume if amount is available
            if (tx.amount) {
              daily.volume += tx.amount;
            }
          }
        }
      }
      
      // Convert map to array for the metrics object
      metrics.daily = Array.from(dailyMap.entries()).map(([date, data]) => ({
        date,
        count: data.count,
        successRate: data.count > 0 ? data.successCount / data.count : 0,
        volumeTotal: data.volume
      })).sort((a, b) => a.date.localeCompare(b.date));
      
      // Update cache
      this.metrics = metrics;
      this.lastUpdated = new Date();
      
      this.logger.info('Transaction metrics generated successfully');
      return metrics;
    } catch (error) {
      this.logger.error(`Error generating transaction metrics: ${error}`);
      return this.getEmptyMetrics();
    }
  }
  
  /**
   * Return an empty metrics object
   */
  private getEmptyMetrics(): TransactionMetrics {
    return {
      totalCount: 0,
      successCount: 0,
      failureCount: 0,
      pendingCount: 0,
      averageCompletionTimeMs: 0,
      processorBreakdown: {},
      typeBreakdown: {},
      daily: []
    };
  }
  
  /**
   * Regenerate metrics daily at midnight
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async regenerateMetrics() {
    this.logger.info('Scheduled metrics regeneration started');
    await this.generateTransactionMetrics();
    this.logger.info('Scheduled metrics regeneration completed');
  }
  
  /**
   * Get performance insights based on transaction metrics
   */
  async getPerformanceInsights(): Promise<string[]> {
    const metrics = await this.getTransactionMetrics();
    const insights: string[] = [];
    
    // Overall success rate insight
    const overallSuccessRate = metrics.totalCount > 0 ? 
      metrics.successCount / metrics.totalCount : 0;
    
    if (overallSuccessRate < 0.9 && metrics.totalCount > 10) {
      insights.push(`Overall transaction success rate (${(overallSuccessRate * 100).toFixed(1)}%) is below the target of 90%.`);
    }
    
    // Processor insights
    for (const [processor, data] of Object.entries(metrics.processorBreakdown)) {
      if (data.totalCount > 10) {
        if (data.successRate < 0.9) {
          insights.push(`Processor ${processor} has a low success rate of ${(data.successRate * 100).toFixed(1)}%.`);
        }
        
        if (data.averageTimeMs > 10000) { // More than 10 seconds
          insights.push(`Processor ${processor} has a high average processing time of ${(data.averageTimeMs / 1000).toFixed(1)} seconds.`);
        }
      }
    }
    
    // Transaction type insights
    for (const [type, data] of Object.entries(metrics.typeBreakdown)) {
      if (data.count > 10 && data.successRate < 0.85) {
        insights.push(`Transaction type ${type} has a low success rate of ${(data.successRate * 100).toFixed(1)}%.`);
      }
    }
    
    // Daily volume insights
    if (metrics.daily.length >= 2) {
      const yesterday = metrics.daily[metrics.daily.length - 1];
      const dayBefore = metrics.daily[metrics.daily.length - 2];
      
      if (yesterday.count > 0 && dayBefore.count > 0) {
        const volumeChange = (yesterday.volumeTotal - dayBefore.volumeTotal) / dayBefore.volumeTotal;
        if (volumeChange < -0.2) { // 20% decrease
          insights.push(`Transaction volume decreased by ${Math.abs(volumeChange * 100).toFixed(1)}% compared to the previous day.`);
        } else if (volumeChange > 0.2) { // 20% increase
          insights.push(`Transaction volume increased by ${(volumeChange * 100).toFixed(1)}% compared to the previous day.`);
        }
      }
    }
    
    return insights;
  }
}
