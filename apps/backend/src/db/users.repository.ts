import { query } from './index';
import { User } from '../types';

export const findByWalletAddress = async (walletAddress: string): Promise<User | null> => {
  const result = await query(
    'SELECT * FROM users WHERE wallet_address = $1',
    [walletAddress]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const user = result.rows[0];
  return {
    id: user.id,
    walletAddress: user.wallet_address,
    username: user.username,
    profileImage: user.profile_image,
    reputationScore: parseFloat(user.reputation_score),
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
};

export const create = async (walletAddress: string, username?: string): Promise<User> => {
  const result = await query(
    'INSERT INTO users (wallet_address, username) VALUES ($1, $2) RETURNING *',
    [walletAddress, username]
  );

  const user = result.rows[0];
  return {
    id: user.id,
    walletAddress: user.wallet_address,
    username: user.username,
    profileImage: user.profile_image,
    reputationScore: parseFloat(user.reputation_score),
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
};

export const findById = async (id: string): Promise<User | null> => {
  const result = await query('SELECT * FROM users WHERE id = $1', [id]);

  if (result.rows.length === 0) {
    return null;
  }

  const user = result.rows[0];
  return {
    id: user.id,
    walletAddress: user.wallet_address,
    username: user.username,
    profileImage: user.profile_image,
    reputationScore: parseFloat(user.reputation_score),
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
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

  const user = result.rows[0];
  return {
    id: user.id,
    walletAddress: user.wallet_address,
    username: user.username,
    profileImage: user.profile_image,
    reputationScore: parseFloat(user.reputation_score),
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
};

export const updateReputationScore = async (id: string, score: number): Promise<void> => {
  await query(
    'UPDATE users SET reputation_score = $2, updated_at = NOW() WHERE id = $1',
    [id, score]
  );
};
