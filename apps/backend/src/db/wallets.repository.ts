import { query } from './index';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { circleConfig } from '../config/circle';

export interface Wallet {
  id: string;
  userId: string;
  walletId: string;
  type: string;
  address: string;
  currency?: string;
  balance?: number;
  walletAddress?: string;
  isActive?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface CircleWallet {
  walletId: string;
  addressIds: string[];
  description: string;
  entityId: string;
}

interface CircleApiResponse<T> {
  data: T;
}

export async function create(data: Omit<Wallet, 'id' | 'createdAt' | 'updatedAt'>): Promise<Wallet> {
  try {
    await ensureTableExists();
    
    const id = uuidv4();
    const { userId, walletId, type, address, currency, balance, walletAddress, isActive } = data;
    
    const result = await query(
      `INSERT INTO wallets (id, user_id, wallet_id, type, address, currency, balance, wallet_address, is_active) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [id, userId, walletId, type, address, currency || null, balance || 0, walletAddress || address, isActive || true]
    );
    
    return mapRowToWallet(result.rows[0]);
  } catch (error) {
    console.error('Error creating wallet:', error);
    throw error;
  }
}

export async function findById(id: string): Promise<Wallet | null> {
  try {
    await ensureTableExists();
    
    const result = await query(
      `SELECT * FROM wallets WHERE id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapRowToWallet(result.rows[0]);
  } catch (error) {
    console.error('Error finding wallet by ID:', error);
    throw error;
  }
}

export async function findByUserId(userId: string): Promise<Wallet | null> {
  try {
    await ensureTableExists();
    
    const result = await query(
      `SELECT * FROM wallets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapRowToWallet(result.rows[0]);
  } catch (error) {
    console.error('Error finding wallet by user ID:', error);
    throw error;
  }
}

export async function findByUserIdAndCurrency(userId: string, currency: string): Promise<Wallet | null> {
  try {
    await ensureTableExists();
    
    const result = await query(
      `SELECT * FROM wallets WHERE user_id = $1 AND currency = $2 AND is_active = true ORDER BY created_at DESC LIMIT 1`,
      [userId, currency]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapRowToWallet(result.rows[0]);
  } catch (error) {
    console.error('Error finding wallet by user ID and currency:', error);
    throw error;
  }
}

export async function findByWalletId(walletId: string): Promise<Wallet | null> {
  try {
    await ensureTableExists();
    
    const result = await query(
      `SELECT * FROM wallets WHERE wallet_id = $1`,
      [walletId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapRowToWallet(result.rows[0]);
  } catch (error) {
    console.error('Error finding wallet by wallet ID:', error);
    throw error;
  }
}

export async function findAllByCurrency(currency: string): Promise<Wallet[]> {
  try {
    await ensureTableExists();
    
    const result = await query(
      `SELECT * FROM wallets WHERE currency = $1 AND is_active = true`,
      [currency]
    );
    
    return result.rows.map(mapRowToWallet);
  } catch (error) {
    console.error('Error finding wallets by currency:', error);
    throw error;
  }
}

export async function getEscrowWallet(): Promise<Wallet | null> {
  try {
    await ensureTableExists();
    await ensureEscrowWalletExists();
    
    const result = await query(
      `SELECT * FROM wallets WHERE user_id = 'system' AND type = 'escrow'`
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapRowToWallet(result.rows[0]);
  } catch (error) {
    console.error('Error getting escrow wallet:', error);
    throw error;
  }
}

export async function update(id: string, data: Partial<Omit<Wallet, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Wallet | null> {
  try {
    await ensureTableExists();
    
    const updates: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;
    
    if (data.userId !== undefined) {
      updates.push(`user_id = $${paramIndex++}`);
      values.push(data.userId);
    }
    
    if (data.walletId !== undefined) {
      updates.push(`wallet_id = $${paramIndex++}`);
      values.push(data.walletId);
    }
    
    if (data.type !== undefined) {
      updates.push(`type = $${paramIndex++}`);
      values.push(data.type);
    }
    
    if (data.address !== undefined) {
      updates.push(`address = $${paramIndex++}`);
      values.push(data.address);
    }
    
    if (data.currency !== undefined) {
      updates.push(`currency = $${paramIndex++}`);
      values.push(data.currency);
    }
    
    if (data.balance !== undefined) {
      updates.push(`balance = $${paramIndex++}`);
      values.push(data.balance);
    }
    
    if (data.walletAddress !== undefined) {
      updates.push(`wallet_address = $${paramIndex++}`);
      values.push(data.walletAddress);
    }
    
    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(data.isActive);
    }
    
    if (updates.length === 0) {
      return findById(id);
    }
    
    updates.push(`updated_at = NOW()`);
    
    const result = await query(
      `UPDATE wallets SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapRowToWallet(result.rows[0]);
  } catch (error) {
    console.error('Error updating wallet:', error);
    throw error;
  }
}

export async function updateBalance(userId: string, currency: string, newBalance: number): Promise<Wallet | null> {
  try {
    await ensureTableExists();
    
    const wallet = await findByUserIdAndCurrency(userId, currency);
    if (!wallet) {
      return null;
    }
    
    const result = await query(
      `UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [newBalance, wallet.id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapRowToWallet(result.rows[0]);
  } catch (error) {
    console.error('Error updating wallet balance:', error);
    throw error;
  }
}

async function ensureTableExists(): Promise<void> {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS wallets (
        id UUID PRIMARY KEY,
        user_id TEXT NOT NULL,
        wallet_id TEXT NOT NULL,
        type TEXT NOT NULL,
        address TEXT NOT NULL,
        currency TEXT,
        balance NUMERIC(18, 6) DEFAULT 0,
        wallet_address TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  } catch (error) {
    console.error('Error ensuring wallets table exists:', error);
    throw error;
  }
}

async function ensureEscrowWalletExists(): Promise<void> {
  try {
    const result = await query(
      `SELECT * FROM wallets WHERE user_id = 'system' AND type = 'escrow'`
    );
    
    if (result.rows.length === 0) {
      // Create a real Circle wallet for escrow operations
      try {
        const idempotencyKey = uuidv4();
        const circleApi = axios.create({
          baseURL: circleConfig.baseUrl,
          headers: {
            'Authorization': `Bearer ${circleConfig.apiKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        const response = await circleApi.post<{data: CircleWallet}>('/wallets', {
          idempotencyKey,
          description: 'LumeSquare Escrow Wallet'
        });
        
        if (response.data && response.data.data) {
          const walletData = response.data.data;
          const id = uuidv4();
          
          await query(
            `INSERT INTO wallets (id, user_id, wallet_id, type, address) 
             VALUES ($1, 'system', $2, 'escrow', $3)`,
            [id, walletData.walletId, walletData.addressIds[0] || 'system-escrow-address']
          );
          
          console.log('Created Circle escrow wallet:', walletData.walletId);
        } else {
          // Fallback to placeholder if Circle API fails
          const id = uuidv4();
          await query(
            `INSERT INTO wallets (id, user_id, wallet_id, type, address) 
             VALUES ($1, 'system', 'escrow-system-wallet', 'escrow', 'system-escrow-address')`,
            [id]
          );
          console.warn('Created placeholder escrow wallet due to Circle API failure');
        }
      } catch (error) {
        // Fallback to placeholder if Circle API fails
        console.error('Error creating Circle escrow wallet:', error);
        const id = uuidv4();
        await query(
          `INSERT INTO wallets (id, user_id, wallet_id, type, address) 
           VALUES ($1, 'system', 'escrow-system-wallet', 'escrow', 'system-escrow-address')`,
          [id]
        );
        console.warn('Created placeholder escrow wallet due to Circle API error');
      }
    }
  } catch (error) {
    console.error('Error ensuring escrow wallet exists:', error);
    throw error;
  }
}

function mapRowToWallet(row: any): Wallet {
  return {
    id: row.id,
    userId: row.user_id,
    walletId: row.wallet_id,
    type: row.type,
    address: row.address,
    currency: row.currency,
    balance: row.balance ? parseFloat(row.balance) : undefined,
    walletAddress: row.wallet_address,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
