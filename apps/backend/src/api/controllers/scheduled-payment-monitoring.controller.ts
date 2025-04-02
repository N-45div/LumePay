import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ScheduledPaymentProcessorService } from '../../services/core/payment/scheduled-payment-processor.service';
import { ScheduledPaymentService } from '../../services/core/payment/scheduled-payment.service';
import { ScheduledPaymentMonitoringDto } from '../dtos/scheduled-payment-monitoring.dto';
import { Logger } from '../../utils/logger';
class AdminAuthGuard {
  canActivate() {
    return true; // In a real app, this would check admin permissions
  }
}
@Controller('api/admin/scheduled-payments')
@UseGuards(AdminAuthGuard)
export class ScheduledPaymentMonitoringController {
  private readonly logger = new Logger(ScheduledPaymentMonitoringController.name);
  constructor(
    private readonly scheduledPaymentProcessorService: ScheduledPaymentProcessorService,
    private readonly scheduledPaymentService: ScheduledPaymentService,
  ) {}
  @Get('monitoring')
  async getMonitoringStats(): Promise<ScheduledPaymentMonitoringDto> {
    this.logger.info('Fetching scheduled payment monitoring statistics');
    return this.scheduledPaymentProcessorService.getMonitoringStats();
  }
  @Post('trigger-processing')
  async triggerProcessing(): Promise<{ status: string }> {
    this.logger.info('Manually triggering scheduled payment processing');
    const result = await this.scheduledPaymentProcessorService.triggerProcessing();
    return { status: result };
  }
  @Get('stats/by-frequency')
  async getStatsByFrequency(): Promise<Record<string, number>> {
    this.logger.info('Fetching scheduled payment statistics by frequency');
    const stats = await this.scheduledPaymentProcessorService.getMonitoringStats();
    return stats.paymentsByFrequency;
  }
  @Get('stats/by-type')
  async getStatsByType(): Promise<Record<string, number>> {
    this.logger.info('Fetching scheduled payment statistics by type');
    const stats = await this.scheduledPaymentProcessorService.getMonitoringStats();
    return stats.paymentsByType;
  }
  @Get('recent-executions')
  async getRecentExecutions(): Promise<any[]> {
    this.logger.info('Fetching recent scheduled payment executions');
    const stats = await this.scheduledPaymentProcessorService.getMonitoringStats();
    return stats.recentExecutions;
  }
  @Get('attention-required')
  async getPaymentsRequiringAttention(): Promise<any> {
    this.logger.info('Fetching payments requiring attention');
    const result = await this.scheduledPaymentService.getPaymentsRequiringAttention();
    return result.success ? result.data : { error: result.error };
  }
}
