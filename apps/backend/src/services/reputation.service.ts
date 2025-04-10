import { Connection, PublicKey, Transaction, Keypair, sendAndConfirmTransaction } from '@solana/web3.js';
import { query } from '../db';
import * as usersRepository from '../db/users.repository';
import * as reviewsRepository from '../db/reviews.repository';
import * as reputationRecordsRepository from '../db/reputation-records.repository';
import * as notificationsService from '../services/notifications.service';
import logger from '../utils/logger';
import { NotFoundError, BlockchainError } from '../utils/errors';
import { VerificationLevel, NotificationType, ReputationRecord, User } from '../types';
import bs58 from 'bs58';

export interface ReputationScore {
  userId: string;
  walletAddress: string;
  score: number;
  successfulTransactions: number;
  totalTransactions: number;
  disputeRate: number;
  verifiedSince: Date;
  lastUpdated: Date;
}

export interface ReputationEvent {
  id: string;
  userId: string;
  walletAddress: string;
  eventType: 'TRANSACTION_COMPLETED' | 'DISPUTE_RESOLVED' | 'FEEDBACK_RECEIVED';
  impact: number;
  metadata: Record<string, any>;
  timestamp: Date;
}

class ReputationService {
  private connection: Connection;
  
  constructor() {
    this.connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');
  }
  
  async getReputationScore(userId: string): Promise<ReputationScore> {
    try {
      const user = await usersRepository.findById(userId);
      
      if (!user) {
        throw new NotFoundError(`User not found: ${userId}`);
      }
      
      const result = await query(
        'SELECT * FROM reputation_scores WHERE user_id = $1',
        [userId]
      );
      
      if (result.rows.length === 0) {
        throw new NotFoundError(`Reputation score not found for user ${userId}`);
      }
      
      const row = result.rows[0];
      
      return {
        userId: row.user_id,
        walletAddress: row.wallet_address,
        score: parseFloat(row.score),
        successfulTransactions: parseInt(row.successful_transactions, 10),
        totalTransactions: parseInt(row.total_transactions, 10),
        disputeRate: parseFloat(row.dispute_rate),
        verifiedSince: row.verified_since,
        lastUpdated: row.last_updated
      };
    } catch (error) {
      logger.error('Error fetching reputation score:', error);
      throw error;
    }
  }
  
  async getReputationByWallet(walletAddress: string): Promise<ReputationScore> {
    try {
      const result = await query(
        'SELECT * FROM reputation_scores WHERE wallet_address = $1',
        [walletAddress]
      );
      
      if (result.rows.length === 0) {
        throw new NotFoundError(`Reputation score not found for wallet ${walletAddress}`);
      }
      
      const row = result.rows[0];
      
      return {
        userId: row.user_id,
        walletAddress: row.wallet_address,
        score: parseFloat(row.score),
        successfulTransactions: parseInt(row.successful_transactions, 10),
        totalTransactions: parseInt(row.total_transactions, 10),
        disputeRate: parseFloat(row.dispute_rate),
        verifiedSince: row.verified_since,
        lastUpdated: row.last_updated
      };
    } catch (error) {
      logger.error('Error fetching reputation score by wallet:', error);
      throw error;
    }
  }
  
