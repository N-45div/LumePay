// apps/backend/src/services/core/banking/validation/__tests__/BankValidationService.test.ts

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BankValidationService } from '@/services/core/banking/validation/BankValidationService';
import { BankError } from '@/services/core/banking/errors/BankErrors';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BankValidationService', () => {
    let service: BankValidationService;
    let configService: ConfigService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BankValidationService,
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn().mockImplementation((key: string) => {
                            if (key === 'BANK_VALIDATION_API_KEY') return 'test_api_key';
                            if (key === 'BANK_VALIDATION_API_URL') return 'http://test.api';
                            if (key === 'BANK_VALIDATION_TIMEOUT') return 5000;
                            if (key === 'NODE_ENV') return 'test';
                            return undefined;
                        })
                    }
                }
            ]
        }).compile();

        service = module.get<BankValidationService>(BankValidationService);
        configService = module.get<ConfigService>(ConfigService);

        // Reset axios mock
        mockedAxios.create.mockReturnValue(mockedAxios as any);
        mockedAxios.post.mockReset();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('validateBank', () => {
        const validRequest = {
            accountNumber: '1234567890',
            routingNumber: '021000021',
            accountType: 'checking'
        };

        it('should successfully validate a bank account', async () => {
            const mockResponse = {
                data: {
                    isValid: true,
                    bankInfo: {
                        name: 'Test Bank',
                        id: 'bank_123',
                        routingNumber: validRequest.routingNumber
                    },
                    accountInfo: {
                        exists: true,
                        type: 'checking',
                        status: 'active',
                        lastFour: '7890'
                    }
                }
            };

            mockedAxios.post.mockResolvedValueOnce(mockResponse);

            const result = await service.validateBank(validRequest);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.isValid).toBe(true);
                expect(result.data.bankInfo?.name).toBe('Test Bank');
            }
        });

        it('should handle invalid bank accounts', async () => {
            const mockResponse = {
                data: {
                    isValid: false,
                    error: {
                        code: 'INVALID_ACCOUNT',
                        message: 'Account not found'
                    }
                }
            };

            mockedAxios.post.mockResolvedValueOnce(mockResponse);

            const result = await service.validateBank(validRequest);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.isValid).toBe(false);
                expect(result.data.error).toBeDefined();
                expect(result.data.error?.code).toBe('INVALID_ACCOUNT');
            }
        });

        it('should handle API errors', async () => {
            const mockError = new Error('API Error');
            mockError.name = 'AxiosError';
            (mockError as any).isAxiosError = true;
            (mockError as any).response = { status: 500, data: { message: 'Server error' }};

            mockedAxios.post.mockRejectedValueOnce(mockError);

            const result = await service.validateBank(validRequest);

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBeInstanceOf(BankError);
                expect(result.error.code).toBe('BANK_VALIDATION_API_ERROR');
            }
        });

        it('should use mock validation in development when API key is not set', async () => {
            // 1. Override the ConfigService get method to return different values
            jest.spyOn(configService, 'get').mockImplementation((key: string) => {
                if (key === 'NODE_ENV') return 'development';
                if (key === 'BANK_VALIDATION_TIMEOUT') return 5000;
                // Return empty values for API key and URL to trigger mock mode
                return '';
            });

            // 2. Call the service - it should now use mock validation
            const result = await service.validateBank(validRequest);

            // 3. Verify results
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.isValid).toBe(true);
                expect(result.data.bankInfo).toBeDefined();
                expect(result.data.bankInfo?.name).toBe('Mock Bank');
            }

            // 4. Verify that the API was never called
            expect(mockedAxios.post).not.toHaveBeenCalled();
        });
    });
});