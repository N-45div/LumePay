// apps/backend/src/services/blockchain/solana/interfaces/wallet.interface.ts

import { PublicKey } from '@solana/web3.js';

/**
 * Types of supported wallets
 */
export enum WalletType {
  USER = 'user',
  PLATFORM = 'platform',
  TREASURY = 'treasury',
  ESCROW = 'escrow'
}

/**
 * Status of a wallet
 */
export enum WalletStatus {
  ACTIVE = 'active',
  FROZEN = 'frozen',
  CLOSED = 'closed'
}

/**
 * Wallet interface for the Solana blockchain
 */
export interface WalletDetails {
  id: string;
  userId: string;
  publicKey: string;
  type: WalletType;
  status: WalletStatus;
  label?: string;
  createdAt: Date;
  lastUsedAt?: Date;
  walletIndex?: number; // For derivation path in HD wallets
  balances?: Record<string, number>; // Token address -> amount
  metadata?: Record<string, any>;
}

/**
 * Parameters for creating a wallet
 */
export interface CreateWalletParams {
  userId: string;
  type: WalletType;
  label?: string;
  metadata?: Record<string, any>;
}

/**
 * Parameters for a transaction
 */
export interface SolanaTransactionParams {
  fromWalletId: string;
  toAddress: string;
  amount: number;
  token?: string; // If undefined, assumes SOL
  reference?: string;
  metadata?: Record<string, any>;
}

/**
 * Result of a submitted transaction
 */
export interface SolanaTransactionResult {
  success: boolean;
  transactionId?: string;
  signature?: string;
  error?: {
    code: string;
    message: string;
  };
  blockTime?: number;
  fee?: number;
  slot?: number;
}

/**
 * Token balance details
 */
export interface TokenBalance {
  mint: string;
  tokenName?: string;
  tokenSymbol?: string;
  amount: number;
  decimals: number;
  uiAmount: number; // Amount adjusted for decimals
  usdValue?: number;
}

/**
 * Interface for the wallet service
 */
export interface IWalletService {
  /**
   * Create a new wallet
   */
  createWallet(params: CreateWalletParams): Promise<WalletDetails>;
  
  /**
   * Get a wallet by ID
   */
  getWallet(id: string): Promise<WalletDetails>;
  
  /**
   * Get a wallet by public key
   */
  getWalletByPublicKey(publicKey: string): Promise<WalletDetails>;
  
  /**
   * Get wallets for a user
   */
  getUserWallets(userId: string): Promise<WalletDetails[]>;
  
  /**
   * Update wallet metadata
   */
  updateWalletMetadata(id: string, metadata: Record<string, any>): Promise<WalletDetails>;
  
  /**
   * Change wallet status
   */
  changeWalletStatus(id: string, status: WalletStatus): Promise<WalletDetails>;
  
  /**
   * Get SOL balance for a wallet
   */
  getSolBalance(walletId: string): Promise<number>;
  
  /**
   * Get token balances for a wallet
   */
  getTokenBalances(walletId: string): Promise<TokenBalance[]>;
  
  /**
   * Transfer SOL
   */
  transferSol(params: SolanaTransactionParams): Promise<SolanaTransactionResult>;
  
  /**
   * Transfer SPL token
   */
  transferToken(params: SolanaTransactionParams): Promise<SolanaTransactionResult>;
  
  /**
   * Sign a message using the wallet
   */
  signMessage(walletId: string, message: string): Promise<{ signature: string }>;
}
