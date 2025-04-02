// apps/backend/src/services/core/fiat/bank-account.service.ts

import { Injectable } from '@nestjs/common';
import { 
  IBankAccountService,
  BankAccount as BankAccountInterface,
  AddBankAccountParams,
  VerifyMicroDepositsParams,
  VerifyPlaidParams,
  BankAccountStatus,
  VerificationMethod,
  BankAccountType
} from './interfaces/bank-account.interface';
import { Result, createSuccess, createError } from '../../../utils/result';
import { PaymentError } from '../payment/errors/PaymentErrors';
import { Logger } from '../../../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { BankAccountRepository } from '../../../db/repositories/bank-account.repository';
import { ConfigService } from '@nestjs/config';
import { 
  BankAccount as BankAccountEntity,
  BankAccountStatus as EntityBankAccountStatus
} from '../../../db/models/bank-account.entity';

// Helper function to convert between enum types
const convertStatus = {
  toEntity: (status: BankAccountStatus): EntityBankAccountStatus => {
    // Map the interface enum to the entity enum
    switch (status) {
      case BankAccountStatus.PENDING_VERIFICATION:
        return EntityBankAccountStatus.PENDING_VERIFICATION;
      case BankAccountStatus.VERIFIED:
        return EntityBankAccountStatus.VERIFIED;
      case BankAccountStatus.VERIFICATION_FAILED:
        return EntityBankAccountStatus.VERIFICATION_FAILED;
      case BankAccountStatus.DISABLED:
        return EntityBankAccountStatus.DISABLED;
      default:
        return EntityBankAccountStatus.PENDING_VERIFICATION;
    }
  },
  toInterface: (status: EntityBankAccountStatus): BankAccountStatus => {
    // Map the entity enum to the interface enum
    switch (status) {
      case EntityBankAccountStatus.PENDING_VERIFICATION:
        return BankAccountStatus.PENDING_VERIFICATION;
      case EntityBankAccountStatus.VERIFIED:
        return BankAccountStatus.VERIFIED;
      case EntityBankAccountStatus.VERIFICATION_FAILED:
        return BankAccountStatus.VERIFICATION_FAILED;
      case EntityBankAccountStatus.DISABLED:
        return BankAccountStatus.DISABLED;
      default:
        return BankAccountStatus.PENDING_VERIFICATION;
    }
  }
};

@Injectable()
export class BankAccountService implements IBankAccountService {
  private logger: Logger;
  private minMicroDepositAmount: number;
  private maxMicroDepositAmount: number;
  private microDeposits: Map<string, number[]> = new Map();
  
  constructor(
    private bankAccountRepository: BankAccountRepository,
    private configService: ConfigService
  ) {
    this.logger = new Logger('BankAccountService');
    
    // Config for micro-deposits
    this.minMicroDepositAmount = 0.01; // $0.01
    this.maxMicroDepositAmount = 0.99; // $0.99
  }
  
  async addBankAccount(params: AddBankAccountParams): Promise<Result<BankAccountInterface, PaymentError>> {
    try {
      // Validate the bank account details
      const validationResult = await this.validateBankAccountDetails(params);
      if (!validationResult.success) {
        return createError(validationResult.error);
      }
      
      // Mask sensitive data
      const accountNumberLast4 = params.accountNumber.slice(-4);
      
      // Create bank account entity
      const bankAccountData: Partial<BankAccountEntity> = {
        id: uuidv4(),
        userId: params.userId,
        name: params.name || `${params.institutionName} ${params.accountType}`,
        accountType: params.accountType,
        accountNumberLast4,
        routingNumber: params.routingNumber,
        institutionName: params.institutionName,
        status: EntityBankAccountStatus.PENDING_VERIFICATION,
        verificationMethod: params.verificationMethod || VerificationMethod.MICRO_DEPOSITS,
        metadata: params.metadata || {}
      };
      
      // Save to database
      const savedAccount = await this.bankAccountRepository.createBankAccount(bankAccountData as any);
      
      // If instant verification is selected, mark as verified immediately
      // This would be for testing or certain trusted sources
      if (savedAccount.verificationMethod === VerificationMethod.INSTANT) {
        await this.bankAccountRepository.updateStatus(
          savedAccount.id, 
          EntityBankAccountStatus.VERIFIED
        );
        
        // Retrieve the updated account
        const updatedAccount = await this.bankAccountRepository.findOne({
          where: { id: savedAccount.id }
        });
        
        if (!updatedAccount) {
          throw new PaymentError(
            `Updated account ${savedAccount.id} not found after verification`,
            'ACCOUNT_RETRIEVAL_ERROR'
          );
        }
        
        return createSuccess(this.mapToInterface(updatedAccount));
      }
      
      this.logger.info(`Bank account created: ${savedAccount.id} for user ${savedAccount.userId}`);
      return createSuccess(this.mapToInterface(savedAccount));
    } catch (error) {
      this.logger.error(`Error adding bank account: ${error}`);
      return createError(new PaymentError(
        error instanceof Error ? error.message : 'Unknown error adding bank account',
        'BANK_ACCOUNT_CREATION_ERROR'
      ));
    }
  }
  
