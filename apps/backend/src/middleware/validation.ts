import { z } from 'zod';
import { logger } from '../utils';

export function validateRequest<T>(data: any, schema: z.ZodSchema<T>): { success: boolean; data?: T; error?: string } {
  try {
    const validData = schema.parse(data);
    return {
      success: true,
      data: validData
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedError = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
      logger.error(`Validation error: ${formattedError}`);
      return {
        success: false,
        error: formattedError
      };
    }
    
    logger.error('Unexpected validation error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred during validation'
    };
  }
}
