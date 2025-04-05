import { Request, Response, NextFunction } from 'express';
import * as usersService from '../../services/users.service';
import { BadRequestError } from '../../utils/errors';

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress } = req.body;
    
    if (!walletAddress) {
      throw new BadRequestError('Wallet address is required');
    }
    
    const { user, token } = await usersService.authenticateUser(walletAddress);
    
    res.status(200).json({
      status: 'success',
      data: { user, token }
    });
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const user = await usersService.getUserProfile(userId);
    
    res.status(200).json({
      status: 'success',
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { username, profileImage } = req.body;
    
    const user = await usersService.updateUserProfile(userId, { username, profileImage });
    
    res.status(200).json({
      status: 'success',
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};