  async getBankAccount(accountId: string): Promise<Result<BankAccountInterface, PaymentError>> {
    try {
      const account = await this.bankAccountRepository.findOne({
        where: { id: accountId }
      });
      
      if (!account) {
        return createError(new PaymentError(
          `Bank account ${accountId} not found`,
          'BANK_ACCOUNT_NOT_FOUND'
        ));
      }
      
      return createSuccess(this.mapToInterface(account));
    } catch (error) {
      return createError(new PaymentError(
        error instanceof Error ? error.message : 'Unknown error retrieving bank account',
        'BANK_ACCOUNT_RETRIEVAL_ERROR'
      ));
    }
  }
  
  async getUserBankAccounts(userId: string): Promise<Result<BankAccountInterface[], PaymentError>> {
    try {
      const accounts = await this.bankAccountRepository.findByUserId(userId);
      return createSuccess(accounts.map(account => this.mapToInterface(account)));
    } catch (error) {
      return createError(new PaymentError(
        error instanceof Error ? error.message : 'Unknown error retrieving user bank accounts',
        'BANK_ACCOUNTS_RETRIEVAL_ERROR'
      ));
    }
  }
  
  async updateBankAccount(accountId: string, updates: Partial<BankAccountInterface>): Promise<Result<BankAccountInterface, PaymentError>> {
    try {
      // Ensure the account exists
      const accountResult = await this.getBankAccount(accountId);
      if (!accountResult.success) {
        return createError(accountResult.error);
      }
      
      // Prevent updating certain fields
      const safeUpdates = { ...updates };
      delete safeUpdates.id;
      delete safeUpdates.userId;
      delete safeUpdates.accountNumberLast4;
      delete safeUpdates.createdAt;
      
      // Convert status if present
      if (safeUpdates.status) {
        (safeUpdates as any).status = convertStatus.toEntity(safeUpdates.status);
      }
      
      // Update the account
      await this.bankAccountRepository.update(accountId, safeUpdates as any);
      
      // Get the updated account
      const updatedAccountResult = await this.getBankAccount(accountId);
      if (!updatedAccountResult.success) {
        return createError(updatedAccountResult.error);
      }
      
      return createSuccess(updatedAccountResult.data);
    } catch (error) {
      return createError(new PaymentError(
        error instanceof Error ? error.message : 'Unknown error updating bank account',
        'BANK_ACCOUNT_UPDATE_ERROR'
      ));
    }
  }
  
  async disableBankAccount(accountId: string): Promise<Result<boolean, PaymentError>> {
    try {
      // Ensure the account exists
      const accountResult = await this.getBankAccount(accountId);
      if (!accountResult.success) {
        return createError(accountResult.error);
      }
      
      // Update the account status
      await this.bankAccountRepository.updateStatus(
        accountId,
        "disabled" // Use string literal to bypass enum type issues
      );
      
      this.logger.info(`Bank account ${accountId} disabled`);
      return createSuccess(true);
    } catch (error) {
      return createError(new PaymentError(
        error instanceof Error ? error.message : 'Unknown error disabling bank account',
        'DISABLE_ACCOUNT_ERROR'
      ));
    }
  }
  
