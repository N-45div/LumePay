// apps/backend/src/services/core/blockchain/solana.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '../../../utils/logger';
import { Connection, PublicKey, Transaction, sendAndConfirmTransaction, Keypair, SystemProgram } from '@solana/web3.js';
import * as bs58 from 'bs58';

/**
 * Result of a SOL transfer
 */
interface TransferResult {
  signature: string;
  status: 'confirmed' | 'failed';
  blockTime: number;
}

@Injectable()
export class SolanaService {
  private connection: Connection;
  private payerKeypair: Keypair;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: Logger
  ) {
    this.initialize();
  }

  /**
   * Initialize Solana connection and load keys
   */
  initialize() {
    try {
      // Get RPC endpoint
      const rpcEndpoint = this.configService.get<string>('SOLANA_RPC_ENDPOINT', 'https://api.devnet.solana.com');
      this.connection = new Connection(rpcEndpoint);
      this.logger.info(`Connected to Solana at ${rpcEndpoint}`);

      // Initialize payer keypair from config or generate one
      const privateKeyString = this.configService.get<string>('SOLANA_PRIVATE_KEY');
      
      if (privateKeyString) {
        const decodedKey = bs58.decode(privateKeyString);
        this.payerKeypair = Keypair.fromSecretKey(decodedKey);
        this.logger.info(`Using configured keypair with public key: ${this.payerKeypair.publicKey.toString()}`);
      } else {
        this.payerKeypair = Keypair.generate();
        this.logger.warn('Using generated keypair as no private key was provided');
        this.logger.info(`Generated public key: ${this.payerKeypair.publicKey.toString()}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error initializing Solana service: ${errorMessage}`, {
        error: errorMessage
      });
    }
  }
  
  /**
   * Get account balance for a public key
   */
  async getBalance(publicKey: string): Promise<{ success: boolean; balance?: number; error?: string }> {
    try {
      const key = new PublicKey(publicKey);
      const balance = await this.connection.getBalance(key);
      return {
        success: true,
        balance: balance / 1_000_000_000 // Convert lamports to SOL
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error getting balance for ${publicKey}: ${errorMessage}`, {
        error: errorMessage
      });
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Transfer SOL from the service wallet to a recipient
   */
  async transferSol(
    recipientPublicKey: string,
    amount: number
  ): Promise<{ success: boolean; data?: TransferResult; error?: string }> {
    try {
      // Check if service wallet is initialized
      if (!this.payerKeypair) {
        return {
          success: false,
          error: 'Service wallet not initialized'
        };
      }
      
      // Check if amount is valid
      if (amount <= 0) {
        return {
          success: false,
          error: 'Invalid amount'
        };
      }
      
      const recipient = new PublicKey(recipientPublicKey);
      
      // Convert SOL to lamports
      const lamports = Math.floor(amount * 1_000_000_000);
      
      // Get service wallet balance
      const serviceBalance = await this.connection.getBalance(this.payerKeypair.publicKey);
      
      // Check if service wallet has enough balance
      if (serviceBalance < lamports) {
        return {
          success: false,
          error: 'Insufficient funds in service wallet'
        };
      }
      
      // Create a transfer transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.payerKeypair.publicKey,
          toPubkey: recipient,
          lamports
        })
      );
      
      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.payerKeypair]
      );
      
      // Get transaction details
      const transactionDetails = await this.connection.getTransaction(signature);
      
      const confirmationStatus = await this.connection.getSignatureStatus(signature);
      
      return {
        success: true,
        data: {
          signature,
          status: confirmationStatus.value?.confirmationStatus === 'confirmed' ? 'confirmed' : 'failed',
          blockTime: transactionDetails?.blockTime ?? 0
        }
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error transferring SOL: ${errorMessage}`, {
        error: errorMessage
      });
      return {
        success: false,
        error: errorMessage
      };
    }
  }
  
  /**
   * Get service wallet public key
   */
  getServicePublicKey(): string {
    return this.payerKeypair ? this.payerKeypair.publicKey.toString() : '';
  }
  
  /**
   * Check if a public key is valid
   */
  isValidPublicKey(publicKey: string): boolean {
    try {
      new PublicKey(publicKey);
      return true;
    } catch {
      return false;
    }
  }
}
