import { 
  Controller, 
  Get, 
  Post, 
  Put,
  Body, 
  Param, 
  Query,
  UseGuards,
  HttpException,
  HttpStatus,
  Req
} from '@nestjs/common';
import { FiatBridgeService, FiatTransferParams, FiatTransferResult } from '../../services/core/payment/fiat-bridge.service';
import { TransactionTrackingService } from '../../services/core/payment/transaction-tracking.service';
import { TransactionStatus } from '../../common/types/transaction.types';
import { isFailure } from '../../utils/result';
class TransferFundsDto implements Omit<FiatTransferParams, 'userId'> {
  amount: number;
  currency: string;
  sourceAccountId?: string;
  destinationAccountId?: string;
  description?: string;
  preferredProcessor?: string;
  metadata?: Record<string, any>;
}
class TransactionFilterDto {
  status?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}
class AuthGuard {
  canActivate() {
    return true;
  }
}
interface RequestWithUser extends Request {
  user: {
    id: string;
    email: string;
  };
}
@Controller('fiat-payments')
@UseGuards(AuthGuard)
export class FiatPaymentController {
  constructor(
    private fiatBridgeService: FiatBridgeService,
    private transactionTrackingService: TransactionTrackingService
  ) {}
  @Get('processors')
  async getAvailableProcessors(): Promise<any> {
    return { 
      success: true,
      processors: [
        {
          name: 'simulated_processor',
          supportedCurrencies: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'],
          features: ['payments', 'status_checks', 'cancellation']
        }
      ]
    };
  }
  @Post('transfer')
  async transferFunds(
    @Body() dto: TransferFundsDto,
    @Req() req: RequestWithUser
  ): Promise<any> {
    const transferParams: FiatTransferParams = {
      ...dto,
      userId: req.user.id
    };
    const result = await this.fiatBridgeService.transferFunds(transferParams);
    if (isFailure(result)) {
      throw new HttpException(
        result.error.message,
        HttpStatus.BAD_REQUEST
      );
    }
    return { 
      success: true, 
      transaction: result.data 
    };
  }
  @Get('status/:transactionId')
  async checkTransactionStatus(
    @Param('transactionId') transactionId: string
  ): Promise<any> {
    const result = await this.fiatBridgeService.checkTransactionStatus(transactionId);
    if (isFailure(result)) {
      throw new HttpException(
        result.error.message,
        HttpStatus.BAD_REQUEST
      );
    }
    return { 
      success: true, 
      transaction: result.data 
    };
  }
  @Put('cancel/:transactionId')
  async cancelTransaction(
    @Param('transactionId') transactionId: string
  ): Promise<any> {
    const result = await this.fiatBridgeService.cancelTransaction(transactionId);
    if (isFailure(result)) {
      throw new HttpException(
        result.error.message,
        HttpStatus.BAD_REQUEST
      );
    }
    return { 
      success: true, 
      transaction: result.data 
    };
  }
  @Get('history')
  async getTransactionHistory(
    @Query() filters: TransactionFilterDto,
    @Req() req: RequestWithUser
  ): Promise<any> {
    const startDate = filters.startDate ? new Date(filters.startDate) : undefined;
    const endDate = filters.endDate ? new Date(filters.endDate) : undefined;
    const status = filters.status as TransactionStatus | undefined;
    const result = await this.transactionTrackingService.getUserTransactions(req.user.id);
    if (isFailure(result)) {
      throw new HttpException(
        result.error.message,
        HttpStatus.BAD_REQUEST
      );
    }
    let transactions = result.data;
    if (status) {
      transactions = transactions.filter(t => t.status === status);
    }
    if (startDate) {
      transactions = transactions.filter(t => new Date(t.createdAt) >= startDate);
    }
    if (endDate) {
      transactions = transactions.filter(t => new Date(t.createdAt) <= endDate);
    }
    const total = transactions.length;
    const offset = filters.offset || 0;
    const limit = filters.limit || 20;
    const paginatedTransactions = transactions.slice(
      offset, 
      offset + limit
    );
    return { 
      success: true, 
      transactions: paginatedTransactions,
      pagination: {
        total,
        offset,
        limit
      }
    };
  }
  @Get('transactions/:transactionId')
  async getTransaction(
    @Param('transactionId') transactionId: string,
    @Req() req: RequestWithUser
  ): Promise<any> {
    const result = await this.transactionTrackingService.getTransaction(transactionId);
    if (isFailure(result)) {
      throw new HttpException(
        result.error.message,
        HttpStatus.BAD_REQUEST
      );
    }
    if (result.data.userId !== req.user.id) {
      throw new HttpException(
        'Unauthorized to access this transaction',
        HttpStatus.FORBIDDEN
      );
    }
    return { 
      success: true, 
      transaction: result.data 
    };
  }
}
