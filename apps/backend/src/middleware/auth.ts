import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

// Extend the Express Request type
declare global {
  namespace Express {
    interface User {
      userId: string;
      walletAddress: string;
      isAdmin?: boolean;
    }
  }
}

export function authenticateJWT(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header is required' });
  }
  
  const token = authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authorization token is required' });
  }
  
  try {
    const secret = process.env.JWT_SECRET || 'default_secret_for_development';
    const decoded = jwt.verify(token, secret) as Express.User;
    
    req.user = decoded;
    next();
  } catch (error: any) {
    logger.error('JWT authentication error:', error);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  
  next();
}