  async verifyWithMicroDeposits(params: VerifyMicroDepositsParams): Promise<Result<BankAccountInterface, PaymentError>> {
    try {
      const accountResult = await this.getBankAccount(params.accountId);
      
      if (!accountResult.success) {
        return accountResult;
      }
      
      const account = accountResult.data;
      
      // Check if this account is pending verification
      if (account.status !== BankAccountStatus.PENDING_VERIFICATION) {
        return createError(new PaymentError(
          `Bank account ${params.accountId} is not pending verification`,
          'INVALID_ACCOUNT_STATUS'
        ));
      }
      
      // Check if this account is set up for micro-deposit verification
      if (account.verificationMethod !== VerificationMethod.MICRO_DEPOSITS) {
        return createError(new PaymentError(
          `Bank account ${params.accountId} is not set up for micro-deposit verification`,
          'INVALID_VERIFICATION_METHOD'
        ));
      }
      
      // Get the micro-deposits for this account
      const microDeposits = this.microDeposits.get(params.accountId);
      
      if (!microDeposits || microDeposits.length !== 2) {
        return createError(new PaymentError(
          `No micro-deposits found for account ${params.accountId}`,
          'NO_MICRO_DEPOSITS'
        ));
      }
      
      // Sort both arrays to compare them regardless of order
      const sortedActual = [...microDeposits].sort();
      const sortedProvided = [...params.amounts].sort();
      
      // Compare the amounts
      const match = 
        sortedActual.length === sortedProvided.length &&
        sortedActual.every((value, index) => Math.abs(value - sortedProvided[index]) < 0.001); // Allow small floating point differences
      
      if (!match) {
        return createError(new PaymentError(
          'Micro-deposit amounts do not match',
          'MICRO_DEPOSIT_MISMATCH'
        ));
      }
      
      // Log diagnostic information for debugging enum issues
      console.log('DEBUG - Before updateStatus call:', { 
        accountId: params.accountId,
        currentStatus: account.status,
        targetStatus: BankAccountStatus.VERIFIED
      });
      
      // Update the account status
      await this.bankAccountRepository.updateStatus(
        params.accountId,
        "verified" // Use string literal to bypass enum type issues
      );
      
      console.log('DEBUG - After updateStatus call');
      
      // Get the updated account
      const updatedAccountResult = await this.getBankAccount(params.accountId);
      
      // Clean up micro-deposits record
      this.microDeposits.delete(params.accountId);
      
      this.logger.info(`Bank account ${params.accountId} verified with micro-deposits`);
      return updatedAccountResult;
    } catch (error) {
      console.error('ERROR - verifyWithMicroDeposits failed:', error);
      return createError(new PaymentError(
        error instanceof Error ? error.message : 'Unknown error verifying with micro-deposits',
        'MICRO_DEPOSIT_VERIFICATION_ERROR'
      ));
    }
  }
  
  async verifyWithPlaid(params: VerifyPlaidParams): Promise<Result<BankAccountInterface, PaymentError>> {
    try {
      // Ensure the account exists
      const accountResult = await this.getBankAccount(params.accountId);
      if (!accountResult.success) {
        return createError(accountResult.error);
      }
      
      const account = accountResult.data;
      
      // Check that the account is pending verification
      if (account.status !== BankAccountStatus.PENDING_VERIFICATION) {
        return createError(new PaymentError(
          `Bank account ${params.accountId} is not pending verification`,
          'INVALID_ACCOUNT_STATUS'
        ));
      }
      
      // Mock Plaid verification - in a real app we'd call the Plaid API
      // to exchange a public token for an access token and get account info
      this.logger.info(`Verifying bank account ${params.accountId} with Plaid`);
      
      // Mock successful verification
      // Update the account status
      await this.bankAccountRepository.updateStatus(
        params.accountId,
        "verified" // Use string literal to bypass enum type issues
      );
      
      // Get the updated account
      const updatedAccountResult = await this.getBankAccount(params.accountId);
      
      this.logger.info(`Bank account ${params.accountId} verified with Plaid`);
      return updatedAccountResult;
    } catch (error) {
      return createError(new PaymentError(
        error instanceof Error ? error.message : 'Unknown error verifying with Plaid',
        'PLAID_VERIFICATION_ERROR'
      ));
    }
  }
  
  async initiateMicroDeposits(accountId: string): Promise<Result<boolean, PaymentError>> {
    try {
      // Ensure the account exists
      const accountResult = await this.getBankAccount(accountId);
      if (!accountResult.success) {
        return createError(accountResult.error);
      }
      
      const account = accountResult.data;
      
      // Check that the account is pending verification
      if (account.status !== BankAccountStatus.PENDING_VERIFICATION) {
        return createError(new PaymentError(
          `Bank account ${accountId} is not pending verification`,
          'INVALID_ACCOUNT_STATUS'
        ));
      }
      
      // Generate two random micro-deposit amounts
      const deposit1 = this.generateMicroDepositAmount();
      const deposit2 = this.generateMicroDepositAmount();
      
      // Store these for later verification
      this.microDeposits.set(accountId, [deposit1, deposit2]);
      
      // In a real implementation, this would initiate actual micro-deposits
      // through an ACH processor or bank partner
      
      this.logger.info(`Micro-deposits initiated for bank account ${accountId}`);
      return createSuccess(true);
    } catch (error) {
      return createError(new PaymentError(
        error instanceof Error ? error.message : 'Unknown error initiating micro-deposits',
        'MICRO_DEPOSIT_INITIATION_ERROR'
      ));
    }
  }
  
