import jwt from 'jsonwebtoken';
import { JwtPayload } from '../types';
import config from '../config';
import { UnauthorizedError } from './errors';

export const generateToken = (payload: JwtPayload): string => {
  if (!config.jwt.secret) {
    throw new Error('JWT secret is not defined');
  }
  
  return jwt.sign(
    payload, 
    config.jwt.secret, 
    { expiresIn: config.jwt.expiresIn || '1d' }
  );
};

export const verifyToken = (token: string): JwtPayload => {
  try {
    if (!config.jwt.secret) {
      throw new Error('JWT secret is not defined');
    }
    
    return jwt.verify(token, config.jwt.secret) as JwtPayload;
  } catch (error) {
    throw new UnauthorizedError('Invalid token');
  }
};

export default {
  generateToken,
  verifyToken,
};
