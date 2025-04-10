import { query } from './index';
import { ReputationRecord, VerificationLevel } from '../types';

export const create = async (
  data: Omit<ReputationRecord, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ReputationRecord> => {
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
    `INSERT INTO reputation_records 
     (user_id, score, transaction_count, review_count, dispute_resolution_ratio, 
      verification_level, blockchain_address, transaction_signature) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
     RETURNING *`,
    [
      userId, 
      score, 
      transactionCount, 
      reviewCount, 
      disputeResolutionRatio, 
      verificationLevel, 
      blockchainAddress, 
      transactionSignature
    ]
  );

  return mapDbRecordToReputationRecord(result.rows[0]);
};

export const findByUserId = async (userId: string): Promise<ReputationRecord[]> => {
  const result = await query(
    'SELECT * FROM reputation_records WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  
  return result.rows.map(mapDbRecordToReputationRecord);
};

export const findLatestByUserId = async (userId: string): Promise<ReputationRecord | null> => {
  const result = await query(
    'SELECT * FROM reputation_records WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return mapDbRecordToReputationRecord(result.rows[0]);
};

export const findById = async (id: string): Promise<ReputationRecord | null> => {
  const result = await query(
    'SELECT * FROM reputation_records WHERE id = $1',
    [id]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return mapDbRecordToReputationRecord(result.rows[0]);
};

export const findByTransactionSignature = async (signature: string): Promise<ReputationRecord | null> => {
  const result = await query(
    'SELECT * FROM reputation_records WHERE transaction_signature = $1',
    [signature]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return mapDbRecordToReputationRecord(result.rows[0]);
};

function mapDbRecordToReputationRecord(record: any): ReputationRecord {
  return {
    id: record.id,
    userId: record.user_id,
    score: parseFloat(record.score),
    transactionCount: record.transaction_count,
    reviewCount: record.review_count,
    disputeResolutionRatio: parseFloat(record.dispute_resolution_ratio),
    verificationLevel: record.verification_level as VerificationLevel,
    blockchainAddress: record.blockchain_address || undefined,
    transactionSignature: record.transaction_signature || undefined,
    createdAt: record.created_at,
    updatedAt: record.updated_at
  };
}
