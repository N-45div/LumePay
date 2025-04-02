import { 
  Controller, 
  Post, 
  Body, 
  UseGuards, 
  HttpException, 
  HttpStatus 
} from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { 
  CryptoFiatBridgeService, 
  ExchangeDirection, 
  ExchangeParams, 
  ExchangeResult 
} from '../../services/bridge/crypto-fiat-bridge.service';
class ExchangeRequestDto {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  direction: ExchangeDirection;
  sourceId?: string;
  destinationId?: string;
  metadata?: Record<string, any>;
}
@Controller('api/bridge')
@UseGuards(AuthGuard)
export class CryptoFiatBridgeController {
  constructor(private bridgeService: CryptoFiatBridgeService) {}
  @Post('exchange')
  async exchange(@Body() dto: ExchangeRequestDto): Promise<{ exchange: ExchangeResult }> {
    const userId = 'mock-user-id';
    try {
      if (!dto.amount || dto.amount <= 0) {
        throw new HttpException('Invalid amount', HttpStatus.BAD_REQUEST);
      }
      if (!dto.fromCurrency || !dto.toCurrency) {
        throw new HttpException('Currency is required', HttpStatus.BAD_REQUEST);
      }
      if (!Object.values(ExchangeDirection).includes(dto.direction)) {
        throw new HttpException('Invalid exchange direction', HttpStatus.BAD_REQUEST);
      }
      const result = await this.bridgeService.exchange({
        userId,
        amount: dto.amount,
        fromCurrency: dto.fromCurrency,
        toCurrency: dto.toCurrency,
        direction: dto.direction,
        sourceId: dto.sourceId,
        destinationId: dto.destinationId,
        metadata: dto.metadata
      });
      if (!result.success) {
        throw new HttpException(
          {
            message: result.error.message,
            code: result.error.code
          },
          HttpStatus.BAD_REQUEST
        );
      }
      return { exchange: result.data };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  @Post('buy-crypto')
  async buyCrypto(@Body() dto: Omit<ExchangeRequestDto, 'direction'>): Promise<{ exchange: ExchangeResult }> {
    return this.exchange({
      ...dto,
      direction: ExchangeDirection.FIAT_TO_CRYPTO
    });
  }
  @Post('sell-crypto')
  async sellCrypto(@Body() dto: Omit<ExchangeRequestDto, 'direction'>): Promise<{ exchange: ExchangeResult }> {
    return this.exchange({
      ...dto,
      direction: ExchangeDirection.CRYPTO_TO_FIAT
    });
  }
}
