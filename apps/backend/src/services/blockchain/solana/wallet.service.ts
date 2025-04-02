// apps/backend/src/services/blockchain/solana/wallet.service.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../../../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  SystemProgram, 
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction
} from '@solana/web3.js';
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import * as bs58 from 'bs58';
import * as nacl from 'tweetnacl';
import {
  WalletDetails,
  WalletType,
  WalletStatus,
  CreateWalletParams,
  IWalletService,
  SolanaTransactionParams,
  SolanaTransactionResult,
  TokenBalance
} from './interfaces/wallet.interface';
import { TransactionTrackingService } from '../../core/payment/transaction-tracking.service';
import { TransactionStatus } from '../../../common/types/transaction.types';
import { TransactionType } from '../../../db/models/transaction.entity';
import { Result, createSuccess, createError } from '../../../utils/result';

/**
 * Service for managing Solana wallets and transactions
 */
@Injectable()
export class SolanaWalletService implements IWalletService {
  private logger: Logger;
  private connection: Connection;
  private platformWallet: Keypair;
  private wallets: Map<string, WalletDetails> = new Map();
  private keyPairs: Map<string, Keypair> = new Map();
  
  constructor(
    private configService: ConfigService,
    private transactionTrackingService: TransactionTrackingService
  ) {
    this.logger = new Logger('SolanaWalletService');
    
    // Initialize Solana connection
    const rpcUrl = this.configService.get<string>(
      'solana.rpcUrl', 
      'https://api.devnet.solana.com'
    );
    this.connection = new Connection(rpcUrl, 'confirmed');
    
    // Initialize platform wallet (in production, this would be securely stored and loaded)
    this.initializePlatformWallet();
    
    this.logger.info(`Initialized Solana wallet service with RPC URL: ${rpcUrl}`);
  }
  
  /**
   * Initialize the platform wallet
   * In production, the secret key would be stored securely (e.g., AWS KMS, HashiCorp Vault)
   */
  private initializePlatformWallet() {
    // For development, generate a random keypair
    // In production, this would be loaded from a secure storage
    const platformWalletSecret = this.configService.get<string>('solana.platformWalletSecret');
    
    if (platformWalletSecret) {
      // Convert secret key from base58 string to Uint8Array
      const secretKey = bs58.decode(platformWalletSecret);
      this.platformWallet = Keypair.fromSecretKey(secretKey);
    } else {
      this.platformWallet = Keypair.generate();
      this.logger.warn('Generated random platform wallet. This should NOT be used in production!');
      this.logger.info(`Platform wallet public key: ${this.platformWallet.publicKey.toString()}`);
    }
    
    // Store platform wallet details
    const platformWalletDetails: WalletDetails = {
      id: 'platform-wallet',
      userId: 'system',
      publicKey: this.platformWallet.publicKey.toString(),
      type: WalletType.PLATFORM,
      status: WalletStatus.ACTIVE,
      createdAt: new Date(),
      metadata: {
        isPlatformWallet: true
      }
    };
    
    this.wallets.set(platformWalletDetails.id, platformWalletDetails);
    this.keyPairs.set(platformWalletDetails.id, this.platformWallet);
  }
  
  /**
   * Create a new wallet for a user
   */
  async createWallet(params: CreateWalletParams): Promise<WalletDetails> {
    try {
      // Generate a new keypair for the wallet
      const keypair = Keypair.generate();
      
      // Create wallet details
      const wallet: WalletDetails = {
        id: uuidv4(),
        userId: params.userId,
        publicKey: keypair.publicKey.toString(),
        type: params.type,
        status: WalletStatus.ACTIVE,
        label: params.label || 'Default Wallet',
        createdAt: new Date(),
        metadata: params.metadata || {}
      };
      
      // Store the wallet and keypair
      this.wallets.set(wallet.id, wallet);
      this.keyPairs.set(wallet.id, keypair);
      
      this.logger.info(`Created wallet for user ${params.userId}: ${wallet.id}`);
      
      // In a production system, we would securely store the keypair
      // and only store the public key in the database
      
      // Airdrop some SOL for testing on devnet
      if (this.configService.get<string>('solana.network') === 'devnet') {
        try {
          const signature = await this.connection.requestAirdrop(
            keypair.publicKey,
            LAMPORTS_PER_SOL // 1 SOL
          );
          await this.connection.confirmTransaction(signature);
          this.logger.info(`Airdropped 1 SOL to wallet ${wallet.id}`);
        } catch (error: any) {
          this.logger.warn(`Failed to airdrop SOL to new wallet: ${error}`);
        }
      }
      
      return wallet;
    } catch (error: any) {
      this.logger.error(`Error creating wallet: ${error}`);
      throw new Error(`Failed to create wallet: ${error.message}`);
    }
  }
  
