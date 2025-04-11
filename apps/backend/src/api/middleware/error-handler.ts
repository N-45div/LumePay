import { Request, Response, NextFunction } from 'express';
import logger from '../../utils/logger';
import { BadRequestError, NotFoundError, ForbiddenError, UnauthorizedError } from '../../utils/errors';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  const { method, originalUrl } = req;
  
  if (err instanceof BadRequestError) {
    logger.warn(`Bad Request Error: ${err.message}, Route: ${method} ${originalUrl}`);
    return res.status(400).json({ error: err.message });
  }
  
  if (err instanceof UnauthorizedError) {
    logger.warn(`Unauthorized Error: ${err.message}, Route: ${method} ${originalUrl}`);
    return res.status(401).json({ error: err.message });
  }
  
  if (err instanceof ForbiddenError) {
    logger.warn(`Forbidden Error: ${err.message}, Route: ${method} ${originalUrl}`);
    return res.status(403).json({ error: err.message });
  }
  
  if (err instanceof NotFoundError) {
    logger.warn(`Not Found Error: ${err.message}, Route: ${method} ${originalUrl}`);
    return res.status(404).json({ error: err.message });
  }
  
  logger.error(`Unhandled Error: ${err.message}`, err);
  res.status(500).json({ error: 'An unexpected error occurred' });
};

export default errorHandler;
