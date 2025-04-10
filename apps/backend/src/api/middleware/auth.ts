import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../../utils/jwt';
import { UnauthorizedError } from '../../utils/errors';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        walletAddress: string;
      };
      userId?: string;
      walletAddress?: string;
    }
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    
    req.user = {
      userId: decoded.userId,
      walletAddress: decoded.walletAddress
    };
    
    next();
  } catch (error) {
    next(error);
  }
};

export default authenticate;
