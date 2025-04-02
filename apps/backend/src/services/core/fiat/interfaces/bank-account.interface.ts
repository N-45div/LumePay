// apps/backend/src/services/core/fiat/interfaces/bank-account.interface.ts

import { Result } from '../../../../utils/result';
import { PaymentError } from '../../payment/errors/PaymentErrors';

/**
 * Bank account types supported by the system
 */
export enum BankAccountType {
  CHECKING = 'checking',
  SAVINGS = 'savings',
  BUSINESS = 'business'
}

/**
 * Status of a bank account in our system
 */
export enum BankAccountStatus {
  PENDING_VERIFICATION = 'pending_verification',
  VERIFIED = 'verified',
  VERIFICATION_FAILED = 'verification_failed',
  DISABLED = 'disabled'
}

/**
 * Account ownership verification methods
 */
export enum VerificationMethod {
  MICRO_DEPOSITS = 'micro_deposits',
  PLAID = 'plaid',
  INSTANT = 'instant',
  MANUAL = 'manual'
}

/**
 * Represents a bank account in our system
 */
export interface BankAccount {
  id: string;
  userId: string;
  name: string;
  accountType: BankAccountType;
  accountNumberLast4: string;
  routingNumber?: string;
  institutionName: string;
  status: BankAccountStatus;
  verificationMethod?: VerificationMethod;
  processorToken?: string; // Token used by payment processors
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Parameters for adding a new bank account
 */
export interface AddBankAccountParams {
  userId: string;
  accountNumber: string;
  routingNumber: string;
  accountType: BankAccountType;
  accountHolderName: string;
  institutionName: string;
  name?: string; // Friendly name for the account
  verificationMethod?: VerificationMethod;
  metadata?: Record<string, any>;
}

/**
 * Parameters for verifying a bank account with micro-deposits
 */
export interface VerifyMicroDepositsParams {
  accountId: string;
  amounts: number[]; // Usually two small amounts
}

/**
 * Parameters for verifying a bank account with Plaid
 */
export interface VerifyPlaidParams {
  accountId: string;
  publicToken: string;
  plaidAccountId: string; // ID of the specific account in Plaid
}

/**
 * Interface for bank account services
 */
export interface IBankAccountService {
  /**
   * Add a new bank account
   */
  addBankAccount(params: AddBankAccountParams): Promise<Result<BankAccount, PaymentError>>;
  
  /**
   * Get a bank account by ID
   */
  getBankAccount(accountId: string): Promise<Result<BankAccount, PaymentError>>;
  
  /**
   * List all bank accounts for a user
   */
  getUserBankAccounts(userId: string): Promise<Result<BankAccount[], PaymentError>>;
  
  /**
   * Update bank account details
   */
  updateBankAccount(accountId: string, updates: Partial<BankAccount>): Promise<Result<BankAccount, PaymentError>>;
  
  /**
   * Disable a bank account
   */
  disableBankAccount(accountId: string): Promise<Result<boolean, PaymentError>>;
  
  /**
   * Verify a bank account using micro-deposits
   */
  verifyWithMicroDeposits(params: VerifyMicroDepositsParams): Promise<Result<BankAccount, PaymentError>>;
  
  /**
   * Verify a bank account using Plaid
   */
  verifyWithPlaid?(params: VerifyPlaidParams): Promise<Result<BankAccount, PaymentError>>;
  
  /**
   * Initiate micro-deposits for verification
   */
  initiateMicroDeposits(accountId: string): Promise<Result<boolean, PaymentError>>;
  
  /**
   * Get a processor token for a bank account to use with payment processors
   */
  getProcessorToken(accountId: string, processor: string): Promise<Result<string, PaymentError>>;
}
