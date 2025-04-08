import * as usersRepository from '../db/users.repository';
import { generateToken } from '../utils/jwt';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { User } from '../types/index';

export const authenticateUser = async (walletAddress: string): Promise<{ user: User; token: string }> => {
  let user = await usersRepository.findByWalletAddress(walletAddress);
  
  if (!user) {
    user = await usersRepository.create(walletAddress);
  }
  
  const token = generateToken({
    userId: user.id,
    walletAddress: user.walletAddress
  });
  
  return { user, token };
};

export const getUserProfile = async (userId: string): Promise<User> => {
  const user = await usersRepository.findById(userId);
  
  if (!user) {
    throw new NotFoundError('User not found');
  }
  
  return user;
};

export const updateUserProfile = async (
  userId: string,
  data: { username?: string; profileImage?: string }
): Promise<User> => {
  const user = await usersRepository.findById(userId);
  
  if (!user) {
    throw new NotFoundError('User not found');
  }
  
  if (data.username && data.username.length < 3) {
    throw new BadRequestError('Username must be at least 3 characters long');
  }
  
  return await usersRepository.updateProfile(userId, data);
};

export const calculateReputationScore = async (userId: string): Promise<number> => {
  const user = await usersRepository.findById(userId);
  
  if (!user) {
    throw new NotFoundError('User not found');
  }
  
  return user.reputationScore;
};
