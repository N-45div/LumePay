// apps/backend/src/guards/auth.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Get token from request headers
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('No auth token provided');
    }

    try {
      // In a real app, you would validate the token here
      // For this mock implementation, we'll assume any token is valid
      // and just set a mock user ID
      request.user = {
        id: 'mock-user-id',
        email: 'user@example.com'
      };
      
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
