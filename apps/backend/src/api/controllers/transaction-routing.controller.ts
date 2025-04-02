import { Controller, Post, Body, Get, Param, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Logger } from '../../utils/logger';
import { AuthGuard } from '../../guards/auth.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { TransactionRouterService } from '../../services/core/routing/transaction-router.service';
import { RoutingRequest, RoutingErrorCode, RouteType } from '../../services/core/routing/transaction-routing.interface';
class RouteRequestDto implements Partial<RoutingRequest> {
  sourceAmount: number;
  sourceCurrency: string;
  sourceType?: 'BANK_ACCOUNT' | 'WALLET' | 'CARD';
  sourceId?: string;
  destinationAmount?: number;
  destinationCurrency: string;
  destinationType?: 'BANK_ACCOUNT' | 'WALLET' | 'EMAIL' | 'PHONE';
  destinationId?: string;
  preferences?: {
    prioritizeFee?: boolean;
    prioritizeSpeed?: boolean;
    preferredRouteType?: RouteType;
    maxFeeAmount?: number;
    minConfidenceLevel?: number;
  };
  purpose?: 'PAYMENT' | 'TRANSFER' | 'EXCHANGE' | 'SCHEDULED';
  metadata?: Record<string, any>;
}
@ApiTags('Transaction Routing')
@ApiBearerAuth()
@Controller('api/routing')
export class TransactionRoutingController {
  private readonly logger = new Logger(TransactionRoutingController.name);
  constructor(
    private readonly transactionRouterService: TransactionRouterService
  ) {}
  @Post('routes')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Find all possible routes for a transaction' })
  @ApiResponse({ status: 200, description: 'Returns all possible routes for the transaction' })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiResponse({ status: 404, description: 'No routes found' })
  async findRoutes(
    @Body() routeRequestDto: RouteRequestDto,
    @CurrentUser() user: any
  ) {
    this.logger.info(`Finding routes for user ${user.id}`);
    if (routeRequestDto.preferences?.preferredRouteType && 
        typeof routeRequestDto.preferences.preferredRouteType === 'string') {
      routeRequestDto.preferences.preferredRouteType = 
        routeRequestDto.preferences.preferredRouteType as RouteType;
    }
    const routingRequest: RoutingRequest = {
      userId: user.id,
      ...routeRequestDto
    };
    const result = await this.transactionRouterService.findRoutes(routingRequest);
    if (!result.success) {
      let statusCode = HttpStatus.BAD_REQUEST;
      const errorCode = result.error?.code || RoutingErrorCode.INSUFFICIENT_DATA;
      if (errorCode === RoutingErrorCode.NO_ROUTE_FOUND) {
        statusCode = HttpStatus.NOT_FOUND;
      } else if (errorCode === RoutingErrorCode.UNSUPPORTED_CURRENCY) {
        statusCode = HttpStatus.BAD_REQUEST;
      } else if (errorCode === RoutingErrorCode.USER_RESTRICTIONS) {
        statusCode = HttpStatus.FORBIDDEN;
      } else if (errorCode === RoutingErrorCode.RATE_LIMIT_EXCEEDED) {
        statusCode = HttpStatus.TOO_MANY_REQUESTS;
      }
      throw new HttpException({
        status: statusCode,
        error: result.error?.message || 'Unknown error',
        code: errorCode,
        details: result.error?.details || {}
      }, statusCode);
    }
    return result.data;
  }
  @Post('best-route')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get the best route for a transaction' })
  @ApiResponse({ status: 200, description: 'Returns the best route for the transaction' })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiResponse({ status: 404, description: 'No route found' })
  async getBestRoute(
    @Body() routeRequestDto: RouteRequestDto,
    @CurrentUser() user: any
  ) {
    this.logger.info(`Finding best route for user ${user.id}`);
    if (routeRequestDto.preferences?.preferredRouteType && 
        typeof routeRequestDto.preferences.preferredRouteType === 'string') {
      routeRequestDto.preferences.preferredRouteType = 
        routeRequestDto.preferences.preferredRouteType as RouteType;
    }
    const routingRequest: RoutingRequest = {
      userId: user.id,
      ...routeRequestDto
    };
    const result = await this.transactionRouterService.getBestRoute(routingRequest);
    if (!result.success) {
      let statusCode = HttpStatus.BAD_REQUEST;
      const errorCode = result.error?.code || RoutingErrorCode.INSUFFICIENT_DATA;
      if (errorCode === RoutingErrorCode.NO_ROUTE_FOUND) {
        statusCode = HttpStatus.NOT_FOUND;
      } else if (errorCode === RoutingErrorCode.UNSUPPORTED_CURRENCY) {
        statusCode = HttpStatus.BAD_REQUEST;
      } else if (errorCode === RoutingErrorCode.USER_RESTRICTIONS) {
        statusCode = HttpStatus.FORBIDDEN;
      } else if (errorCode === RoutingErrorCode.RATE_LIMIT_EXCEEDED) {
        statusCode = HttpStatus.TOO_MANY_REQUESTS;
      }
      throw new HttpException({
        status: statusCode,
        error: result.error?.message || 'Unknown error',
        code: errorCode,
        details: result.error?.details || {}
      }, statusCode);
    }
    return result.data;
  }
  @Get('route/:routeId')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get a specific route by ID' })
  @ApiResponse({ status: 200, description: 'Returns the route' })
  @ApiResponse({ status: 404, description: 'Route not found' })
  async getRouteById(
    @Param('routeId') routeId: string,
    @CurrentUser() user: any
  ) {
    this.logger.info(`Getting route ${routeId} for user ${user.id}`);
    const result = await this.transactionRouterService.getRouteById(routeId);
    if (!result.success) {
      throw new HttpException({
        status: HttpStatus.NOT_FOUND,
        error: result.error?.message || 'Route not found',
        code: result.error?.code || RoutingErrorCode.NO_ROUTE_FOUND,
        details: result.error?.details || { routeId }
      }, HttpStatus.NOT_FOUND);
    }
    return result.data;
  }
  @Get('validate/:routeId')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Validate if a route is still valid' })
  @ApiResponse({ status: 200, description: 'Returns validation status' })
  async validateRoute(
    @Param('routeId') routeId: string,
    @CurrentUser() user: any
  ) {
    this.logger.info(`Validating route ${routeId} for user ${user.id}`);
    const result = await this.transactionRouterService.validateRoute(routeId);
    return {
      valid: result.success && result.data,
      routeId
    };
  }
}
