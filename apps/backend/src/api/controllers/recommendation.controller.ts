import { 
  Controller, 
  Get, 
  Post, 
  Param, 
  UseGuards,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { RecommendationService } from '../../services/ai/recommendation.service';
import { AuthGuard } from '../guards/auth.guard';
import { Recommendation } from '../../services/ai/models/recommendation.model';
@Controller('api/recommendations')
@UseGuards(AuthGuard)
export class RecommendationController {
  constructor(private recommendationService: RecommendationService) {}
  @Get()
  async getUserRecommendations(): Promise<{ recommendations: Recommendation[] }> {
    const userId = 'mock-user-id';
    const recommendations = await this.recommendationService.getUserRecommendations(userId);
    return { recommendations };
  }
  @Post('generate/payment-methods')
  async generatePaymentMethodRecommendations(): Promise<{ recommendations: Recommendation[] }> {
    const userId = 'mock-user-id';
    const recommendations = await this.recommendationService.generatePaymentMethodRecommendations(userId);
    return { recommendations };
  }
  @Post('generate/fraud-alerts')
  async generateFraudAlertRecommendations(): Promise<{ recommendations: Recommendation[] }> {
    const userId = 'mock-user-id';
    const recommendations = await this.recommendationService.generateFraudAlertRecommendations(userId);
    return { recommendations };
  }
  @Post('generate/exchange-rates')
  async generateExchangeRateRecommendations(): Promise<{ recommendations: Recommendation[] }> {
    const userId = 'mock-user-id';
    const recommendations = await this.recommendationService.generateExchangeRateRecommendations(userId);
    return { recommendations };
  }
  @Post(':id/dismiss')
  async dismissRecommendation(@Param('id') id: string): Promise<{ success: boolean }> {
    const userId = 'mock-user-id';
    const success = await this.recommendationService.dismissRecommendation(userId, id);
    if (!success) {
      throw new HttpException(
        'Recommendation not found',
        HttpStatus.NOT_FOUND
      );
    }
    return { success };
  }
  @Post(':id/apply')
  async applyRecommendation(@Param('id') id: string): Promise<{ success: boolean }> {
    const userId = 'mock-user-id';
    const success = await this.recommendationService.applyRecommendation(userId, id);
    if (!success) {
      throw new HttpException(
        'Recommendation not found',
        HttpStatus.NOT_FOUND
      );
    }
    return { success };
  }
}
