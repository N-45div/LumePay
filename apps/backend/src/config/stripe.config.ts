import { registerAs } from '@nestjs/config';
export default registerAs('stripe', () => ({
  apiKey: process.env.STRIPE_API_KEY || 'sk_test_example',
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_example',
  publicKey: process.env.STRIPE_PUBLIC_KEY || 'pk_test_example',
  debug: process.env.NODE_ENV !== 'production',
}));