  async getReputationEvents(userId: string, limit = 20, offset = 0): Promise<ReputationEvent[]> {
    try {
      const result = await query(
        `SELECT * FROM reputation_events 
         WHERE user_id = $1 
         ORDER BY timestamp DESC 
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );
      
      return result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        walletAddress: row.wallet_address,
        eventType: row.event_type,
        impact: parseFloat(row.impact),
        metadata: row.metadata,
        timestamp: row.timestamp
      }));
    } catch (error) {
      logger.error('Error fetching reputation events:', error);
      throw error;
    }
  }
  
  async recordTransactionCompletion(
    userId: string, 
    walletAddress: string, 
    escrowId: string,
    transactionSignature: string
  ): Promise<ReputationEvent> {
    try {
      await this.verifyTransaction(transactionSignature);
      
      const eventResult = await query(
        `INSERT INTO reputation_events 
          (user_id, wallet_address, event_type, impact, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, walletAddress, 'TRANSACTION_COMPLETED', 1, { escrowId, transactionSignature }]
      );
      
      await this.updateReputationScore(userId, walletAddress, 1);
      
      return {
        id: eventResult.rows[0].id,
        userId: eventResult.rows[0].user_id,
        walletAddress: eventResult.rows[0].wallet_address,
        eventType: eventResult.rows[0].event_type,
        impact: parseFloat(eventResult.rows[0].impact),
        metadata: eventResult.rows[0].metadata,
        timestamp: eventResult.rows[0].timestamp
      };
    } catch (error) {
      logger.error('Error recording transaction completion:', error);
      throw error;
    }
  }
  
