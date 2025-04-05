import { Connection, PublicKey } from '@solana/web3.js';
import { query } from '../db';
import logger from '../utils/logger';
import { NotFoundError, BlockchainError } from '../utils/errors';

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
  impact: number; // positive or negative impact on reputation
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
  }> {
    try {
      const walletPublicKey = new PublicKey(walletAddress);
      
      // This would be replaced with actual on-chain verification
      // using the Reputation Program on Solana
      const signatures = await this.connection.getSignaturesForAddress(
        walletPublicKey,
        { limit: 100 }
      );
      
      // Get the off-chain score for comparison
      let offChainScore: number | undefined;
      try {
        const reputation = await this.getReputationByWallet(walletAddress);
        offChainScore = reputation.score;
      } catch (error) {
        if (!(error instanceof NotFoundError)) {
          throw error;
        }
      }
      
      // For now, this is a placeholder calculation
      // In the real implementation, this would verify the on-chain reputation token
      const onChainScore = signatures.length > 0 ? Math.min(signatures.length / 10, 100) : 0;
      
      return {
        isVerified: signatures.length > 0,
        onChainScore,
        offChainScore,
        transactionCount: signatures.length
      };
    } catch (error) {
      logger.error('Error verifying on-chain reputation:', error);
      
      if (error instanceof Error) {
        throw new BlockchainError(`Error verifying reputation: ${error.message}`);
      }
      
      throw new BlockchainError('Unknown error verifying on-chain reputation');
    }
  }
  
  private async updateReputationScore(userId: string, walletAddress: string, impact: number): Promise<void> {
    try {
      const currentResult = await query(
        'SELECT * FROM reputation_scores WHERE user_id = $1',
        [userId]
      );
      
      if (currentResult.rows.length === 0) {
        // Create new reputation record if it doesn't exist
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
      
      // Calculate new score (simplified algorithm)
      // A more sophisticated algorithm would be used in production
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
