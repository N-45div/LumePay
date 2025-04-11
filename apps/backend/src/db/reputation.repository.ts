import { query } from './index';
import { v4 as uuidv4 } from 'uuid';
import { ReputationRecord, VerificationLevel } from '../types';
import logger from '../utils/logger';

/**
 * Find a reputation record by user ID
 */
export async function findByUserId(userId: string): Promise<ReputationRecord | null> {
  try {
    await ensureTableExists();
    
    const result = await query(
      `SELECT * FROM reputation_records WHERE user_id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapRowToReputationRecord(result.rows[0]);
  } catch (error) {
    logger.error('Error finding reputation record by user ID:', error);
    throw error;
  }
}

/**
 * Create a new reputation record
 */
export async function create(data: Omit<ReputationRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<ReputationRecord> {
  try {
    await ensureTableExists();
    
    const id = uuidv4();
    const {
      userId,
      score,
      transactionCount,
      reviewCount,
      disputeResolutionRatio,
      verificationLevel,
      blockchainAddress,
      transactionSignature
    } = data;
    
    const result = await query(
      `INSERT INTO reputation_records (
        id, user_id, score, transaction_count, review_count,
        dispute_resolution_ratio, verification_level, blockchain_address, transaction_signature
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        id, userId, score, transactionCount, reviewCount,
        disputeResolutionRatio, verificationLevel, blockchainAddress || null, transactionSignature || null
      ]
    );
    
    return mapRowToReputationRecord(result.rows[0]);
  } catch (error) {
    logger.error('Error creating reputation record:', error);
    throw error;
  }
}

/**
 * Update a reputation record
 */
export async function update(id: string, data: Partial<Omit<ReputationRecord, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ReputationRecord | null> {
  try {
    await ensureTableExists();
    
    const updates: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;
    
    if (data.score !== undefined) {
      updates.push(`score = $${paramIndex++}`);
      values.push(data.score);
    }
    
    if (data.transactionCount !== undefined) {
      updates.push(`transaction_count = $${paramIndex++}`);
      values.push(data.transactionCount);
    }
    
    if (data.reviewCount !== undefined) {
      updates.push(`review_count = $${paramIndex++}`);
      values.push(data.reviewCount);
    }
    
    if (data.disputeResolutionRatio !== undefined) {
      updates.push(`dispute_resolution_ratio = $${paramIndex++}`);
      values.push(data.disputeResolutionRatio);
    }
    
    if (data.verificationLevel !== undefined) {
      updates.push(`verification_level = $${paramIndex++}`);
      values.push(data.verificationLevel);
    }
    
    if (data.blockchainAddress !== undefined) {
      updates.push(`blockchain_address = $${paramIndex++}`);
      values.push(data.blockchainAddress);
    }
    
    if (data.transactionSignature !== undefined) {
      updates.push(`transaction_signature = $${paramIndex++}`);
      values.push(data.transactionSignature);
    }
    
    if (updates.length === 0) {
      const record = await findById(id);
      return record;
    }
    
    updates.push(`updated_at = NOW()`);
    
    const result = await query(
      `UPDATE reputation_records 
       SET ${updates.join(', ')} 
       WHERE id = $1 
       RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapRowToReputationRecord(result.rows[0]);
  } catch (error) {
    logger.error('Error updating reputation record:', error);
    throw error;
  }
}

/**
 * Find a reputation record by ID
 */
export async function findById(id: string): Promise<ReputationRecord | null> {
  try {
    await ensureTableExists();
    
    const result = await query(
      `SELECT * FROM reputation_records WHERE id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapRowToReputationRecord(result.rows[0]);
  } catch (error) {
    logger.error('Error finding reputation record by ID:', error);
    throw error;
  }
}

/**
 * Ensure the reputation_records table exists
 */
async function ensureTableExists(): Promise<void> {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS reputation_records (
        id UUID PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        score NUMERIC(5, 2) NOT NULL DEFAULT 0,
        transaction_count INTEGER NOT NULL DEFAULT 0,
        review_count INTEGER NOT NULL DEFAULT 0,
        dispute_resolution_ratio NUMERIC(5, 2) NOT NULL DEFAULT 0,
        verification_level TEXT NOT NULL DEFAULT 'none',
        blockchain_address TEXT,
        transaction_signature TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    
    await query(`
      CREATE INDEX IF NOT EXISTS reputation_records_user_id_idx ON reputation_records(user_id)
    `);
  } catch (error) {
    logger.error('Error ensuring reputation_records table exists:', error);
    throw error;
  }
}

/**
 * Map a database row to a ReputationRecord object
 */
function mapRowToReputationRecord(row: any): ReputationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    score: parseFloat(row.score),
    transactionCount: row.transaction_count,
    reviewCount: row.review_count,
    disputeResolutionRatio: parseFloat(row.dispute_resolution_ratio),
    verificationLevel: row.verification_level as VerificationLevel,
    blockchainAddress: row.blockchain_address,
    transactionSignature: row.transaction_signature,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
