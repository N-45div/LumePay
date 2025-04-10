import { Request, Response, NextFunction } from 'express';
import { solanaPayService } from '../../services/solana-pay.service';
import logger from '../../utils/logger';
import { BadRequestError } from '../../utils/errors';
import { z } from 'zod';

const createPaymentRequestSchema = z.object({
  recipient: z.string().min(32).max(44),
  amount: z.number().positive(),
  currency: z.string().optional().default('USDC'),
  memo: z.string().optional(),
  label: z.string().optional(),
  message: z.string().optional(),
  expiryMinutes: z.number().int().positive().optional().default(10)
});

const createEscrowPaymentSchema = z.object({
  sellerId: z.string().uuid(),
  buyerId: z.string().uuid(),
  sellerWalletAddress: z.string().min(32).max(44),
  buyerWalletAddress: z.string().min(32).max(44),
  amount: z.number().positive(),
  listingId: z.string(),
  currency: z.string().optional().default('USDC'),
  memo: z.string().optional()
});

export async function createPaymentRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const validationResult = createPaymentRequestSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      throw new BadRequestError(validationResult.error.message);
    }
    
    const { recipient, amount, currency, memo, label, message, expiryMinutes } = req.body;
    
    const result = await solanaPayService.createPaymentRequest(
      recipient,
      amount,
      currency,
      memo,
      label,
      message,
      expiryMinutes
    );
    
    return res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

export async function checkPaymentStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { paymentId } = req.params;
    
    if (!paymentId) {
      throw new BadRequestError('Payment ID is required');
    }
    
    const result = await solanaPayService.checkPaymentStatus(paymentId);
    
    return res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

export async function createEscrowPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const validationResult = createEscrowPaymentSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      throw new BadRequestError(validationResult.error.message);
    }
    
    const {
      sellerId,
      buyerId,
      sellerWalletAddress,
      buyerWalletAddress,
      amount,
      listingId,
      currency,
      memo
    } = req.body;
    
    const result = await solanaPayService.createEscrowPayment(
      sellerId,
      buyerId,
      sellerWalletAddress,
      buyerWalletAddress,
      amount,
      listingId,
      currency,
      memo
    );
    
    return res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

export default {
  createPaymentRequest,
  checkPaymentStatus,
  createEscrowPayment
};