  /**
   * Get a wallet by ID
   */
  async getWallet(id: string): Promise<WalletDetails> {
    const wallet = this.wallets.get(id);
    if (!wallet) {
      throw new Error(`Wallet not found: ${id}`);
    }
    return wallet;
  }
  
  /**
   * Get a wallet by public key
   */
  async getWalletByPublicKey(publicKey: string): Promise<WalletDetails> {
    for (const wallet of this.wallets.values()) {
      if (wallet.publicKey === publicKey) {
        return wallet;
      }
    }
    throw new Error(`Wallet not found for public key: ${publicKey}`);
  }
  
  /**
   * Get wallets for a user
   */
  async getUserWallets(userId: string): Promise<WalletDetails[]> {
    const userWallets: WalletDetails[] = [];
    for (const wallet of this.wallets.values()) {
      if (wallet.userId === userId) {
        userWallets.push(wallet);
      }
    }
    return userWallets;
  }
  
  /**
   * Update wallet metadata
   */
  async updateWalletMetadata(id: string, metadata: Record<string, any>): Promise<WalletDetails> {
    const wallet = this.wallets.get(id);
    if (!wallet) {
      throw new Error(`Wallet not found: ${id}`);
    }
    
    wallet.metadata = {
      ...wallet.metadata,
      ...metadata
    };
    
    this.wallets.set(id, wallet);
    return wallet;
  }
  
  /**
   * Change wallet status
   */
  async changeWalletStatus(id: string, status: WalletStatus): Promise<WalletDetails> {
    const wallet = this.wallets.get(id);
    if (!wallet) {
      throw new Error(`Wallet not found: ${id}`);
    }
    
    wallet.status = status;
    this.wallets.set(id, wallet);
    
    this.logger.info(`Changed wallet ${id} status to ${status}`);
    return wallet;
  }
  
  /**
   * Get SOL balance for a wallet
   */
  async getSolBalance(walletId: string): Promise<number> {
    const wallet = await this.getWallet(walletId);
    
    try {
      const publicKey = new PublicKey(wallet.publicKey);
      const balance = await this.connection.getBalance(publicKey);
      return balance / LAMPORTS_PER_SOL; // Convert lamports to SOL
    } catch (error: any) {
      this.logger.error(`Error getting SOL balance: ${error}`);
      throw new Error(`Failed to get SOL balance: ${error.message}`);
    }
  }
  
