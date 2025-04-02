// apps/backend/src/providers/stripe.provider.ts
import { ConfigService } from '@nestjs/config';

/**
 * Factory function for creating the Stripe client
 * This abstracts the Stripe initialization to allow for easier testing
 */
export const stripeFactory = (configService: ConfigService) => {
  const apiKey = configService.get<string>('STRIPE_API_KEY', 'sk_test_example');
  
  // In a real application, we would use the actual Stripe SDK:
  // return new Stripe(apiKey, { apiVersion: '2023-10-16' });
  
  // For the current implementation, we're using our simulated client
  // which is created in the StripeProcessor
  return { apiKey };
};
