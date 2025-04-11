import { query } from './index';
import { User } from '../types/index';

export const findByWalletAddress = async (walletAddress: string): Promise<User | null> => {
  const result = await query(
    'SELECT * FROM users WHERE wallet_address = $1',
    [walletAddress]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapDbUserToUser(result.rows[0]);
};

export const create = async (walletAddress: string, username?: string): Promise<User> => {
  const result = await query(
    'INSERT INTO users (wallet_address, username) VALUES ($1, $2) RETURNING *',
    [walletAddress, username]
  );

  return mapDbUserToUser(result.rows[0]);
};

export const findById = async (id: string): Promise<User | null> => {
  const result = await query('SELECT * FROM users WHERE id = $1', [id]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapDbUserToUser(result.rows[0]);
};

export const updateProfile = async (
  id: string,
  data: { username?: string; profileImage?: string }
): Promise<User> => {
  const { username, profileImage } = data;
  const result = await query(
    `UPDATE users 
     SET username = COALESCE($2, username), 
         profile_image = COALESCE($3, profile_image),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, username, profileImage]
  );

  return mapDbUserToUser(result.rows[0]);
};

export const update = async (
  id: string,
  data: Partial<{
    username?: string;
    profileImage?: string;
    reputationScore?: number;
    verificationLevel?: string;
    trustScore?: number;
    isVerified?: boolean;
    isAdmin?: boolean;
  }>
): Promise<User> => {
  const updates: string[] = [];
  const values: any[] = [id];
  let paramIndex = 2;
  
  if (data.username !== undefined) {
    updates.push(`username = $${paramIndex++}`);
    values.push(data.username);
  }
  
  if (data.profileImage !== undefined) {
    updates.push(`profile_image = $${paramIndex++}`);
    values.push(data.profileImage);
  }
  
  if (data.reputationScore !== undefined) {
    updates.push(`reputation_score = $${paramIndex++}`);
    values.push(data.reputationScore);
  }
  
  if (data.verificationLevel !== undefined) {
    updates.push(`verification_level = $${paramIndex++}`);
    values.push(data.verificationLevel);
  }
  
  if (data.trustScore !== undefined) {
    updates.push(`trust_score = $${paramIndex++}`);
    values.push(data.trustScore);
  }
  
  if (data.isVerified !== undefined) {
    updates.push(`is_verified = $${paramIndex++}`);
    values.push(data.isVerified);
  }
  
  if (data.isAdmin !== undefined) {
    updates.push(`is_admin = $${paramIndex++}`);
    values.push(data.isAdmin);
  }
  
  if (updates.length === 0) {
    return (await findById(id)) as User;
  }
  
  updates.push(`updated_at = NOW()`);
  
  const result = await query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
    values
  );
  
  return mapDbUserToUser(result.rows[0]);
};

export const updateReputationScore = async (id: string, score: number): Promise<void> => {
  await query(
    'UPDATE users SET reputation_score = $2, updated_at = NOW() WHERE id = $1',
    [id, score]
  );
};

/**
 * Get total count of all users
 */
export const getTotalCount = async (): Promise<number> => {
  const result = await query(`SELECT COUNT(*) FROM users`);
  return parseInt(result.rows[0].count, 10);
};

/**
 * Suspend a user account
 * @param userId
 * @param reason
 */
export const suspendUser = async (userId: string, reason: string): Promise<User | null> => {
  
  try {
    await query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'suspended'
        ) THEN
          ALTER TABLE users ADD COLUMN suspended BOOLEAN DEFAULT FALSE;
          ALTER TABLE users ADD COLUMN suspension_reason TEXT;
        END IF;
      END $$;
    `);
    
    const result = await query(
      `UPDATE users 
       SET suspended = TRUE, 
           suspension_reason = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [userId, reason]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return mapDbUserToUser(result.rows[0]);
  } catch (error) {
    console.error('Error suspending user:', error);
    return null;
  }
};

/**
 * Find users by various criteria
 */
export const findUsers = async (
  options: {
    limit?: number;
    offset?: number;
    suspended?: boolean;
    searchTerm?: string;
  } = {}
): Promise<{ users: User[]; total: number }> => {
  const { limit = 20, offset = 0, suspended, searchTerm } = options;

  let whereClause = '';
  const params: any[] = [limit, offset];
  let paramIndex = 3;
  
  const conditions: string[] = [];
  
  if (suspended !== undefined) {
    conditions.push(`suspended = $${paramIndex++}`);
    params.push(suspended);
  }
  
  if (searchTerm) {
    conditions.push(`(username ILIKE $${paramIndex} OR wallet_address ILIKE $${paramIndex})`);
    params.push(`%${searchTerm}%`);
    paramIndex++;
  }
  
  if (conditions.length > 0) {
    whereClause = 'WHERE ' + conditions.join(' AND ');
  }

  const usersQuery = `
    SELECT * FROM users 
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
  `;
  
  const countQuery = `
    SELECT COUNT(*) FROM users ${whereClause}
  `;

  const [usersResult, countResult] = await Promise.all([
    query(usersQuery, params),
    query(countQuery, params.slice(2))
  ]);

  const users = usersResult.rows.map(mapDbUserToUser);

  return {
    users,
    total: parseInt(countResult.rows[0].count, 10)
  };
};

function mapDbUserToUser(user: any): User {
  const mappedUser: User = {
    id: user.id,
    walletAddress: user.wallet_address,
    username: user.username || undefined,
    profileImage: user.profile_image || undefined,
    reputationScore: parseFloat(user.reputation_score || '0'),
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
  
  return mappedUser;
}
