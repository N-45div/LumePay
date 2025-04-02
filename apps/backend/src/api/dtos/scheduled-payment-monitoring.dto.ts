// apps/backend/src/api/dtos/scheduled-payment-monitoring.dto.ts

/**
 * DTO for scheduled payment monitoring statistics
 */
export class ScheduledPaymentMonitoringDto {
  // Overall processing statistics
  totalScheduledPayments: number;
  activeScheduledPayments: number;
  duePayments: number;
  
  // Execution statistics
  lastProcessingTime: Date | null;
  processingDurationMs: number | null;
  paymentsProcessedInLastRun: number;
  
  // Failure statistics
  failedPaymentsCount: number;
  retryingPaymentsCount: number;
  
  // Performance metrics
  averageProcessingTimeMs: number | null;
  
  // Status
  isCurrentlyProcessing: boolean;
  
  // Scheduled payment counts by type
  paymentsByType: Record<string, number>;
  
  // Scheduled payment counts by frequency
  paymentsByFrequency: Record<string, number>;
  
  // Recent execution history (last 10 runs)
  recentExecutions: {
    timestamp: Date;
    processedCount: number;
    successCount: number;
    failureCount: number;
    durationMs: number;
  }[];
}
