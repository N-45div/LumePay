import { query } from './index';
import { v4 as uuidv4 } from 'uuid';
import { TransactionStatus } from '../types';

export interface Transaction {
  id: string;
  userId: string;
  escrowId?: string;
  transferId: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  type: string;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

export async function create(data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<Transaction> {
  try {
    await ensureTableExists();
    
    const id = uuidv4();
    const { userId, escrowId, transferId, amount, currency, status, type, metadata } = data;
    
    const result = await query(
      `INSERT INTO transactions 
       (id, user_id, escrow_id, transfer_id, amount, currency, status, type, metadata) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [id, userId, escrowId, transferId, amount, currency, status, type, metadata ? JSON.stringify(metadata) : null]
    );
    
    return mapRowToTransaction(result.rows[0]);
  } catch (error) {
    console.error('Error creating transaction:', error);
    throw error;
  }
}

export async function findById(id: string): Promise<Transaction | null> {
  try {
    await ensureTableExists();
    
    const result = await query(`SELECT * FROM transactions WHERE id = $1`, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapRowToTransaction(result.rows[0]);
  } catch (error) {
    console.error('Error finding transaction by ID:', error);
    throw error;
  }
}

export async function findByTransferId(transferId: string): Promise<Transaction | null> {
  try {
    await ensureTableExists();
    
    const result = await query(`SELECT * FROM transactions WHERE transfer_id = $1`, [transferId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapRowToTransaction(result.rows[0]);
  } catch (error) {
    console.error('Error finding transaction by transfer ID:', error);
    throw error;
  }
}

export async function findByEscrowId(escrowId: string): Promise<Transaction[]> {
  try {
    await ensureTableExists();
    
    const result = await query(
      `SELECT * FROM transactions WHERE escrow_id = $1 ORDER BY created_at DESC`,
      [escrowId]
    );
    
    return result.rows.map(mapRowToTransaction);
  } catch (error) {
    console.error('Error finding transactions by escrow ID:', error);
    throw error;
  }
}

export async function findByUserId(userId: string, limit = 20, offset = 0): Promise<{ transactions: Transaction[]; total: number }> {
  try {
    await ensureTableExists();
    
    const [result, count] = await Promise.all([
      query(
        `SELECT * FROM transactions 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      ),
      query(`SELECT COUNT(*) FROM transactions WHERE user_id = $1`, [userId])
    ]);
    
    return {
      transactions: result.rows.map(mapRowToTransaction),
      total: parseInt(count.rows[0].count, 10)
    };
  } catch (error) {
    console.error('Error finding transactions by user ID:', error);
    throw error;
  }
}

export async function updateStatus(id: string, status: TransactionStatus): Promise<Transaction | null> {
  try {
    await ensureTableExists();
    
    const result = await query(
      `UPDATE transactions 
       SET status = $2, updated_at = NOW() 
       WHERE id = $1 
       RETURNING *`,
      [id, status]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapRowToTransaction(result.rows[0]);
  } catch (error) {
    console.error('Error updating transaction status:', error);
    throw error;
  }
}

export async function updateByTransferId(transferId: string, status: TransactionStatus): Promise<Transaction | null> {
  try {
    await ensureTableExists();
    
    const result = await query(
      `UPDATE transactions 
       SET status = $2, updated_at = NOW() 
       WHERE transfer_id = $1 
       RETURNING *`,
      [transferId, status]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapRowToTransaction(result.rows[0]);
  } catch (error) {
    console.error('Error updating transaction by transfer ID:', error);
    throw error;
  }
}

async function ensureTableExists(): Promise<void> {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY,
        user_id TEXT NOT NULL,
        escrow_id TEXT,
        transfer_id TEXT NOT NULL,
        amount NUMERIC(20, 8) NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL,
        type TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  } catch (error) {
    console.error('Error ensuring transactions table exists:', error);
    throw error;
  }
}

function mapRowToTransaction(row: any): Transaction {
  return {
    id: row.id,
    userId: row.user_id,
    escrowId: row.escrow_id,
    transferId: row.transfer_id,
    amount: parseFloat(row.amount),
    currency: row.currency,
    status: row.status as TransactionStatus,
    type: row.type,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
