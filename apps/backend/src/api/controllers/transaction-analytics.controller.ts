import { 
  Controller, 
  Get, 
  UseGuards
} from '@nestjs/common';
import { TransactionAnalyticsService } from '../../services/analytics/transaction-analytics.service';
import { AuthGuard } from '../guards/auth.guard';
@Controller('api/analytics/transactions')
@UseGuards(AuthGuard)
export class TransactionAnalyticsController {
  constructor(private transactionAnalyticsService: TransactionAnalyticsService) {}
  @Get('metrics')
  async getTransactionMetrics() {
    const metrics = await this.transactionAnalyticsService.getTransactionMetrics();
    return { metrics };
  }
  @Get('insights')
  async getPerformanceInsights() {
    const insights = await this.transactionAnalyticsService.getPerformanceInsights();
    return { insights };
  }
}
