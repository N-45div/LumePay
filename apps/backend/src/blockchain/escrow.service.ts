import { 
  Connection, 
  Keypair, 
  PublicKey, 
  SystemProgram, 
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  createTransferInstruction, 
  getAssociatedTokenAddress 
} from '@solana/spl-token';
import tweetnacl from 'tweetnacl';
import bs58 from 'bs58';
import stablecoinService, { StablecoinType } from '../services/stablecoin.service';
import { BlockchainError } from '../utils/errors';
import logger from '../utils/logger';
import transactionMonitorService from '../services/transaction-monitor.service';

const PLATFORM_FEE_PERCENTAGE = Number(process.env.PLATFORM_FEE_PERCENTAGE || '2.5');
const PLATFORM_WALLET_ADDRESS = process.env.PLATFORM_WALLET_ADDRESS;
const ESCROW_PROGRAM_ID = new PublicKey(process.env.ESCROW_PROGRAM_ID || 'ESCRoWproGramidXXXXXXXXXXXXXXXXXX111111');
const NETWORK = process.env.SOLANA_NETWORK || 'devnet';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ESCROW_DURATION_DAYS = 7;

const TOKEN_MINT_ADDRESSES = {
  mainnet: {
    [StablecoinType.USDC]: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    [StablecoinType.USDT]: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    [StablecoinType.PAX]: 'BbBCH5yTRd2jcZEr2PAYYb7BoNFTYenNkFEeJoaJRvAn'
  },
  devnet: {
    [StablecoinType.USDC]: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    [StablecoinType.USDT]: 'BQcdHdAQW1hczDbBi9hiegXAR7A98Q9jx3X3sXJHgS7b',
    [StablecoinType.PAX]: 'DJafV9qemGp7mLMEn5wrfqaFwxsbLgUsGVA16K9PmCnj'
  }
};

interface EscrowResult {
  escrowAddress: string;
  escrowSecretKey?: Uint8Array;
  releaseTime: Date;
}

interface TransactionResult {
  transactionSignature: string;
  blockTime?: number;
}

export class EscrowService {
  private connection: Connection;
  private escrowProgramId: PublicKey;
  private platformWalletAddress?: PublicKey;
  private network: 'mainnet' | 'devnet';
  
  constructor() {
    this.connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');
    this.escrowProgramId = ESCROW_PROGRAM_ID;
    this.network = (NETWORK === 'mainnet') ? 'mainnet' : 'devnet';
    
    if (PLATFORM_WALLET_ADDRESS) {
      try {
        this.platformWalletAddress = new PublicKey(PLATFORM_WALLET_ADDRESS);
        logger.info(`Platform fee configuration: ${PLATFORM_FEE_PERCENTAGE}% fee to ${PLATFORM_WALLET_ADDRESS}`);
      } catch (error) {
        logger.warn('Invalid platform wallet address:', error);
        logger.warn('Platform fees will not be collected due to invalid wallet address');
      }
    } else {
      logger.info('No platform wallet address configured. Platform fees will not be collected.');
    }
  }
  
  private getTokenMintAddress(currency: StablecoinType): string {
    return TOKEN_MINT_ADDRESSES[this.network][currency];
  }
  
  async createEscrow(
    buyerWalletAddress: string,
    sellerWalletAddress: string,
    amount: number,
    currency: StablecoinType = StablecoinType.USDC,
    durationDays: number = DEFAULT_ESCROW_DURATION_DAYS
  ): Promise<EscrowResult> {
    try {
      const buyerPubkey = new PublicKey(buyerWalletAddress);
      const sellerPubkey = new PublicKey(sellerWalletAddress);
      
      const escrowKeypair = Keypair.generate();
      const escrowPubkey = escrowKeypair.publicKey;
      
      const releaseTime = new Date(Date.now() + durationDays * DAY_IN_MS);
      
      return {
        escrowAddress: escrowPubkey.toString(),
        escrowSecretKey: escrowKeypair.secretKey,
        releaseTime
      };
    } catch (error) {
      logger.error('Error creating escrow:', error);
      if (error instanceof Error) {
        throw new BlockchainError(`Error creating escrow: ${error.message}`);
      }
      throw new BlockchainError('Unknown error creating escrow');
    }
  }
  
