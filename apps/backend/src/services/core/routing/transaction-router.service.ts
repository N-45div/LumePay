// apps/backend/src/services/core/routing/transaction-router.service.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../../../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { Result, createSuccessResult, createErrorResult } from '../../../common/types/result.types';
import { TransactionStatus } from '../../../common/types/transaction.types';
import { 
  ITransactionRouter, 
  RoutingRequest, 
  TransactionRoute, 
  RouteType,
  RoutingErrorCode
} from './transaction-routing.interface';
import { FiatBridgeService } from '../payment/fiat-bridge.service';

@Injectable()
export class TransactionRouterService implements ITransactionRouter {
  private readonly logger = new Logger(TransactionRouterService.name);
  private readonly supportedFiatCurrencies: string[];
  private readonly supportedCryptoCurrencies: string[];
  private readonly routeCache: Map<string, { 
    route: TransactionRoute, 
    expiresAt: Date 
  }> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly fiatBridgeService: FiatBridgeService,
  ) {
    this.supportedFiatCurrencies = this.configService.get<string[]>('payment.supportedFiatCurrencies', ['USD', 'EUR', 'GBP']);
    this.supportedCryptoCurrencies = this.configService.get<string[]>('payment.supportedCryptoCurrencies', ['USDC', 'SOL', 'BTC', 'ETH']);
    
    this.logger.info(`TransactionRouterService initialized with ${this.supportedFiatCurrencies.length} fiat currencies and ${this.supportedCryptoCurrencies.length} cryptocurrencies`);
  }

  async findRoutes(request: RoutingRequest): Promise<Result<TransactionRoute[]>> {
    try {
      this.logger.debug(`Finding routes for transaction: ${JSON.stringify(request)}`);
      
      const validationResult = this.validateRequest(request);
      if (!validationResult.valid) {
        return createErrorResult(
          validationResult.errorCode || RoutingErrorCode.INSUFFICIENT_DATA,
          validationResult.errorMessage || 'Invalid routing request',
          validationResult.details || {}
        );
      }
      
      const routes: TransactionRoute[] = [];
      
      const isFiatToFiat = this.isFiatCurrency(request.sourceCurrency) && this.isFiatCurrency(request.destinationCurrency);
      const isCryptoToCrypto = this.isCryptoCurrency(request.sourceCurrency) && this.isCryptoCurrency(request.destinationCurrency);
      const isFiatToCrypto = this.isFiatCurrency(request.sourceCurrency) && this.isCryptoCurrency(request.destinationCurrency);
      const isCryptoToFiat = this.isCryptoCurrency(request.sourceCurrency) && this.isFiatCurrency(request.destinationCurrency);
      
      if (isFiatToFiat) {
        routes.push(await this.generateFiatRoute(request));
        
        if (this.canConvertToCrypto(request.sourceCurrency) && this.canConvertToCrypto(request.destinationCurrency)) {
          routes.push(await this.generateHybridRoute(request));
        }
      } else if (isCryptoToCrypto) {
        routes.push(await this.generateCryptoRoute(request));
      } else if (isFiatToCrypto) {
        routes.push(await this.generateFiatToCryptoRoute(request));
      } else if (isCryptoToFiat) {
        routes.push(await this.generateCryptoToFiatRoute(request));
      }
      
      if (routes.length === 0) {
        return createErrorResult(
          RoutingErrorCode.NO_ROUTE_FOUND,
          `No routes found for ${request.sourceCurrency} to ${request.destinationCurrency}`,
          { request: JSON.stringify(request) }
        );
      }
      
      routes.sort((a, b) => b.score - a.score);
      
      routes.forEach(route => {
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 5);
        this.routeCache.set(route.id, { route, expiresAt });
      });
      
      return createSuccessResult(routes);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorDetails: Record<string, any> = {
        errorType: error instanceof Error ? 'Error' : typeof error,
        message: errorMessage
      };
      
      this.logger.error(`Error finding routes: ${errorMessage}`, errorStack ? { stack: errorStack } : undefined);
      return createErrorResult(
        RoutingErrorCode.NO_ROUTE_FOUND,
        `Error finding routes: ${errorMessage}`,
        errorDetails
      );
    }
  }

  async getBestRoute(request: RoutingRequest): Promise<Result<TransactionRoute>> {
    try {
      const routesResult = await this.findRoutes(request);
      
      if (!routesResult.success) {
        return createErrorResult(
          routesResult.error?.code || RoutingErrorCode.NO_ROUTE_FOUND,
          routesResult.error?.message || 'Error finding routes',
          routesResult.error?.details || {}
        );
      }
      
      const routes = routesResult.data || [];
      
      if (routes.length === 0) {
        return createErrorResult(
          RoutingErrorCode.NO_ROUTE_FOUND,
          'No routes available for the specified criteria',
          { request: JSON.stringify(request) }
        );
      }
      
      const adjustedRoutes = this.applyUserPreferences(routes, request.preferences);
      const bestRoute = adjustedRoutes[0];
      
      return createSuccessResult(bestRoute);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorDetails: Record<string, any> = {
        errorType: error instanceof Error ? 'Error' : typeof error,
        message: errorMessage
      };
      
      this.logger.error(`Error getting best route: ${errorMessage}`, errorStack ? { stack: errorStack } : undefined);
      return createErrorResult(
        RoutingErrorCode.NO_ROUTE_FOUND,
        `Error getting best route: ${errorMessage}`,
        errorDetails
      );
    }
  }

  async getRouteById(routeId: string): Promise<Result<TransactionRoute>> {
    try {
      const cachedRoute = this.routeCache.get(routeId);
      
      if (!cachedRoute) {
        return createErrorResult(
          RoutingErrorCode.NO_ROUTE_FOUND,
          `Route with ID ${routeId} not found`,
          { routeId }
        );
      }
      
      if (cachedRoute.expiresAt < new Date()) {
        this.routeCache.delete(routeId);
        return createErrorResult(
          RoutingErrorCode.NO_ROUTE_FOUND,
          `Route with ID ${routeId} has expired`,
          { routeId, expiredAt: cachedRoute.expiresAt }
        );
      }
      
      return createSuccessResult(cachedRoute.route);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorDetails: Record<string, any> = {
        errorType: error instanceof Error ? 'Error' : typeof error,
        message: errorMessage
      };
      
      this.logger.error(`Error getting route by ID: ${errorMessage}`, errorStack ? { stack: errorStack } : undefined);
      return createErrorResult(
        RoutingErrorCode.NO_ROUTE_FOUND,
        `Error getting route by ID: ${errorMessage}`,
        errorDetails
      );
    }
  }

  async validateRoute(routeId: string): Promise<Result<boolean>> {
    try {
      const routeResult = await this.getRouteById(routeId);
      
      if (!routeResult.success) {
        return createSuccessResult(false);
      }
      
      return createSuccessResult(true);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorDetails: Record<string, any> = {
        errorType: error instanceof Error ? 'Error' : typeof error,
        message: errorMessage
      };
      
      this.logger.error(`Error validating route: ${errorMessage}`, errorStack ? { stack: errorStack } : undefined);
      return createErrorResult(
        RoutingErrorCode.NO_ROUTE_FOUND,
        `Error validating route: ${errorMessage}`,
        errorDetails
      );
    }
  }

  private async generateFiatRoute(request: RoutingRequest): Promise<TransactionRoute> {
    const routeId = uuidv4();
    const feePercentage = 0.01; // 1%
    const feeAmount = request.sourceAmount * feePercentage;
    const estimatedTimeSeconds = 86400; // 24 hours
    
    return {
      id: routeId,
      type: RouteType.FIAT_ONLY,
      processors: ['stripe'],
      estimatedTimeSeconds,
      estimatedFees: {
        amount: feeAmount,
        currency: request.sourceCurrency,
        breakdown: {
          processorFees: feeAmount * 0.7, // 70% of fees
          networkFees: 0,
          platformFees: feeAmount * 0.3, // 30% of fees
        }
      },
      score: 70,
      confidenceLevel: 90,
      riskLevel: 10,
      metadata: {
        routeType: 'fiat_transfer',
        sourceType: request.sourceType,
        destinationType: request.destinationType
      }
    };
  }

  private async generateCryptoRoute(request: RoutingRequest): Promise<TransactionRoute> {
    const routeId = uuidv4();
    const feePercentage = 0.003; // 0.3%
    const feeAmount = request.sourceAmount * feePercentage;
    const estimatedTimeSeconds = 20; // 20 seconds for Solana
    
    return {
      id: routeId,
      type: RouteType.CRYPTO_ONLY,
      processors: ['solana'],
      estimatedTimeSeconds,
      estimatedFees: {
        amount: feeAmount,
        currency: request.sourceCurrency,
        breakdown: {
          processorFees: 0,
          networkFees: feeAmount * 0.8, // 80% of fees
          platformFees: feeAmount * 0.2, // 20% of fees
        }
      },
      score: 90,
      confidenceLevel: 95,
      riskLevel: 5,
      metadata: {
        routeType: 'crypto_transfer',
        blockchain: 'solana',
        sourceType: request.sourceType,
        destinationType: request.destinationType
      }
    };
  }

  private async generateHybridRoute(request: RoutingRequest): Promise<TransactionRoute> {
    const routeId = uuidv4();
    const feePercentage = 0.015; // 1.5%
    const feeAmount = request.sourceAmount * feePercentage;
    const estimatedTimeSeconds = 3600; // 1 hour
    
    return {
      id: routeId,
      type: RouteType.HYBRID,
      processors: ['stripe', 'solana'],
      estimatedTimeSeconds,
      estimatedFees: {
        amount: feeAmount,
        currency: request.sourceCurrency,
        breakdown: {
          processorFees: feeAmount * 0.4, // 40% of fees
          networkFees: feeAmount * 0.3, // 30% of fees
          platformFees: feeAmount * 0.3, // 30% of fees
        }
      },
      score: 60,
      confidenceLevel: 85,
      riskLevel: 15,
      metadata: {
        routeType: 'hybrid_transfer',
        intermediateCurrency: 'USDC',
        sourceType: request.sourceType,
        destinationType: request.destinationType
      }
    };
  }

  private async generateFiatToCryptoRoute(request: RoutingRequest): Promise<TransactionRoute> {
    const routeId = uuidv4();
    const feePercentage = 0.008; // 0.8%
    const feeAmount = request.sourceAmount * feePercentage;
    const estimatedTimeSeconds = 600; // 10 minutes
    
    return {
      id: routeId,
      type: RouteType.HYBRID,
      processors: ['stripe', 'solana'],
      estimatedTimeSeconds,
      estimatedFees: {
        amount: feeAmount,
        currency: request.sourceCurrency,
        breakdown: {
          processorFees: feeAmount * 0.5, // 50% of fees
          networkFees: feeAmount * 0.2, // 20% of fees
          platformFees: feeAmount * 0.3, // 30% of fees
        }
      },
      score: 80,
      confidenceLevel: 90,
      riskLevel: 10,
      metadata: {
        routeType: 'fiat_to_crypto',
        sourceType: request.sourceType,
        destinationType: request.destinationType
      }
    };
  }

  private async generateCryptoToFiatRoute(request: RoutingRequest): Promise<TransactionRoute> {
    const routeId = uuidv4();
    const feePercentage = 0.01; // 1%
    const feeAmount = request.sourceAmount * feePercentage;
    const estimatedTimeSeconds = 3600; // 1 hour
    
    return {
      id: routeId,
      type: RouteType.HYBRID,
      processors: ['solana', 'stripe'],
      estimatedTimeSeconds,
      estimatedFees: {
        amount: feeAmount,
        currency: request.sourceCurrency,
        breakdown: {
          processorFees: feeAmount * 0.4, // 40% of fees
          networkFees: feeAmount * 0.2, // 20% of fees
          platformFees: feeAmount * 0.4, // 40% of fees
        }
      },
      score: 75,
      confidenceLevel: 85,
      riskLevel: 15,
      metadata: {
        routeType: 'crypto_to_fiat',
        sourceType: request.sourceType,
        destinationType: request.destinationType
      }
    };
  }

  private applyUserPreferences(
    routes: TransactionRoute[], 
    preferences?: RoutingRequest['preferences']
  ): TransactionRoute[] {
    if (!preferences) {
      return routes;
    }
    
    const adjustedRoutes = routes.map(route => {
      let adjustedScore = route.score;
      
      if (preferences.prioritizeFee) {
        const feeBoost = 20 * (1 - (route.estimatedFees.amount / routes[0].estimatedFees.amount));
        adjustedScore += feeBoost;
      }
      
      if (preferences.prioritizeSpeed) {
        const speedBoost = 20 * (1 - (route.estimatedTimeSeconds / routes[0].estimatedTimeSeconds));
        adjustedScore += speedBoost;
      }
      
      if (preferences.preferredRouteType && route.type === preferences.preferredRouteType) {
        adjustedScore += 15;
      }
      
      if (preferences.maxFeeAmount && route.estimatedFees.amount > preferences.maxFeeAmount) {
        adjustedScore = 0;
      }
      
      if (preferences.minConfidenceLevel && route.confidenceLevel < preferences.minConfidenceLevel) {
        adjustedScore = 0;
      }
      
      return {
        ...route,
        score: adjustedScore
      };
    });
    
    adjustedRoutes.sort((a, b) => b.score - a.score);
    
    return adjustedRoutes.filter(route => route.score > 0);
  }

  private validateRequest(request: RoutingRequest): { 
    valid: boolean; 
    errorCode?: RoutingErrorCode; 
    errorMessage?: string;
    details?: Record<string, any>;
  } {
    if (!request.userId) {
      return { 
        valid: false, 
        errorCode: RoutingErrorCode.INSUFFICIENT_DATA, 
        errorMessage: 'User ID is required',
        details: { missingField: 'userId' }
      };
    }
    
    if (!request.sourceAmount || request.sourceAmount <= 0) {
      return { 
        valid: false, 
        errorCode: RoutingErrorCode.INSUFFICIENT_DATA, 
        errorMessage: 'Source amount must be a positive number',
        details: { invalidField: 'sourceAmount', value: request.sourceAmount }
      };
    }
    
    if (!request.sourceCurrency) {
      return { 
        valid: false, 
        errorCode: RoutingErrorCode.INSUFFICIENT_DATA, 
        errorMessage: 'Source currency is required',
        details: { missingField: 'sourceCurrency' }
      };
    }
    
    if (!this.isSupportedCurrency(request.sourceCurrency)) {
      return { 
        valid: false, 
        errorCode: RoutingErrorCode.UNSUPPORTED_CURRENCY, 
        errorMessage: `Source currency ${request.sourceCurrency} is not supported`,
        details: { 
          invalidField: 'sourceCurrency', 
          value: request.sourceCurrency,
          supportedFiatCurrencies: this.supportedFiatCurrencies,
          supportedCryptoCurrencies: this.supportedCryptoCurrencies
        }
      };
    }
    
    if (!request.destinationCurrency) {
      return { 
        valid: false, 
        errorCode: RoutingErrorCode.INSUFFICIENT_DATA, 
        errorMessage: 'Destination currency is required',
        details: { missingField: 'destinationCurrency' }
      };
    }
    
    if (!this.isSupportedCurrency(request.destinationCurrency)) {
      return { 
        valid: false, 
        errorCode: RoutingErrorCode.UNSUPPORTED_CURRENCY, 
        errorMessage: `Destination currency ${request.destinationCurrency} is not supported`,
        details: { 
          invalidField: 'destinationCurrency', 
          value: request.destinationCurrency,
          supportedFiatCurrencies: this.supportedFiatCurrencies,
          supportedCryptoCurrencies: this.supportedCryptoCurrencies
        }
      };
    }
    
    return { valid: true };
  }

  private isFiatCurrency(currency: string): boolean {
    return this.supportedFiatCurrencies.includes(currency);
  }

  private isCryptoCurrency(currency: string): boolean {
    return this.supportedCryptoCurrencies.includes(currency);
  }

  private isSupportedCurrency(currency: string): boolean {
    return this.isFiatCurrency(currency) || this.isCryptoCurrency(currency);
  }

  private canConvertToCrypto(currency: string): boolean {
    return this.isFiatCurrency(currency);
  }
}