  async recordDisputeResolution(
    userId: string,
    walletAddress: string,
    disputeId: string,
    resolution: 'BUYER_FAVOR' | 'SELLER_FAVOR' | 'SPLIT',
    impact: number
  ): Promise<ReputationEvent> {
    try {
      const eventResult = await query(
        `INSERT INTO reputation_events 
          (user_id, wallet_address, event_type, impact, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, walletAddress, 'DISPUTE_RESOLVED', impact, { disputeId, resolution }]
      );
      
      await this.updateReputationScore(userId, walletAddress, impact);
      
      return {
        id: eventResult.rows[0].id,
        userId: eventResult.rows[0].user_id,
        walletAddress: eventResult.rows[0].wallet_address,
        eventType: eventResult.rows[0].event_type,
        impact: parseFloat(eventResult.rows[0].impact),
        metadata: eventResult.rows[0].metadata,
        timestamp: eventResult.rows[0].timestamp
      };
    } catch (error) {
      logger.error('Error recording dispute resolution:', error);
      throw error;
    }
  }
  
  async verifyOnChainReputation(walletAddress: string): Promise<{ 
    isVerified: boolean;
    onChainScore?: number;
    offChainScore?: number;
    transactionCount?: number;
    verificationLevel: VerificationLevel;
  }> {
    try {
      const walletPublicKey = new PublicKey(walletAddress);
      
      const signatures = await this.connection.getSignaturesForAddress(
        walletPublicKey,
        { limit: 100 }
      );
      
      let offChainScore: number | undefined;
      let user: User | null = null;
      
      try {
        const userResult = await usersRepository.findByWalletAddress(walletAddress);
        if (userResult) {
          user = userResult;
          const reputation = await this.getReputationByWallet(walletAddress);
          offChainScore = reputation.score;
        }
      } catch (error) {
        if (!(error instanceof NotFoundError)) {
          throw error;
        }
      }
      
      let verificationLevel = VerificationLevel.NONE;
      
      if (signatures.length > 0) {
        verificationLevel = VerificationLevel.BASIC;
      }
      
      if (signatures.length >= 10 && offChainScore && offChainScore > 4.0) {
        verificationLevel = VerificationLevel.VERIFIED;
      }
      
      if (signatures.length >= 50 && offChainScore && offChainScore > 4.5) {
        verificationLevel = VerificationLevel.TRUSTED;
      }
     
      if (user) {
        await this.updateUserVerificationLevel(user.id, verificationLevel);
      }
      
      const onChainScore = signatures.length > 0 ? Math.min(signatures.length / 10, 100) : 0;
      
      return {
        isVerified: signatures.length > 0,
        onChainScore,
        offChainScore,
        transactionCount: signatures.length,
        verificationLevel
      };
    } catch (error) {
      logger.error('Error verifying on-chain reputation:', error);
      
      if (error instanceof Error) {
        throw new BlockchainError(`Error verifying reputation: ${error.message}`);
      }
      
      throw new BlockchainError('Unknown error verifying on-chain reputation');
    }
  }
  
  async updateUserVerificationLevel(userId: string, level: VerificationLevel): Promise<User> {
    try {
      const isVerified = level !== VerificationLevel.NONE;
      
      await query(
        `UPDATE users 
         SET verification_level = $1, 
             is_verified = $2,
             updated_at = NOW() 
         WHERE id = $3`,
        [level, isVerified, userId]
      );

      const user = await usersRepository.findById(userId);
      
      if (!user) {
        throw new NotFoundError(`User not found: ${userId}`);
      }
 
      await notificationsService.createReputationNotification(
        userId,
        `Your account verification level has been updated to ${level.toUpperCase()}.`,
        { verificationLevel: level }
      );
      
      return user;
    } catch (error) {
      logger.error('Error updating user verification level:', error);
      throw error;
    }
  }
  
  async recalculateReputationScore(userId: string): Promise<number> {
    try {
      const user = await usersRepository.findById(userId);
      
      if (!user) {
        throw new NotFoundError(`User not found: ${userId}`);
      }

      const { reviews } = await reviewsRepository.getReviewsForUser(userId);
      
      let reviewScore = 0;
      if (reviews.length > 0) {
        const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
        reviewScore = totalRating / reviews.length;
      }
      
      const transactionResult = await query(
        `SELECT 
           COUNT(*) FILTER (WHERE status = 'completed') as completed,
           COUNT(*) as total
         FROM transactions 
         WHERE escrow_id IN (
           SELECT id FROM escrows WHERE buyer_id = $1 OR seller_id = $1
         )`,
        [userId]
      );
      
      const completedTransactions = parseInt(transactionResult.rows[0]?.completed || '0', 10);
      const totalTransactions = parseInt(transactionResult.rows[0]?.total || '0', 10);
      
        const disputeResult = await query(
        `SELECT 
           COUNT(*) FILTER (WHERE status IN ('resolved_buyer', 'resolved_seller', 'resolved_split')) as resolved,
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE (initiator_id = $1 AND status = 'resolved_seller') OR 
                                  (respondent_id = $1 AND status = 'resolved_buyer')) as lost
         FROM disputes 
         WHERE initiator_id = $1 OR respondent_id = $1`,
        [userId]
      );
      
      const resolvedDisputes = parseInt(disputeResult.rows[0]?.resolved || '0', 10);
      const totalDisputes = parseInt(disputeResult.rows[0]?.total || '0', 10);
      const lostDisputes = parseInt(disputeResult.rows[0]?.lost || '0', 10);
      
      const transactionComponent = totalTransactions > 0 
        ? (completedTransactions / totalTransactions) * 5 
        : 0;
      
      const disputeComponent = totalDisputes > 0 
        ? (1 - (lostDisputes / totalDisputes)) * 5 
        : 5;
      
      const reviewWeight = 0.6;
      const transactionWeight = 0.3;
      const disputeWeight = 0.1;
      
      let finalScore = 0;
      
      if (reviews.length > 0) {
        finalScore += reviewScore * reviewWeight;
      } else {
        finalScore += 2.5 * reviewWeight;
      }
      
      if (totalTransactions > 0) {
        finalScore += transactionComponent * transactionWeight;
      } else {
        finalScore += 2.5 * transactionWeight;
      }
      
      finalScore += disputeComponent * disputeWeight;
      
      finalScore = Math.max(0, Math.min(5, finalScore));
      finalScore = Math.max(0, Math.min(5, finalScore));
      
      await usersRepository.updateReputationScore(userId, finalScore);
      
      await reputationRecordsRepository.create({
        userId,
        score: finalScore,
        transactionCount: totalTransactions,
        reviewCount: reviews.length,
        disputeResolutionRatio: totalDisputes > 0 ? (resolvedDisputes / totalDisputes) : 1.0,
        verificationLevel: user.verificationLevel || VerificationLevel.NONE
      });
      
      return finalScore;
    } catch (error) {
      logger.error('Error recalculating reputation score:', error);
      throw error;
    }
  }
  
  async recordReviewImpact(
    reviewId: string, 
    reviewerId: string, 
    revieweeId: string, 
    rating: number
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO reputation_events 
          (user_id, event_type, impact, metadata)
         VALUES ($1, $2, $3, $4)`,
        [revieweeId, 'FEEDBACK_RECEIVED', rating - 3, { reviewId, reviewerId }]
      );
      
      await this.recalculateReputationScore(revieweeId);
    } catch (error) {
      logger.error('Error recording review impact:', error);
      throw error;
    }
  }
  
  async publishReputationOnChain(userId: string, adminPrivateKey: string): Promise<string> {
    try {
      const user = await usersRepository.findById(userId);
      
      if (!user) {
        throw new NotFoundError(`User not found: ${userId}`);
      }
      
      const reputationScore = await this.recalculateReputationScore(userId);
      
      const adminKeypair = Keypair.fromSecretKey(
        bs58.decode(adminPrivateKey)
      );
      
      const transaction = new Transaction();
      
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [adminKeypair]
      );

      await reputationRecordsRepository.create({
        userId,
        score: reputationScore,
        transactionCount: 0,
        reviewCount: 0,
        disputeResolutionRatio: 1.0,
        verificationLevel: user.verificationLevel || VerificationLevel.NONE,
        blockchainAddress: user.walletAddress,
        transactionSignature: signature
      });
      
      await notificationsService.createReputationNotification(
        userId,
        `Your reputation score of ${reputationScore.toFixed(1)} has been published on-chain.`,
        { 
          score: reputationScore,
          transactionSignature: signature
        }
      );
      
      return signature;
    } catch (error) {
      logger.error('Error publishing reputation on-chain:', error);
      
      if (error instanceof Error) {
        throw new BlockchainError(`Failed to publish reputation: ${error.message}`);
      }
      
      throw new BlockchainError('Unknown error publishing reputation on-chain');
    }
  }
  
  private async updateReputationScore(userId: string, walletAddress: string, impact: number): Promise<void> {
    try {
      const currentResult = await query(
        'SELECT * FROM reputation_scores WHERE user_id = $1',
        [userId]
      );
      
      if (currentResult.rows.length === 0) {
        await query(
          `INSERT INTO reputation_scores 
            (user_id, wallet_address, score, successful_transactions, total_transactions, dispute_rate, verified_since, last_updated)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
          [userId, walletAddress, Math.max(0, impact), impact > 0 ? 1 : 0, 1, 0]
        );
        return;
      }
      
      const current = currentResult.rows[0];
      const successfulTransactions = impact > 0 
        ? parseInt(current.successful_transactions, 10) + 1 
        : parseInt(current.successful_transactions, 10);
      const totalTransactions = parseInt(current.total_transactions, 10) + 1;
      const disputeRate = current.event_type === 'DISPUTE_RESOLVED' 
        ? parseFloat(current.dispute_rate) + (1 / totalTransactions)
        : parseFloat(current.dispute_rate);
      
      const newScore = (parseFloat(current.score) * (totalTransactions - 1) + impact) / totalTransactions;
      
      await query(
        `UPDATE reputation_scores
         SET score = $1,
             successful_transactions = $2,
             total_transactions = $3,
             dispute_rate = $4,
             last_updated = NOW()
         WHERE user_id = $5`,
        [newScore, successfulTransactions, totalTransactions, disputeRate, userId]
      );
    } catch (error) {
      logger.error('Error updating reputation score:', error);
      throw error;
    }
  }
  
  private async verifyTransaction(signature: string): Promise<boolean> {
    try {
      const transaction = await this.connection.getTransaction(signature);
      
      if (!transaction) {
        throw new BlockchainError(`Transaction with signature ${signature} not found`);
      }
      
      return transaction.meta?.err === null;
    } catch (error) {
      logger.error('Error verifying transaction:', error);
      throw error;
    }
  }
}

export const reputationService = new ReputationService();
export default reputationService;
