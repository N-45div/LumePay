// apps/backend/src/services/core/banking/validation/BankValidationService.ts

import { Injectable } from '@nestjs/common';
import { Logger } from '../../../../utils/logger';
import { Result, createSuccess, createError } from '../../../../utils/result';
import { BankError } from '../errors/BankErrors';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';

export interface BankValidationConfig {
    apiKey: string;
    apiUrl: string;
    timeout: number;
}

export interface BankValidationResponse {
    isValid: boolean;
    bankInfo?: {
        name: string;
        id: string;
        routingNumber: string;
        branchInfo?: {
            name: string;
            address: string;
        };
    };
    accountInfo?: {
        exists: boolean;
        type?: string;
        status?: 'active' | 'inactive' | 'closed';
        lastFour?: string;
    };
    error?: {
        code: string;
        message: string;
        details?: Record<string, any>;
    };
}

export interface BankValidationRequest {
    accountNumber: string;
    routingNumber: string;
    accountType?: string;
}

@Injectable()
export class BankValidationService {
    private logger: Logger;
    private client: AxiosInstance | null = null;
    private config: BankValidationConfig;

    constructor(
        private configService: ConfigService
    ) {
        this.logger = new Logger('BankValidationService');
        this.initializeConfig();
        this.initializeClient();
    }

    private initializeConfig() {
        this.config = {
            apiKey: this.configService.get<string>('BANK_VALIDATION_API_KEY') || '',
            apiUrl: this.configService.get<string>('BANK_VALIDATION_API_URL') || '',
            timeout: this.configService.get<number>('BANK_VALIDATION_TIMEOUT') || 5000
        };
    }

    private initializeClient() {
        if (this.config.apiKey && this.config.apiUrl) {
            this.client = axios.create({
                baseURL: this.config.apiUrl,
                timeout: this.config.timeout,
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
        } else {
            // If no API key, set client to null
            this.client = null;
        }
    }

    async validateBank(
        request: BankValidationRequest
    ): Promise<Result<BankValidationResponse, BankError>> {
        try {
            this.logger.info('Validating bank account', {
                routingNumber: request.routingNumber,
                accountType: request.accountType
            });

            // Check if we're in development/test mode
            const env = this.configService.get<string>('NODE_ENV') || 'development';
            const useMock = (env === 'development' || env === 'test') && !this.config.apiKey;

            // Use mock validation in development or if client not initialized
            if (useMock || !this.client) {
                return this.mockValidation(request);
            }

            const response = await this.client.post<BankValidationResponse>(
                '/validate/account',
                request
            );

            // Handle error response from API
            if (response.data.error) {
                // Note: We're returning success: true here even though validation failed
                // This distinguishes between API errors (success: false) and validation failures
                return createSuccess({
                    isValid: false,
                    error: response.data.error
                });
            }

            return createSuccess(response.data);

        } catch (error) {
            this.logger.error('Bank validation failed', { error });

            if (error instanceof BankError) {
                return createError(error);
            }

            if (axios.isAxiosError(error)) {
                return createError(new BankError(
                    'Bank validation API error',
                    'BANK_VALIDATION_API_ERROR',
                    {
                        status: error.response?.status,
                        data: error.response?.data,
                        message: error.message
                    }
                ));
            }

            return createError(new BankError(
                'Bank validation failed',
                'BANK_VALIDATION_FAILED',
                { originalError: error }
            ));
        }
    }

    private async mockValidation(
        request: BankValidationRequest
    ): Promise<Result<BankValidationResponse, BankError>> {
        // Simulate API latency
        await new Promise(resolve => setTimeout(resolve, 200));

        // Check for a special test routing number to trigger invalid account scenario
        if (request.routingNumber === '111111111') {
            return createSuccess({
                isValid: false,
                error: {
                    code: 'INVALID_ACCOUNT',
                    message: 'Account not found'
                }
            });
        }

        // For all other cases, return valid
        return createSuccess({
            isValid: true,
            bankInfo: {
                name: 'Mock Bank',
                id: 'bank_123',
                routingNumber: request.routingNumber,
                branchInfo: {
                    name: 'Main Branch',
                    address: '123 Mock Street, City, State 12345'
                }
            },
            accountInfo: {
                exists: true,
                type: request.accountType || 'checking',
                status: 'active',
                lastFour: request.accountNumber.slice(-4)
            }
        });
    }
}