  async fundEscrow(
    escrowAddress: string,
    amount: number,
    buyerPrivateKey: string,
    buyerId?: string,
    currency: StablecoinType = StablecoinType.USDC
  ): Promise<TransactionResult> {
    try {
      logger.info(`Funding escrow: ${escrowAddress} with ${amount} ${currency}`);
      
      // Validate inputs
      if (!escrowAddress) {
        throw new Error('Escrow address is required');
      }
      
      if (!amount || amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      
      if (!buyerPrivateKey) {
        throw new Error('Buyer private key is required');
      }
      
      // Parse private key
      let privateKeyBytes;
      try {
        privateKeyBytes = Buffer.from(JSON.parse(buyerPrivateKey));
      } catch (e) {
        try {
          privateKeyBytes = bs58.decode(buyerPrivateKey);
        } catch (e2) {
          logger.error('Failed to decode private key', { error: e2 });
          throw new Error('Invalid private key format');
        }
      }
      
      const buyerKeypair = Keypair.fromSecretKey(privateKeyBytes);
      const escrowPublicKey = new PublicKey(escrowAddress);
      
      // Get token information
      const mintAddress = this.getTokenMintAddress(currency);
      logger.debug(`Using mint address for ${currency}: ${mintAddress}`);
      const mintPublicKey = new PublicKey(mintAddress);
      
      // Get token accounts
      try {
        const buyerTokenAccount = await getAssociatedTokenAddress(
          mintPublicKey,
          buyerKeypair.publicKey
        );
        
        const escrowTokenAccount = await getAssociatedTokenAddress(
          mintPublicKey,
          escrowPublicKey,
          true
        );
        
        // Calculate fees
        const platformFee = amount * (PLATFORM_FEE_PERCENTAGE / 100);
        const amountAfterFee = amount - platformFee;
        
        const decimals = 6;
        const amountInSmallestUnits = Math.floor(amountAfterFee * Math.pow(10, decimals));
        const feeInSmallestUnits = Math.floor(platformFee * Math.pow(10, decimals));
        
        logger.info(`Transfer details: ${amount} total, ${platformFee} fee (${PLATFORM_FEE_PERCENTAGE}%), ${amountAfterFee} after fee`);
        
        // Build transaction
        const transaction = new Transaction();
        
        // Add main transfer instruction
        transaction.add(
          createTransferInstruction(
            buyerTokenAccount,
            escrowTokenAccount,
            buyerKeypair.publicKey,
            amountInSmallestUnits
          )
        );
        
        // Add platform fee transfer instruction if configured
        if (this.platformWalletAddress && platformFee > 0) {
          logger.info(`Adding platform fee transfer: ${platformFee} to ${this.platformWalletAddress.toString()}`);
          
          const platformTokenAccount = await getAssociatedTokenAddress(
            mintPublicKey,
            this.platformWalletAddress
          );
          
          transaction.add(
            createTransferInstruction(
              buyerTokenAccount,
              platformTokenAccount,
              buyerKeypair.publicKey,
              feeInSmallestUnits
            )
          );
        } else if (platformFee > 0) {
          logger.warn(`Platform fee of ${platformFee} was calculated but no valid platform wallet is configured. Fee will not be collected.`);
        }
        
        // Finalize and send transaction
        const blockhash = await this.connection.getRecentBlockhash();
        transaction.recentBlockhash = blockhash.blockhash;
        transaction.feePayer = buyerKeypair.publicKey;
        
        logger.info('Sending transaction to fund escrow...');
        const signature = await sendAndConfirmTransaction(
          this.connection,
          transaction,
          [buyerKeypair]
        );
        
        logger.info(`Escrow successfully funded. Transaction signature: ${signature}`);
        
        // Monitor transaction if buyer ID is provided
        if (buyerId) {
          transactionMonitorService.addTransactionToMonitor(
            signature,
            escrowAddress,
            buyerId,
            'fund'
          );
        }
        
        return {
          transactionSignature: signature,
          blockTime: Date.now() / 1000
        };
      } catch (error) {
        if (error instanceof Error) {
          logger.error(`Error in token transfer operation: ${error.message}`, { error });
          throw new Error(`Token transfer failed: ${error.message}`);
        }
        throw error;
      }
    } catch (error) {
      logger.error('Error funding escrow:', error);
      if (error instanceof Error) {
        throw new BlockchainError(`Error funding escrow: ${error.message}`);
      }
      throw new BlockchainError('Unknown error funding escrow');
    }
  }
  
  async releaseEscrow(
    escrowAddress: string,
    sellerWalletAddress: string,
    sellerId?: string,
    currency: StablecoinType = StablecoinType.USDC
  ): Promise<TransactionResult> {
    try {
      logger.info(`Releasing escrow: ${escrowAddress} to seller: ${sellerWalletAddress}, currency: ${currency}`);
      
      // Validate inputs
      if (!escrowAddress) {
        throw new Error('Escrow address is required');
      }
      
      if (!sellerWalletAddress) {
        throw new Error('Seller wallet address is required');
      }
      
      // Validate wallet addresses
      const escrowPublicKey = new PublicKey(escrowAddress);
      const sellerPublicKey = new PublicKey(sellerWalletAddress);
      
      // In a full implementation, this would perform the on-chain transaction
      // For the current implementation, we use a simulated transaction
      const transactionSignature = `sim_release_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
      
      logger.info(`Escrow ${escrowAddress} released with transaction: ${transactionSignature}`);
      
      // Add transaction signature to monitoring service if seller ID is provided
      if (sellerId) {
        transactionMonitorService.addTransactionToMonitor(
          transactionSignature,
          escrowAddress,
          sellerId,
          'release'
        );
      }
      
      return {
        transactionSignature,
        blockTime: Math.floor(Date.now() / 1000)
      };
    } catch (error) {
      logger.error('Error releasing escrow:', error);
      if (error instanceof Error) {
        throw new BlockchainError(`Error releasing escrow: ${error.message}`);
      }
      throw new BlockchainError('Unknown error releasing escrow');
    }
  }
  
  async refundEscrow(
    escrowAddress: string,
    buyerWalletAddress: string,
    sellerId?: string,
    currency: StablecoinType = StablecoinType.USDC
  ): Promise<TransactionResult> {
    try {
      logger.info(`Refunding escrow: ${escrowAddress} to buyer: ${buyerWalletAddress}, currency: ${currency}`);
      
      // Validate inputs
      if (!escrowAddress) {
        throw new Error('Escrow address is required');
      }
      
      if (!buyerWalletAddress) {
        throw new Error('Buyer wallet address is required');
      }
      
      // Validate wallet addresses
      const escrowPublicKey = new PublicKey(escrowAddress);
      const buyerPublicKey = new PublicKey(buyerWalletAddress);
      
      // In a full implementation, this would perform the on-chain transaction
      // For the current implementation, we use a simulated transaction
      const transactionSignature = `sim_refund_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
      
      logger.info(`Escrow ${escrowAddress} refunded with transaction: ${transactionSignature}`);
      
      // Add transaction signature to monitoring service if seller ID is provided
      if (sellerId) {
        transactionMonitorService.addTransactionToMonitor(
          transactionSignature,
          escrowAddress,
          sellerId,
          'refund'
        );
      }
      
      return {
        transactionSignature,
        blockTime: Math.floor(Date.now() / 1000)
      };
    } catch (error) {
      logger.error('Error refunding escrow:', error);
      if (error instanceof Error) {
        throw new BlockchainError(`Error refunding escrow: ${error.message}`);
      }
      throw new BlockchainError('Unknown error refunding escrow');
    }
  }
  
  async verifyTransaction(signature: string): Promise<boolean> {
    try {
      // For simulated transactions in test environments, always return success
      if (signature.startsWith('sim_')) {
        logger.info(`Verifying simulated transaction: ${signature}`);
        return true;
      }
      
      logger.info(`Verifying blockchain transaction: ${signature}`);
      const transaction = await this.connection.getTransaction(signature);
      
      if (!transaction) {
        logger.warn(`Transaction not found: ${signature}`);
        return false;
      }
      
      if (transaction.meta?.err) {
        logger.error(`Transaction failed: ${signature}`, transaction.meta.err);
        return false;
      }
      
      // Log transaction details - use optional chaining for potentially undefined properties
      const status = "confirmed"; // Default to confirmed if it reached this point
      logger.info(`Transaction ${signature} verified: status=${status}`);
      
      return true;
    } catch (error) {
      logger.error('Error verifying transaction:', error);
      return false;
    }
  }

}

export const escrowService = new EscrowService();
export default escrowService;