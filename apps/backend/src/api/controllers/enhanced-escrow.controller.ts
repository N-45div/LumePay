import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as escrowsService from '../../services/escrows.service';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../utils/errors';
import { DisputeResolutionMode } from '../../types';

const createMultiSigEscrowSchema = z.object({
  listingId: z.string().uuid(),
  requiredSignatures: z.number().int().min(2).max(3).optional()
});

const timeLockedEscrowSchema = z.object({
  escrowId: z.string().uuid(),
  unlockTimeInDays: z.number().int().min(1).max(365)
});

const signMultiSigSchema = z.object({
  role: z.enum(['buyer', 'seller', 'admin'])
});

const disputeResolutionSchema = z.object({
  mode: z.enum([
    'manual',
    'auto_buyer',
    'auto_seller',
    'auto_split',
    'auto_reputation'
  ]),
  autoResolveAfterDays: z.number().int().min(1).max(30).optional()
});

/**
 * Create an escrow with multi-signature protection
 */
export const createMultiSigEscrow = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      throw new ForbiddenError('Authentication required');
    }
    
    const validationResult = createMultiSigEscrowSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new BadRequestError(validationResult.error.message);
    }
    
    const { listingId, requiredSignatures } = validationResult.data;
    
    const escrow = await escrowsService.createEscrow(userId, listingId, {
      isMultiSig: true
    });
    
    res.status(201).json({
      ...escrow,
      message: 'Multi-signature escrow created. Signatures required before funding.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a time-locked escrow
 */
export const createTimeLockedEscrow = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      throw new ForbiddenError('Authentication required');
    }
    
    const validationResult = timeLockedEscrowSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new BadRequestError(validationResult.error.message);
    }
    
    const { escrowId, unlockTimeInDays } = validationResult.data;
    
    const updatedEscrow = await escrowsService.createTimeLockedEscrow(
      escrowId,
      userId,
      unlockTimeInDays
    );
    
    res.json({
      ...updatedEscrow,
      message: `Escrow time-locked for ${unlockTimeInDays} days`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Sign a multi-signature escrow
 */
export const signMultiSigEscrow = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    
    if (!userId) {
      throw new ForbiddenError('Authentication required');
    }
    
    const validationResult = signMultiSigSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new BadRequestError(validationResult.error.message);
    }
    
    const { role } = validationResult.data;
    
    const updatedEscrow = await escrowsService.signMultiSigEscrow(id, role);
    
    res.json({
      ...updatedEscrow,
      message: `Escrow signed by ${role}`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Set dispute resolution mode for an escrow
 */
export const setDisputeResolutionMode = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    
    if (!userId) {
      throw new ForbiddenError('Authentication required');
    }
    
    const validationResult = disputeResolutionSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new BadRequestError(validationResult.error.message);
    }
    
    const { mode, autoResolveAfterDays } = validationResult.data;
    
    const resolutionMode = mode as unknown as DisputeResolutionMode;
    
    const updatedEscrow = await escrowsService.setDisputeResolutionMode(
      id,
      userId,
      resolutionMode,
      autoResolveAfterDays
    );
    
    res.json({
      ...updatedEscrow,
      message: `Dispute resolution mode set to ${mode}`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Manually trigger time-locked escrow processing (admin only)
 */
export const processTimeLockedEscrows = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      throw new ForbiddenError('Authentication required');
    }
    
    const user = await import('../../db/users.repository').then(repo => repo.findById(userId));
    if (!user?.isAdmin) {
      throw new ForbiddenError('Admin privileges required');
    }
    
    await escrowsService.processTimeLockedEscrows();
    
    res.json({
      success: true,
      message: 'Time-locked escrows processed'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Manually trigger auto dispute resolution processing (admin only)
 */
export const processAutoDisputeResolution = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      throw new ForbiddenError('Authentication required');
    }
    
    const user = await import('../../db/users.repository').then(repo => repo.findById(userId));
    if (!user?.isAdmin) {
      throw new ForbiddenError('Admin privileges required');
    }
    
    await escrowsService.processAutoDisputeResolution();
    
    res.json({
      success: true,
      message: 'Auto dispute resolutions processed'
    });
  } catch (error) {
    next(error);
  }
};
