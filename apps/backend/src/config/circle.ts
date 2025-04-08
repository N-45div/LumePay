export const circleConfig = {
  apiKey: process.env.CIRCLE_API_KEY || '',
  baseUrl: process.env.CIRCLE_API_URL || 'https://api.circle.com/v1',
  walletUrl: process.env.CIRCLE_WALLET_URL || 'https://api.circle.com/v1/w3s',
  environment: process.env.CIRCLE_ENVIRONMENT || 'sandbox',
  callbackSecret: process.env.CIRCLE_CALLBACK_SECRET || '',
  callbackUrl: process.env.CIRCLE_CALLBACK_URL || 'https://api.lumesquare.com/api/payments/webhook',
  appId: process.env.CIRCLE_APP_ID || '',
  entitySecret: process.env.CIRCLE_ENTITY_SECRET || ''
};
