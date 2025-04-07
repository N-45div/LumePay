import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../../utils/errors';

export const isAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Implement your admin check logic here
    // This is a placeholder - in a real implementation, you'd check if the user has admin role
    // For example, query the database to check if the user is an admin
    
    // For development purposes, we'll use a simple check
    // In production, replace this with proper admin role checking from your database
    const userId = req.user!.userId;
    const isUserAdmin = true; // Replace with actual admin check logic
    
    if (!isUserAdmin) {
      throw new ForbiddenError('Admin privileges required');
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

export default isAdmin;