  async getProcessorToken(accountId: string, processor: string): Promise<Result<string, PaymentError>> {
    try {
      // Ensure the account exists
      const accountResult = await this.getBankAccount(accountId);
      if (!accountResult.success) {
        return createError(accountResult.error);
      }
      
      const account = accountResult.data;
      
      // Check that the account is verified
      if (account.status !== BankAccountStatus.VERIFIED) {
        return createError(new PaymentError(
          `Bank account ${accountId} is not verified`,
          'UNVERIFIED_ACCOUNT'
        ));
      }
      
      // Check if we already have a processor token
      if (account.processorToken) {
        return createSuccess(account.processorToken);
      }
      
      // In a real implementation, this would generate a processor token
      // through Plaid or another provider
      const processorToken = `${processor}_token_${accountId}_${Date.now()}`;
      
      // Update the account with the new token
      await this.bankAccountRepository.update(accountId, {
        processorToken
      } as any);
      
      return createSuccess(processorToken);
    } catch (error) {
      return createError(new PaymentError(
        error instanceof Error ? error.message : 'Unknown error getting processor token',
        'PROCESSOR_TOKEN_ERROR'
      ));
    }
  }
  
  /**
   * Validate bank account details with external services or internal rules
   */
  private async validateBankAccountDetails(params: AddBankAccountParams): Promise<Result<boolean, PaymentError>> {
    try {
      // In a real implementation, this would validate the routing number against a
      // database of valid routing numbers, check account number format, etc.
      
      // Simple validation for now
      if (!params.accountNumber || params.accountNumber.length < 8) {
        return createError(new PaymentError(
          'Invalid account number format',
          'INVALID_ACCOUNT_NUMBER'
        ));
      }
      
      if (!params.routingNumber || params.routingNumber.length !== 9) {
        return createError(new PaymentError(
          'Invalid routing number format',
          'INVALID_ROUTING_NUMBER'
        ));
      }
      
      // Mock validation of routing number
      if (!this.validateRoutingNumber(params.routingNumber)) {
        return createError(new PaymentError(
          'Invalid routing number',
          'INVALID_ROUTING_NUMBER'
        ));
      }
      
      return createSuccess(true);
    } catch (error) {
      return createError(new PaymentError(
        error instanceof Error ? error.message : 'Unknown error validating bank account details',
        'BANK_ACCOUNT_VALIDATION_ERROR'
      ));
    }
  }
  
  /**
   * Validate a routing number using the checksum algorithm
   * https://en.wikipedia.org/wiki/ABA_routing_transit_number#Check_digit
   */
  private validateRoutingNumber(routingNumber: string): boolean {
    if (!/^\d{9}$/.test(routingNumber)) {
      return false;
    }
    
    const digits = routingNumber.split('').map(Number);
    const sum = 
      3 * (digits[0] + digits[3] + digits[6]) +
      7 * (digits[1] + digits[4] + digits[7]) +
      1 * (digits[2] + digits[5] + digits[8]);
    
    return sum % 10 === 0;
  }
  
  /**
   * Generate a random micro-deposit amount
   */
  private generateMicroDepositAmount(): number {
    const minCents = this.minMicroDepositAmount * 100;
    const maxCents = this.maxMicroDepositAmount * 100;
    const centsAmount = Math.floor(Math.random() * (maxCents - minCents + 1)) + minCents;
    return parseFloat((centsAmount / 100).toFixed(2));
  }
  
  /**
   * Map a database entity to our interface
   */
  private mapToInterface(entity: BankAccountEntity): BankAccountInterface {
    return {
      id: entity.id,
      userId: entity.userId,
      name: entity.name,
      accountType: entity.accountType,
      accountNumberLast4: entity.accountNumberLast4,
      routingNumber: entity.routingNumber,
      institutionName: entity.institutionName,
      status: convertStatus.toInterface(entity.status),
      verificationMethod: entity.verificationMethod,
      processorToken: entity.processorToken,
      metadata: entity.metadata,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt
    };
  }
}
