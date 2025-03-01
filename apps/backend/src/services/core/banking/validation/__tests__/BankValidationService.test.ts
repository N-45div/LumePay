// apps/backend/src/services/core/banking/validation/__tests__/BankValidationService.test.ts

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BankValidationService } from '../BankValidationService';
import { BankError } from '../../errors/BankErrors';
import axios, { AxiosError } from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BankValidationService', () => {
    let service: BankValidationService;
    let configService: ConfigService;

    // Set up a default config for tests
    const mockEnvVars: Record<string, any> = {
        'BANK_VALIDATION_API_KEY': 'test_api_key',
        'BANK_VALIDATION_API_URL': 'http://test.api',
        'BANK_VALIDATION_TIMEOUT': 5000,
        'NODE_ENV': 'test'
    };

    // Helper function to create a mock config getter
    const createMockConfig = (overrides: Record<string, any> = {}) => {
        return (key: string): any => {
            const config = { ...mockEnvVars, ...overrides };
            return config[key];
        };
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BankValidationService,
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn().mockImplementation(createMockConfig())
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
            // Create a proper Axios error with all required properties
            const axiosError = new Error('API Error') as AxiosError;
            axiosError.isAxiosError = true;
            axiosError.name = 'AxiosError';
            axiosError.message = 'API Error';
            axiosError.response = {
                status: 500,
                statusText: 'Server Error',
                headers: {},
                config: {} as any,
                data: { message: 'Internal server error' }
            };

            mockedAxios.post.mockRejectedValueOnce(axiosError);

            const result = await service.validateBank(validRequest);

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBeInstanceOf(BankError);
                expect(result.error.code).toBe('BANK_VALIDATION_API_ERROR');
            }
        });

        it('should use mock validation in development when API key is not set', async () => {
            // Override the config to simulate development environment with no API key
            jest.spyOn(configService, 'get').mockImplementation(createMockConfig({
                'NODE_ENV': 'development',
                'BANK_VALIDATION_API_KEY': '',
                'BANK_VALIDATION_API_URL': ''
            }));

            // Recreate the service to pick up the new config
            const module = await Test.createTestingModule({
                providers: [
                    BankValidationService,
                    {
                        provide: ConfigService,
                        useValue: configService
                    }
                ]
            }).compile();

            const newService = module.get<BankValidationService>(BankValidationService);
            
            // Call the service - it should use mock validation since we're in dev with no API key
            const result = await newService.validateBank(validRequest);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.isValid).toBe(true);
                expect(result.data.bankInfo).toBeDefined();
                expect(result.data.bankInfo?.name).toBe('Mock Bank');
            }

            // Verify that the API was never called
            expect(mockedAxios.post).not.toHaveBeenCalled();
        });
    });
});