import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  UseGuards,
  HttpException,
  HttpStatus,
  Query
} from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { TransactionTrackingService } from '../../services/core/payment/transaction-tracking.service';
import { FiatBridgeService, FiatTransferParams } from '../../services/core/payment/fiat-bridge.service';
class CreatePaymentDto implements Partial<FiatTransferParams> {
  amount: number;
  currency: string;
  sourceAccountId?: string;
  destinationAccountId?: string;
  description?: string;
  metadata?: Record<string, any>;
}
@Controller('api/payments')
@UseGuards(AuthGuard)
export class PaymentController {
  constructor(
    private transactionTrackingService: TransactionTrackingService,
    private fiatBridgeService: FiatBridgeService
  ) {}
  @Post()
  async createPayment(@Body() dto: CreatePaymentDto) {
    const userId = 'mock-user-id';
    try {
      if (!dto.amount || dto.amount <= 0) {
        throw new HttpException('Invalid amount', HttpStatus.BAD_REQUEST);
      }
      if (!dto.currency) {
        throw new HttpException('Currency is required', HttpStatus.BAD_REQUEST);
      }
      const result = await this.fiatBridgeService.transferFunds({
        userId,
        amount: dto.amount,
        currency: dto.currency,
        sourceAccountId: dto.sourceAccountId,
        destinationAccountId: dto.destinationAccountId,
        description: dto.description,
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
      return { 
        payment: result.data,
        message: `Payment of ${dto.amount} ${dto.currency} completed successfully` 
      };
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
  @Get('history')
  async getPaymentHistory(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    const userId = 'mock-user-id';
    try {
      let result;
      if (startDate && endDate) {
        result = await this.transactionTrackingService.getTransactionsByDateRange(
          new Date(startDate),
          new Date(endDate)
        );
      } else {
        result = await this.transactionTrackingService.getUserTransactions(userId);
      }
      if (!result.success) {
        throw new HttpException(
          result.error.message,
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }
      return { payments: result.data };
    } catch (error: any) {
      throw new HttpException(
        error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  @Get(':id')
  async getPayment(@Param('id') id: string) {
    try {
      const result = await this.transactionTrackingService.getTransaction(id);
      if (!result.success) {
        throw new HttpException(
          result.error.message,
          HttpStatus.NOT_FOUND
        );
      }
      return { payment: result.data };
    } catch (error: any) {
      throw new HttpException(
        error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
