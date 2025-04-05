import { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction, 
  SystemProgram, 
  sendAndConfirmTransaction 
} from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import config from '../config';
import logger from '../utils/logger';

export class SolanaService {
  private connection: Connection;
  private payer: Keypair | null = null;

  constructor() {
    this.connection = new Connection(config.solana.rpcUrl, 'confirmed');
    this.initializeWallet();
  }

  private initializeWallet() {
    if (config.solana.walletPrivateKey) {
      try {
        const secretKey = Buffer.from(JSON.parse(config.solana.walletPrivateKey));
        this.payer = Keypair.fromSecretKey(secretKey);
        logger.info(`Wallet initialized: ${this.payer.publicKey.toString()}`);
      } catch (error) {
        logger.error('Failed to initialize wallet:', error);
      }
    } else {
      logger.warn('No wallet private key provided. Limited functionality available.');
    }
  }

  async getBalance(pubkey: string): Promise<number> {
    try {
      const publicKey = new PublicKey(pubkey);
      const balance = await this.connection.getBalance(publicKey);
      return balance / 10 ** 9;
    } catch (error) {
      logger.error('Error getting balance:', error);
      throw error;
    }
  }

  async getTokenBalance(walletAddress: string, tokenMintAddress: string): Promise<number> {
    try {
      const walletPublicKey = new PublicKey(walletAddress);
      const tokenMintPublicKey = new PublicKey(tokenMintAddress);
      
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        walletPublicKey,
        { mint: tokenMintPublicKey }
      );
      
      if (tokenAccounts.value.length === 0) {
        return 0;
      }
      
      const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
      return balance;
    } catch (error) {
      logger.error('Error getting token balance:', error);
      throw error;
    }
  }

  async transferSol(recipientAddress: string, amount: number): Promise<string> {
    if (!this.payer) {
      throw new Error('Wallet not initialized');
    }

    try {
      const recipientPublicKey = new PublicKey(recipientAddress);
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.payer.publicKey,
          toPubkey: recipientPublicKey,
          lamports: amount * 10 ** 9
        })
      );

      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.payer]
      );

      logger.info(`Transfer successful: ${signature}`);
      return signature;
    } catch (error) {
      logger.error('Error transferring SOL:', error);
      throw error;
    }
  }

  async isTransactionConfirmed(signature: string): Promise<boolean> {
    try {
      const status = await this.connection.getSignatureStatus(signature);
      return status.value !== null && status.value.confirmationStatus === 'confirmed';
    } catch (error) {
      logger.error('Error checking transaction status:', error);
      throw error;
    }
  }

  async getTransactionDetails(signature: string) {
    try {
      const transaction = await this.connection.getParsedTransaction(signature);
      return transaction;
    } catch (error) {
      logger.error('Error getting transaction details:', error);
      throw error;
    }
  }

  async getRecentBlockhash() {
    try {
      const { blockhash } = await this.connection.getLatestBlockhash();
      return blockhash;
    } catch (error) {
      logger.error('Error getting recent blockhash:', error);
      throw error;
    }
  }
}
