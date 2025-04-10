import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import reputationService from '../../services/reputation.service';
import * as reviewsRepository from '../../db/reviews.repository';
import * as reputationRecordsRepository from '../../db/reputation-records.repository';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';
import { VerificationLevel } from '../../types';

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      userId: string;
      walletAddress: string;
      isAdmin?: boolean;
      id?: string;
    };
  }
}

const submitReviewSchema = z.object({
  revieweeId: z.string().uuid(),
  escrowId: z.string().uuid().optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional()
});

const verifyUserSchema = z.object({
  walletAddress: z.string()
});

export const getReputationInfo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.params.userId;

    const reputationScore = await reputationService.recalculateReputationScore(userId);
    
    const user = await reputationService.updateUserVerificationLevel(userId, VerificationLevel.BASIC);
    
    const records = await reputationRecordsRepository.findByUserId(userId);
    
    const reviewsData = await reviewsRepository.getReviewsForUser(userId);
    
    res.json({
      userId,
      reputationScore,
      verificationLevel: user.verificationLevel,
      isVerified: user.isVerified,
      reviews: reviewsData.reviews,
      reviewCount: reviewsData.total,
      onChainRecords: records
    });
  } catch (error) {
    next(error);
  }
};

export const submitReview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reviewerId = req.user?.userId; // Use userId from req.user
    
    if (!reviewerId) {
      throw new UnauthorizedError('You must be logged in to submit a review');
    }
    
    const validationResult = submitReviewSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new BadRequestError(validationResult.error.message);
    }
    
    const { revieweeId, escrowId, rating, comment } = validationResult.data;
 
    if (escrowId) {
      const hasReviewed = await reviewsRepository.hasReviewedEscrow(reviewerId, escrowId);
      if (hasReviewed) {
        throw new BadRequestError('You have already submitted a review for this escrow');
      }
    }
    
    const review = await reviewsRepository.create({
      reviewerId,
      revieweeId,
      escrowId,
      rating,
      comment
    });
    
    await reputationService.recordReviewImpact(
      review.id,
      reviewerId,
      revieweeId,
      rating
    );
    
    res.status(201).json(review);
  } catch (error) {
    next(error);
  }
};

// Verify a user's on-chain reputation (admin only)
export const verifyUserReputation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = verifyUserSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new BadRequestError(validationResult.error.message);
    }
    
    const { walletAddress } = validationResult.data;
    
    const verificationResult = await reputationService.verifyOnChainReputation(walletAddress);
    
    res.json(verificationResult);
  } catch (error) {
    next(error);
  }
};

export const publishReputationOnChain = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
    
    if (!req.user?.isAdmin) {
      throw new UnauthorizedError('Only administrators can publish reputations on-chain');
    }
    
    if (!adminPrivateKey) {
      throw new BadRequestError('Admin private key not configured');
    }
    
    const transactionSignature = await reputationService.publishReputationOnChain(userId, adminPrivateKey);
    
    res.json({
      userId,
      transactionSignature,
      status: 'published'
    });
  } catch (error) {
    next(error);
  }
};

export const getReputationRecords = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const records = await reputationRecordsRepository.findByUserId(userId);
    
    res.json(records);
  } catch (error) {
    next(error);
  }
};
