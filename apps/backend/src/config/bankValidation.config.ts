// apps/backend/src/config/bankValidation.config.ts

import { registerAs } from '@nestjs/config';

export default registerAs('bankValidation', () => ({
    apiKey: process.env.BANK_VALIDATION_API_KEY,
    apiUrl: process.env.BANK_VALIDATION_API_URL,
    timeout: parseInt(process.env.BANK_VALIDATION_TIMEOUT || '5000', 10),
    useMockValidation: process.env.USE_MOCK_BANK_VALIDATION === 'true'
}));