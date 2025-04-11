import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BadRequestError, ForbiddenError } from '../../utils/errors';
import reclaimService from '../../services/reclaim.service';
import logger from '../../utils/logger';

const verifyProofSchema = z.object({
  reclaimProof: z.string(),
  proofType: z.string(),
  metadata: z.record(z.any()).optional()
});

export const verifyProof = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      throw new ForbiddenError('Authentication required');
    }
    
    const validationResult = verifyProofSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new BadRequestError(validationResult.error.message);
    }
    
    const { reclaimProof, proofType, metadata } = validationResult.data;
    
    const result = await reclaimService.verifyProof({
      userId,
      reclaimProof,
      proofType,
      metadata
    });
    
    res.json({
      success: result.success,
      data: result
    });
  } catch (error) {
    logger.error('Error in verifyProof:', error);
    next(error);
  }
};

export const getUserCredentials = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      throw new ForbiddenError('Authentication required');
    }
    
    const targetUserId = req.params.userId || userId;
    
    const credentials = await reclaimService.getUserCredentials(targetUserId);
    
    res.json({
      success: true,
      data: credentials
    });
  } catch (error) {
    logger.error('Error in getUserCredentials:', error);
    next(error);
  }
};

export const getVerificationStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      throw new ForbiddenError('Authentication required');
    }
    
    const targetUserId = req.params.userId || userId;
    
    const status = await reclaimService.getVerificationStatus(targetUserId);
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Error in getVerificationStatus:', error);
    next(error);
  }
};
