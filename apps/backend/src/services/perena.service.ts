import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { NotFoundError, BadRequestError } from '../utils/errors';
import * as walletsRepository from '../db/wallets.repository';
import * as transactionsRepository from '../db/transactions.repository';
import * as notificationsService from './notifications.service';
import { TransactionType, TransactionStatus } from '../types';
import cacheService from './cache.service';

interface PerenaConfig {
  apiKey: string;
  apiUrl: string;
  isProduction: boolean;
}

interface YieldData {
  walletAddress: string;
  totalYield: number;
  currentAPY: number;
  lastDistribution: Date;
  nextDistribution: Date;
}

interface SwapRequest {
  userId: string;
  walletAddress: string;
  amount: number;
  fromToken: 'USDC' | 'USD*';
  toToken: 'USDC' | 'USD*';
}

interface SwapResult {
  transactionId: string;
  userId: string;
  walletAddress: string;
  fromAmount: number;
  fromToken: string;
  toAmount: number;
  toToken: string;
  fee: number;
  status: 'completed' | 'pending' | 'failed';
  timestamp: Date;
}

class PerenaService {
  private config: PerenaConfig;
  private cacheKeyPrefix = 'perena:';
  private yieldCacheTTL = 60 * 5; // 5 minutes

  constructor() {
    this.config = {
      apiKey: process.env.PERENA_API_KEY || '',
      apiUrl: process.env.PERENA_API_URL || 'https://api.perena.io/v1',
      isProduction: process.env.NODE_ENV === 'production'
    };

    if (!this.config.apiKey && this.config.isProduction) {
      logger.error('Perena API key is not configured. USD* features will not work in production mode.');
    }
  }

