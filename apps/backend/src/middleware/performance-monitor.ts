import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export const performanceMonitor = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const path = req.originalUrl;
    const method = req.method;
    const status = res.statusCode;
    
    if (duration > 200) {
      logger.warn(`Slow API response: ${method} ${path} ${status} - ${duration}ms`);
    }
    
    res.setHeader('X-Response-Time', `${duration}ms`);
  });
  
  next();
};

export default performanceMonitor;