  /**
   * Get token balances for a wallet
   */
  async getTokenBalances(walletId: string): Promise<TokenBalance[]> {
    const wallet = await this.getWallet(walletId);
    
    try {
      const publicKey = new PublicKey(wallet.publicKey);
      
      // Get all token accounts owned by this wallet
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );
      
      const balances: TokenBalance[] = [];
      
      for (const { account } of tokenAccounts.value) {
        const tokenInfo = account.data.parsed.info;
        const mint = tokenInfo.mint;
        const amount = Number(tokenInfo.tokenAmount.amount);
        const decimals = tokenInfo.tokenAmount.decimals;
        const uiAmount = tokenInfo.tokenAmount.uiAmount;
        
        balances.push({
          mint,
          amount,
          decimals,
          uiAmount,
          // In a real application, we would fetch token metadata and USD value
          tokenName: 'Unknown',
          tokenSymbol: 'UNK'
        });
      }
      
      return balances;
    } catch (error: any) {
      this.logger.error(`Error getting token balances: ${error}`);
      throw new Error(`Failed to get token balances: ${error.message}`);
    }
  }
  
  /**
   * Transfer SOL
   */
  async transferSol(params: SolanaTransactionParams): Promise<Result<SolanaTransactionResult, { code: string; message: string }>> {
    try {
      const fromWallet = await this.getWallet(params.fromWalletId);
      const keypair = this.keyPairs.get(params.fromWalletId);
      
      if (!keypair) {
        throw new Error(`Keypair not found for wallet: ${params.fromWalletId}`);
      }
      
      if (fromWallet.status !== WalletStatus.ACTIVE) {
        throw new Error(`Wallet is not active: ${params.fromWalletId}`);
      }
      
      const toPublicKey = new PublicKey(params.toAddress);
      const lamports = params.amount * LAMPORTS_PER_SOL;
      
      // Create transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: toPublicKey,
          lamports
        })
      );
      
      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = keypair.publicKey;
      
      // Sign transaction
      transaction.sign(keypair);
      
      // Send transaction
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize()
      );
      
      // Wait for confirmation
      const confirmation = await this.connection.confirmTransaction(signature);
      
      // Track the transaction in our system
      const trackingResult = await this.transactionTrackingService.createTransaction({
        userId: fromWallet.userId,
        amount: params.amount,
        currency: 'SOL',
        type: TransactionType.CRYPTO_PAYMENT,
        status: TransactionStatus.COMPLETED,
        sourceId: fromWallet.id,
        destinationId: params.toAddress,
        processorName: 'solana',
        processorTransactionId: signature,
        metadata: {
          blockTime: confirmation.context.slot,
          signature,
          reference: params.reference,
          ...params.metadata
        }
      });
      
      if (!trackingResult.success) {
        this.logger.warn(`Failed to track SOL transfer: ${trackingResult.error.message}`);
      }
      
      return createSuccess({
        success: true,
        transactionId: trackingResult.success ? trackingResult.data.id : undefined,
        signature,
        blockTime: confirmation.context.slot,
        slot: confirmation.context.slot
      });
    } catch (error: any) {
      this.logger.error(`Error transferring SOL: ${error}`);
      
      return createError({
        code: 'TRANSFER_FAILED',
        message: error.message
      });
    }
  }
  
  /**
   * Transfer SPL token
   */
  async transferToken(params: SolanaTransactionParams): Promise<Result<SolanaTransactionResult, { code: string; message: string }>> {
    try {
      if (!params.token) {
        throw new Error('Token mint address is required for token transfers');
      }
      
      const fromWallet = await this.getWallet(params.fromWalletId);
      const keypair = this.keyPairs.get(params.fromWalletId);
      
      if (!keypair) {
        throw new Error(`Keypair not found for wallet: ${params.fromWalletId}`);
      }
      
      if (fromWallet.status !== WalletStatus.ACTIVE) {
        throw new Error(`Wallet is not active: ${params.fromWalletId}`);
      }
      
      const fromPublicKey = keypair.publicKey;
      const toPublicKey = new PublicKey(params.toAddress);
      const mintPublicKey = new PublicKey(params.token);
      
      // Get associated token accounts
      const fromTokenAccount = await getAssociatedTokenAddress(
        mintPublicKey,
        fromPublicKey
      );
      
      const toTokenAccount = await getAssociatedTokenAddress(
        mintPublicKey,
        toPublicKey
      );
      
      // Create transaction
      const transaction = new Transaction();
      
      // Check if destination token account exists
      try {
        await getAccount(this.connection, toTokenAccount);
      } catch (error) {
        // If the account doesn't exist, create it
        transaction.add(
          createAssociatedTokenAccountInstruction(
            fromPublicKey,
            toTokenAccount,
            toPublicKey,
            mintPublicKey
          )
        );
      }
      
      // Add transfer instruction
      transaction.add(
        createTransferInstruction(
          fromTokenAccount,
          toTokenAccount,
          fromPublicKey,
          BigInt(Math.floor(params.amount)),
          [],
          TOKEN_PROGRAM_ID
        )
      );
      
      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromPublicKey;
      
      // Sign and send transaction
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [keypair]
      );
      
      // Track the transaction in our system
      const trackingResult = await this.transactionTrackingService.createTransaction({
        userId: fromWallet.userId,
        amount: params.amount,
        currency: params.token,
        type: TransactionType.CRYPTO_PAYMENT,
        status: TransactionStatus.COMPLETED,
        sourceId: fromWallet.id,
        destinationId: params.toAddress,
        processorName: 'solana',
        processorTransactionId: signature,
        metadata: {
          signature,
          tokenMint: params.token,
          reference: params.reference,
          ...params.metadata
        }
      });
      
      if (!trackingResult.success) {
        this.logger.warn(`Failed to track token transfer: ${trackingResult.error.message}`);
      }
      
      return createSuccess({
        success: true,
        transactionId: trackingResult.success ? trackingResult.data.id : undefined,
        signature
      });
    } catch (error: any) {
      this.logger.error(`Error transferring token: ${error}`);
      
      return createError({
        code: 'TOKEN_TRANSFER_FAILED',
        message: error.message
      });
    }
  }
  
  /**
   * Sign a message using the wallet
   */
  async signMessage(walletId: string, message: string): Promise<{ signature: string }> {
    const keypair = this.keyPairs.get(walletId);
    
    if (!keypair) {
      throw new Error(`Keypair not found for wallet: ${walletId}`);
    }
    
    const messageBuffer = Buffer.from(message);
    const signature = nacl.sign.detached(messageBuffer, keypair.secretKey);
    
    return {
      signature: bs58.encode(signature)
    };
  }
}
