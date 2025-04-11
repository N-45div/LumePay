import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../utils/errors';
import perenaService from '../../services/perena.service';
import * as walletsRepository from '../../db/wallets.repository';
import logger from '../../utils/logger';

// Schema for token swap
const swapSchema = z.object({
  amount: z.number().positive(),
  fromToken: z.enum(['USDC', 'USD*']),
  toToken: z.enum(['USDC', 'USD*'])
});

/**
 * Get yield data for the user's wallet
 */
export const getYieldData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      throw new ForbiddenError('Authentication required');
    }
    
    // Get the user's wallet
    const wallet = await walletsRepository.findByUserIdAndCurrency(userId, 'USD*');
    
    if (!wallet || !wallet.walletAddress) {
      throw new NotFoundError('No USD* wallet found for user');
    }
    
    const yieldData = await perenaService.getYieldData(wallet.walletAddress);
    
    res.json({
      success: true,
      data: yieldData
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current APY for USD* token
 */
export const getCurrentAPY = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const apy = await perenaService.getCurrentAPY();
    
    res.json({
      success: true,
      apy
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Swap tokens between USDC and USD*
 */
export const swapTokens = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      throw new ForbiddenError('Authentication required');
    }
    
    const validationResult = swapSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new BadRequestError(validationResult.error.message);
    }
    
    const { amount, fromToken, toToken } = validationResult.data;
    
    // Verify the tokens are different
    if (fromToken === toToken) {
      throw new BadRequestError('Cannot swap to the same token type');
    }
    
    // Get wallet for the source token
    const wallet = await walletsRepository.findByUserIdAndCurrency(userId, fromToken);
    
    if (!wallet || !wallet.walletAddress) {
      throw new NotFoundError(`No ${fromToken} wallet found for user`);
    }
    
    // Verify wallet has sufficient funds
    if ((wallet.balance || 0) < amount) {
      throw new BadRequestError(`Insufficient ${fromToken} balance`);
    }
    
    const swapResult = await perenaService.swapTokens({
      userId,
      walletAddress: wallet.walletAddress,
      amount,
      fromToken,
      toToken
    });
    
    res.status(200).json({
      success: true,
      data: swapResult
    });
  } catch (error) {
    logger.error('Error in swapTokens:', error);
    next(error);
  }
};

/**
 * Admin endpoint to manually trigger yield distribution (typically handled by a scheduled job)
 */
export const distributeYield = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      throw new ForbiddenError('Authentication required');
    }
    
    // Verify if user is admin
    const user = await import('../../db/users.repository').then(repo => repo.findById(userId));
    if (!user?.isAdmin) {
      throw new ForbiddenError('Admin privileges required');
    }
    
    const distributedAmount = await perenaService.distributeYield();
    
    res.json({
      success: true,
      message: `Yield distributed successfully`,
      data: {
        totalAmount: distributedAmount
      }
    });
  } catch (error) {
    next(error);
  }
};
