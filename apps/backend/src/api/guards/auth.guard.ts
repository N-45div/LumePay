// apps/backend/src/api/guards/auth.guard.ts

import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // This is a simple mock auth guard
    // In a real application, this would validate JWT tokens, API keys, etc.
    
    const request = context.switchToHttp().getRequest();
    
    // Simple API key check from header (for development/testing)
    const apiKey = request.headers['x-api-key'];
    if (apiKey === 'development-lumepay-key') {
      return true;
    }
    
    // TODO: Implement proper auth for production
    // For now, allow all requests in development
    const isDevelopment = process.env.NODE_ENV !== 'production';
    return isDevelopment;
  }
}
