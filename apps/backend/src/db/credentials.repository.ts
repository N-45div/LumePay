import { query } from './index';
import { v4 as uuidv4 } from 'uuid';
import { ReclaimCredential } from '../services/reclaim.service';
import logger from '../utils/logger';

export async function create(credential: Omit<ReclaimCredential, 'id'>): Promise<ReclaimCredential> {
  try {
    await ensureTableExists();
    
    const id = uuidv4();
    const {
      userId,
      credentialType,
      issuer,
      issuanceDate,
      expirationDate,
      revoked,
      metadata,
      proofType,
      proofId,
      verificationDate
    } = credential;
    
    const result = await query(
      `INSERT INTO reclaim_credentials (
        id, user_id, credential_type, issuer, issuance_date, expiration_date, 
        revoked, metadata, proof_type, proof_id, verification_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        id, userId, credentialType, issuer, issuanceDate, expirationDate || null,
        revoked, JSON.stringify(metadata), proofType, proofId, verificationDate
      ]
    );
    
    return mapRowToCredential(result.rows[0]);
  } catch (error) {
    logger.error('Error creating credential:', error);
    throw error;
  }
}

export async function findById(id: string): Promise<ReclaimCredential | null> {
  try {
    await ensureTableExists();
    
    const result = await query(
      `SELECT * FROM reclaim_credentials WHERE id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapRowToCredential(result.rows[0]);
  } catch (error) {
    logger.error('Error finding credential by ID:', error);
    throw error;
  }
}

export async function findByUserId(userId: string): Promise<ReclaimCredential[]> {
  try {
    await ensureTableExists();
    
    const result = await query(
      `SELECT * FROM reclaim_credentials WHERE user_id = $1 ORDER BY verification_date DESC`,
      [userId]
    );
    
    return result.rows.map(mapRowToCredential);
  } catch (error) {
    logger.error('Error finding credentials by user ID:', error);
    throw error;
  }
}

export async function findByProofId(proofId: string): Promise<ReclaimCredential | null> {
  try {
    await ensureTableExists();
    
    const result = await query(
      `SELECT * FROM reclaim_credentials WHERE proof_id = $1`,
      [proofId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapRowToCredential(result.rows[0]);
  } catch (error) {
    logger.error('Error finding credential by proof ID:', error);
    throw error;
  }
}

export async function update(
  id: string, 
  updates: Partial<Omit<ReclaimCredential, 'id'>>
): Promise<ReclaimCredential | null> {
  try {
    await ensureTableExists();
    
    const updateFields: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;
    
    if (updates.revoked !== undefined) {
      updateFields.push(`revoked = $${paramIndex++}`);
      values.push(updates.revoked);
    }
    
    if (updates.metadata !== undefined) {
      updateFields.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(updates.metadata));
    }
    
    if (updates.expirationDate !== undefined) {
      updateFields.push(`expiration_date = $${paramIndex++}`);
      values.push(updates.expirationDate);
    }
    
    if (updateFields.length === 0) {
      return findById(id);
    }
    
    const result = await query(
      `UPDATE reclaim_credentials 
       SET ${updateFields.join(', ')} 
       WHERE id = $1 
       RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapRowToCredential(result.rows[0]);
  } catch (error) {
    logger.error('Error updating credential:', error);
    throw error;
  }
}

export async function revokeByUserId(userId: string): Promise<void> {
  try {
    await ensureTableExists();
    
    await query(
      `UPDATE reclaim_credentials SET revoked = true WHERE user_id = $1`,
      [userId]
    );
  } catch (error) {
    logger.error('Error revoking credentials by user ID:', error);
    throw error;
  }
}

async function ensureTableExists(): Promise<void> {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS reclaim_credentials (
        id UUID PRIMARY KEY,
        user_id TEXT NOT NULL,
        credential_type TEXT NOT NULL,
        issuer TEXT NOT NULL,
        issuance_date TIMESTAMP NOT NULL,
        expiration_date TIMESTAMP,
        revoked BOOLEAN DEFAULT false,
        metadata JSONB DEFAULT '{}'::jsonb,
        proof_type TEXT NOT NULL,
        proof_id TEXT NOT NULL,
        verification_date TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    
    await query(`
      CREATE INDEX IF NOT EXISTS reclaim_credentials_user_id_idx ON reclaim_credentials(user_id)
    `);
    
    await query(`
      CREATE INDEX IF NOT EXISTS reclaim_credentials_proof_id_idx ON reclaim_credentials(proof_id)
    `);
  } catch (error) {
    logger.error('Error ensuring reclaim_credentials table exists:', error);
    throw error;
  }
}

function mapRowToCredential(row: any): ReclaimCredential {
  return {
    id: row.id,
    userId: row.user_id,
    credentialType: row.credential_type,
    issuer: row.issuer,
    issuanceDate: row.issuance_date,
    expirationDate: row.expiration_date,
    revoked: row.revoked,
    metadata: row.metadata || {},
    proofType: row.proof_type,
    proofId: row.proof_id,
    verificationDate: row.verification_date
  };
}