  /**
   * Get the current yield data for a wallet
   */
  async getYieldData(walletAddress: string): Promise<YieldData> {
    const cacheKey = `${this.cacheKeyPrefix}yield:${walletAddress}`;
    
    const cachedData = await cacheService.get<YieldData>(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    try {
      if (this.config.isProduction && this.config.apiKey) {
        const response = await axios.get(
          `${this.config.apiUrl}/yield/${walletAddress}`,
          {
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        const data = response.data as unknown as YieldData;
        await cacheService.set(cacheKey, data, { ttl: this.yieldCacheTTL });
        return data;
      }
      
      const simulatedData: YieldData = {
        walletAddress,
        totalYield: Math.random() * 100,
        currentAPY: 4.5 + (Math.random() * 1.5),
        lastDistribution: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        nextDistribution: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      };
      
      await cacheService.set(cacheKey, simulatedData, { ttl: this.yieldCacheTTL });
      return simulatedData;
    } catch (error) {
      logger.error(`Error fetching yield data for wallet ${walletAddress}:`, error);
      throw new BadRequestError(`Failed to retrieve yield data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Swap tokens between USDC and USD*
   */
  async swapTokens(request: SwapRequest): Promise<SwapResult> {
    try {
      if (request.amount <= 0) {
        throw new BadRequestError('Swap amount must be greater than zero');
      }
      
      if (request.fromToken === request.toToken) {
        throw new BadRequestError('Cannot swap to the same token type');
      }

      const wallet = await walletsRepository.findByUserIdAndCurrency(
        request.userId,
        request.fromToken === 'USDC' ? 'USDC' : 'USD*'
      );
      
      if (!wallet || (wallet.balance || 0) < request.amount) {
        throw new BadRequestError(`Insufficient ${request.fromToken} balance`);
      }

      const feePercentage = 0.1; // 0.1%
      const fee = request.amount * (feePercentage / 100);
      const exchangeRate = request.fromToken === 'USDC' ? 0.995 : 1.005; // Slight difference for the swap
      const toAmount = (request.amount - fee) * exchangeRate;
      let swapResult: SwapResult;
      
      if (this.config.isProduction && this.config.apiKey) {
        const response = await axios.post(
          `${this.config.apiUrl}/swap`,
          {
            walletAddress: request.walletAddress,
            amount: request.amount,
            fromToken: request.fromToken,
            toToken: request.toToken
          },
          {
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        swapResult = response.data as SwapResult;
      } else {
        swapResult = {
          transactionId: uuidv4(),
          userId: request.userId,
          walletAddress: request.walletAddress,
          fromAmount: request.amount,
          fromToken: request.fromToken,
          toAmount,
          toToken: request.toToken,
          fee,
          status: 'completed',
          timestamp: new Date()
        };
      }

      await walletsRepository.updateBalance(
        request.userId,
        request.fromToken === 'USDC' ? 'USDC' : 'USD*',
        (wallet.balance || 0) - request.amount
      );
      
      const destWallet = await walletsRepository.findByUserIdAndCurrency(
        request.userId,
        request.toToken === 'USDC' ? 'USDC' : 'USD*'
      );
      
      if (!destWallet) {
        await walletsRepository.create({
          userId: request.userId,
          walletId: `${request.userId}-${request.toToken}-${uuidv4().slice(0, 8)}`,
          type: 'user',
          address: wallet.address,
          currency: request.toToken === 'USDC' ? 'USDC' : 'USD*',
          balance: toAmount,
          walletAddress: request.walletAddress,
          isActive: true
        });
      } else {
        await walletsRepository.updateBalance(
          request.userId,
          request.toToken === 'USDC' ? 'USDC' : 'USD*',
          (destWallet.balance || 0) + toAmount
        );
      }

      await transactionsRepository.create({
        userId: request.userId,
        type: TransactionType.SWAP,
        amount: request.amount,
        currency: request.fromToken === 'USDC' ? 'USDC' : 'USD*',
        status: 'completed' as TransactionStatus,
        transactionHash: swapResult.transactionId,
        metadata: {
          fromToken: request.fromToken,
          toToken: request.toToken,
          fromAmount: request.amount,
          toAmount,
          fee
        }
      } as any);

      await notificationsService.createTransactionNotification(
        request.userId,
        `Successfully swapped ${request.amount} ${request.fromToken} to ${toAmount.toFixed(2)} ${request.toToken}`,
        {
          transactionId: swapResult.transactionId,
          transactionType: 'swap',
          fromToken: request.fromToken,
          toToken: request.toToken,
          fromAmount: request.amount,
          toAmount,
          fee
        }
      );

      return swapResult;
    } catch (error) {
      logger.error(`Error swapping tokens:`, error);
      throw new BadRequestError(`Failed to swap tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Distribute yield to USD* holders
   * This would typically be called by a scheduled job
   */
  async distributeYield(): Promise<number> {
    try {
      if (this.config.isProduction && this.config.apiKey) {
        const response = await axios.post(
          `${this.config.apiUrl}/distribute-yield`,
          {},
          {
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        const data = response.data as unknown as { distributedAmount: number };
        return data.distributedAmount;
      }

      const wallets = await walletsRepository.findAllByCurrency('USD*');
      let totalDistributed = 0;

      for (const wallet of wallets) {
        if ((wallet.balance || 0) <= 0) continue;

        const dailyRate = 0.05 / 365;
        const yieldAmount = (wallet.balance || 0) * dailyRate;
        
        await walletsRepository.updateBalance(
          wallet.userId,
          'USD*',
          (wallet.balance || 0) + yieldAmount
        );

        await transactionsRepository.create({
          userId: wallet.userId,
          type: TransactionType.YIELD,
          amount: yieldAmount,
          currency: 'USD*',
          status: 'completed' as TransactionStatus,
          transactionHash: `yield-${uuidv4()}`,
          metadata: {
            apy: 0.05,
            baseBalance: wallet.balance || 0,
            distributionDate: new Date()
          }
        } as any);

        await notificationsService.createTransactionNotification(
          wallet.userId,
          `You earned ${yieldAmount.toFixed(4)} USD* yield on your ${(wallet.balance || 0).toFixed(2)} USD* balance`,
          {
            yieldAmount,
            baseBalance: wallet.balance || 0,
            apy: 0.05,
            distributionDate: new Date()
          }
        );

        totalDistributed += yieldAmount;
      }

      logger.info(`Distributed yield to ${wallets.length} wallets, total amount: ${totalDistributed}`);
      return totalDistributed;
    } catch (error) {
      logger.error('Error distributing yield:', error);
      throw new BadRequestError(`Failed to distribute yield: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current APY for USD*
   */
  async getCurrentAPY(): Promise<number> {
    const cacheKey = `${this.cacheKeyPrefix}current_apy`;

    const cachedAPY = await cacheService.get<number>(cacheKey);
    if (cachedAPY !== null) {
      return cachedAPY;
    }

    try {
      if (this.config.isProduction && this.config.apiKey) {
        const response = await axios.get(
          `${this.config.apiUrl}/apy`,
          {
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        const data = response.data as unknown as { apy: number };
        await cacheService.set(cacheKey, data.apy, { ttl: this.yieldCacheTTL });
        return data.apy;
      }
      
      const simulatedAPY = 4.5 + (Math.random() * 1.5);
      await cacheService.set(cacheKey, simulatedAPY, { ttl: this.yieldCacheTTL });
      return simulatedAPY;
    } catch (error) {
      logger.error('Error fetching current APY:', error);
      throw new BadRequestError(`Failed to retrieve current APY: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export const perenaService = new PerenaService();
export default perenaService;
