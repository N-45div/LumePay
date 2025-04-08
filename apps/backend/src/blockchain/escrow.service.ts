import { 
  Connection, 
  Keypair, 
  PublicKey, 
  SystemProgram, 
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  clusterApiUrl,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction
} from '@solana/spl-token';
import * as borsh from 'borsh';
import tweetnacl from 'tweetnacl';
import bs58 from 'bs58';
import stablecoinService, { StablecoinType } from '../services/stablecoin.service';
import { BlockchainError } from '../utils/errors';
import logger from '../utils/logger';
import transactionMonitorService from '../services/transaction-monitor.service';

const PLATFORM_FEE_PERCENTAGE = Number(process.env.PLATFORM_FEE_PERCENTAGE || '2.5');
const PLATFORM_WALLET_ADDRESS = process.env.PLATFORM_WALLET_ADDRESS;
const ESCROW_PROGRAM_ID = new PublicKey('EscDoNyGa2G2JbCt525KJSsBi6phRUMqtJWWYwfriKTT'); 
const NETWORK = process.env.SOLANA_NETWORK || 'devnet';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ESCROW_DURATION_DAYS = 7;
const DISPUTE_WINDOW_DAYS = 3;
const ESCROW_SEED_PREFIX = 'escrow';

const TOKEN_MINT_ADDRESSES: {[network: string]: {[currency: string]: string}} = {
  mainnet: {
    'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    'PAX': 'BbBCH5yTRd2jcZEr2PAYYb7BoNFTYenNkFEeJoaJRvAn'
  },
  devnet: {
    'USDC': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    'USDT': 'BQcdHdAQW1hczDbBi9hiegXAR7A98Q9jx3X3sXJHgS7b',
    'PAX': 'DJafV9qemGp7mLMEn5wrfqaFwxsbLgUsGVA16K9PmCnj'
  }
};

enum EscrowState {
  Uninitialized,
  Created,
  Funded,
  Released,
  Refunded,
  Disputed,
  Closed
}
enum EscrowInstructionType {
  Initialize,
  Fund,
  Release,
  Refund,
  Dispute
}

class InitializeInstruction {
  instructionType = EscrowInstructionType.Initialize;
  amount: bigint;
  releaseTimestamp: bigint;
  disputeTimeWindow: bigint;
  listingId: Uint8Array;
  
  constructor(props: { 
    amount: number, 
    releaseTimestamp: number, 
    disputeTimeWindow: number, 
    listingId: string 
  }) {
    this.amount = BigInt(props.amount);
    this.releaseTimestamp = BigInt(props.releaseTimestamp);
    this.disputeTimeWindow = BigInt(props.disputeTimeWindow);
    this.listingId = new Uint8Array(32);
    const idBytes = Buffer.from(props.listingId);
    this.listingId.set(idBytes.slice(0, 32));
  }
}

class FundInstruction {
  instructionType = EscrowInstructionType.Fund;
  transactionSignature: Uint8Array;
  
  constructor(props: { transactionSignature: string }) {
    this.transactionSignature = new Uint8Array(64);
    const sigBytes = Buffer.from(props.transactionSignature);
    this.transactionSignature.set(sigBytes.slice(0, 64));
  }
}

class ReleaseInstruction {
  instructionType = EscrowInstructionType.Release;
  transactionSignature: Uint8Array;
  
  constructor(props: { transactionSignature: string }) {
    this.transactionSignature = new Uint8Array(64);
    const sigBytes = Buffer.from(props.transactionSignature);
    this.transactionSignature.set(sigBytes.slice(0, 64));
  }
}

class RefundInstruction {
  instructionType = EscrowInstructionType.Refund;
  transactionSignature: Uint8Array;
  
  constructor(props: { transactionSignature: string }) {
    this.transactionSignature = new Uint8Array(64);
    const sigBytes = Buffer.from(props.transactionSignature);
    this.transactionSignature.set(sigBytes.slice(0, 64));
  }
}

class DisputeInstruction {
  instructionType = EscrowInstructionType.Dispute;
  reason: string;
  
  constructor(props: { reason: string }) {
    this.reason = props.reason;
  }
}

const escrowInstructionSchema = new Map<any, any>([
  [InitializeInstruction, { 
    kind: 'struct', 
    fields: [
      ['instructionType', 'u8'],
      ['amount', 'u64'],
      ['releaseTimestamp', 'i64'],
      ['disputeTimeWindow', 'i64'],
      ['listingId', [32]]
    ] 
  }],
  [FundInstruction, { 
    kind: 'struct', 
    fields: [
      ['instructionType', 'u8'], 
      ['transactionSignature', [64]]
    ] 
  }],
  [ReleaseInstruction, { 
    kind: 'struct', 
    fields: [
      ['instructionType', 'u8'], 
      ['transactionSignature', [64]]
    ] 
  }],
  [RefundInstruction, { 
    kind: 'struct', 
    fields: [
      ['instructionType', 'u8'], 
      ['transactionSignature', [64]]
    ] 
  }],
  [DisputeInstruction, { 
    kind: 'struct', 
    fields: [
      ['instructionType', 'u8'], 
      ['reason', 'string']
    ] 
  }]
]);

interface EscrowResult {
  escrowAddress: string;
  escrowSecretKey?: Uint8Array;
  releaseTime: Date;
}

interface TransactionResult {
  transactionId: string;
  status: string;
}

export class EscrowService {
  private connection: Connection;
  private programId: PublicKey;

  constructor() {
    // Connect to the desired network (devnet/mainnet)
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );
    this.programId = ESCROW_PROGRAM_ID;
  }

  // Find the Escrow PDA (Program Derived Address)
  async findEscrowPDA(seller: PublicKey, buyer: PublicKey, listingId: string): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from(ESCROW_SEED_PREFIX),
        seller.toBuffer(),
        buyer.toBuffer(),
        Buffer.from(listingId)
      ],
      this.programId
    );
  }

  // Creates an escrow account on-chain
  async createEscrow(
    sellerWalletAddress: string,
    buyerWalletAddress: string,
    amount: number,
    currency = 'USDC',
    durationDays = DEFAULT_ESCROW_DURATION_DAYS
  ): Promise<{ escrowAddress: string; releaseTime: Date }> {
    try {
      logger.info(`Creating escrow: buyer=${buyerWalletAddress}, seller=${sellerWalletAddress}, amount=${amount}, currency=${currency}`);

      if (!buyerWalletAddress || !sellerWalletAddress) {
        throw new Error('Buyer and seller wallet addresses are required');
      }
      
      if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      const buyerPubkey = new PublicKey(buyerWalletAddress);
      const sellerPubkey = new PublicKey(sellerWalletAddress);

      const listingId = Date.now().toString() + Math.random().toString().substring(2, 10);

      const releaseTime = new Date(Date.now() + durationDays * DAY_IN_MS);
      const releaseTimestamp = Math.floor(releaseTime.getTime() / 1000);
      const disputeTimeWindow = DISPUTE_WINDOW_DAYS * 24 * 60 * 60; // In seconds

      const [escrowPDA, _] = await this.findEscrowPDA(sellerPubkey, buyerPubkey, listingId);

      logger.info(`Escrow created with address: ${escrowPDA.toString()}, release time: ${releaseTime.toISOString()}`);
      
      return {
        escrowAddress: escrowPDA.toString(),
        releaseTime
      };
    } catch (error: any) {
      logger.error('Error creating escrow:', error);
      throw new BlockchainError(`Failed to create escrow: ${error.message}`);
    }
  }

  // Send a transaction to initialize an escrow account
  async initializeEscrow(
    escrowAddress: string,
    sellerId: string,
    buyerId: string,
    privateKey: string,
    amount: number,
    listingId: string,
    releaseTimestamp: number
  ): Promise<{ transactionId: string }> {
    try {
      const escrowPubkey = new PublicKey(escrowAddress);
      const signerKeypair = Keypair.fromSecretKey(
        bs58.decode(privateKey)
      );
      
      // Create initialize instruction
      const initializeInstruction = new InitializeInstruction({
        amount: amount,
        releaseTimestamp: releaseTimestamp,
        disputeTimeWindow: DISPUTE_WINDOW_DAYS * 24 * 60 * 60, // 3 days in seconds
        listingId: listingId
      });
      
      // Serialize the instruction data
      const instructionData = borsh.serialize(
        escrowInstructionSchema,
        initializeInstruction
      );
      
      // Create transaction instruction
      const transaction = new Transaction().add(
        new TransactionInstruction({
          keys: [
            { pubkey: signerKeypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: escrowPubkey, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId: this.programId,
          data: Buffer.from(instructionData)
        })
      );
      
      // Sign and send transaction
      const signature = await this.connection.sendTransaction(
        transaction,
        [signerKeypair]
      );
      
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      return { 
        transactionId: signature 
      };
    } catch (error: any) {
      logger.error('Error initializing escrow on-chain:', error);
      throw new BlockchainError(`Failed to initialize escrow on blockchain: ${error.message}`);
    }
  }

  // Fund an escrow account
  async fundEscrow(
    escrowAddress: string,
    buyerWalletAddress: string,
    buyerId: string,
    buyerPrivateKey: string,
    amount: number,
    currency = 'USDC'
  ): Promise<TransactionResult> {
    try {
      logger.info(`Funding escrow: ${escrowAddress}, amount: ${amount}, currency: ${currency}`);

      if (!escrowAddress) {
        throw new Error('Escrow address is required');
      }
      
      if (!buyerWalletAddress) {
        throw new Error('Buyer wallet address is required');
      }
      
      if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }
 
      const mintAddress = new PublicKey(this.getTokenMintAddress(currency));

      const escrowPubkey = new PublicKey(escrowAddress);

      const buyerKeypair = Keypair.fromSecretKey(
        bs58.decode(buyerPrivateKey)
      );
 
      const buyerTokenAccount = await getAssociatedTokenAddress(
        mintAddress,
        buyerKeypair.publicKey
      );
      const escrowTokenAccount = await getAssociatedTokenAddress(
        mintAddress,
        escrowPubkey,
        true
      );

      const tokenAmount = this.convertToTokenAmount(amount);

      const txSignature = `tx_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;

      const fundInstruction = new FundInstruction({
        transactionSignature: txSignature
      });

      const instructionData = borsh.serialize(
        escrowInstructionSchema,
        fundInstruction
      );
      
      // In a real implementation, we would create and send a transaction here
      // For now, we'll simulate the blockchain transaction with a delay
      const simulatedTxSignature = `sim_fund_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
      
      logger.info(`Escrow ${escrowAddress} funded with transaction: ${simulatedTxSignature}`);
      if (buyerId) {
        transactionMonitorService.addTransactionToMonitor(
          simulatedTxSignature,
          escrowAddress,
          buyerId,
          'fund'
        );
      }
      
      return {
        transactionId: simulatedTxSignature,
        status: 'pending'
      };
    } catch (error: any) {
      logger.error('Error funding escrow:', error);
      throw new BlockchainError(`Failed to fund escrow: ${error.message}`);
    }
  }

  // Create and send a Solana transaction for funding an escrow
  async sendFundEscrowTransaction(
    escrowPubkey: PublicKey,
    buyerKeypair: Keypair,
    mintAddress: PublicKey,
    buyerTokenAccount: PublicKey,
    escrowTokenAccount: PublicKey,
    amount: number,
    txSignature: string
  ): Promise<string> {
    try {
      // Check if escrow token account exists, if not create it
      let transaction = new Transaction();
      
      try {
        await getAccount(this.connection, escrowTokenAccount);
      } catch (error) {
        // Account doesn't exist, create it
        transaction.add(
          createAssociatedTokenAccountInstruction(
            buyerKeypair.publicKey,
            escrowTokenAccount,
            escrowPubkey,
            mintAddress
          )
        );
      }
      
      // Create transfer instruction for SPL token
      transaction.add(
        createTransferInstruction(
          buyerTokenAccount,
          escrowTokenAccount,
          buyerKeypair.publicKey,
          BigInt(amount)
        )
      );
      
      // Create fund escrow instruction
      const fundInstruction = new FundInstruction({
        transactionSignature: txSignature
      });
      
      const instructionData = borsh.serialize(
        escrowInstructionSchema,
        fundInstruction
      );
      
      transaction.add(
        new TransactionInstruction({
          keys: [
            { pubkey: buyerKeypair.publicKey, isSigner: true, isWritable: false },
            { pubkey: escrowPubkey, isSigner: false, isWritable: true },
            { pubkey: escrowTokenAccount, isSigner: false, isWritable: false },
          ],
          programId: this.programId,
          data: Buffer.from(instructionData)
        })
      );
      
      // Sign and send the transaction
      const signature = await this.connection.sendTransaction(
        transaction,
        [buyerKeypair]
      );
      
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      return signature;
    } catch (error: any) {
      logger.error('Error sending fund escrow transaction:', error);
      throw new BlockchainError(`Failed to send fund escrow transaction: ${error.message}`);
    }
  }

  // Release funds from escrow to seller
  async releaseEscrow(
    escrowAddress: string,
    sellerWalletAddress: string,
    adminPrivateKey: string,
    amount: number,
    currency = 'USDC'
  ): Promise<TransactionResult> {
    try {
      logger.info(`Releasing escrow: ${escrowAddress} to seller: ${sellerWalletAddress}, currency: ${currency}`);

      if (!escrowAddress) {
        throw new Error('Escrow address is required');
      }
      
      if (!sellerWalletAddress) {
        throw new Error('Seller wallet address is required');
      }

      const escrowPubkey = new PublicKey(escrowAddress);
      const sellerPubkey = new PublicKey(sellerWalletAddress);
      const mintAddress = new PublicKey(this.getTokenMintAddress(currency));
      
      // Get seller token account
      const sellerTokenAccount = await getAssociatedTokenAddress(
        mintAddress,
        sellerPubkey
      );
      
      // Get escrow token account
      const escrowTokenAccount = await getAssociatedTokenAddress(
        mintAddress,
        escrowPubkey,
        true // Allow PDA as owner
      );
      
      // Create release instruction
      const txSignature = `tx_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
      const releaseInstruction = new ReleaseInstruction({
        transactionSignature: txSignature
      });
      
      // Admin keypair for signing the transaction
      const adminKeypair = Keypair.fromSecretKey(
        bs58.decode(adminPrivateKey)
      );
      
      // Create release transaction
      const transaction = await this.buildReleaseTransaction(
        escrowPubkey,
        sellerTokenAccount,
        escrowTokenAccount,
        adminKeypair.publicKey,
        releaseInstruction
      );
      
      // Sign and send transaction
      const signature = await this.connection.sendTransaction(
        transaction,
        [adminKeypair]
      );
      
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      return {
        transactionId: signature,
        status: 'confirmed'
      };
    } catch (error: any) {
      logger.error('Error releasing escrow:', error);
      throw new BlockchainError(`Failed to release escrow: ${error.message}`);
    }
  }

  // Build release transaction
  private async buildReleaseTransaction(
    escrowPubkey: PublicKey,
    sellerTokenAccount: PublicKey,
    escrowTokenAccount: PublicKey,
    signerPubkey: PublicKey,
    releaseInstruction: ReleaseInstruction
  ): Promise<Transaction> {
    const instructionData = borsh.serialize(
      escrowInstructionSchema,
      releaseInstruction
    );
    
    // Create the transaction instruction
    const transaction = new Transaction().add(
      new TransactionInstruction({
        keys: [
          { pubkey: signerPubkey, isSigner: true, isWritable: false },
          { pubkey: escrowPubkey, isSigner: false, isWritable: true },
          { pubkey: escrowTokenAccount, isSigner: false, isWritable: true },
          { pubkey: sellerTokenAccount, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: this.programId,
        data: Buffer.from(instructionData)
      })
    );
    
    return transaction;
  }

  // Refund escrow to buyer
  async refundEscrow(
    escrowAddress: string,
    buyerWalletAddress: string,
    adminPrivateKey: string,
    amount: number,
    currency = 'USDC'
  ): Promise<TransactionResult> {
    try {
      logger.info(`Refunding escrow: ${escrowAddress} to buyer: ${buyerWalletAddress}, currency: ${currency}`);

      if (!escrowAddress) {
        throw new Error('Escrow address is required');
      }
      
      if (!buyerWalletAddress) {
        throw new Error('Buyer wallet address is required');
      }

      const escrowPubkey = new PublicKey(escrowAddress);
      const buyerPubkey = new PublicKey(buyerWalletAddress);
      const mintAddress = new PublicKey(this.getTokenMintAddress(currency));
      
      // Get buyer token account
      const buyerTokenAccount = await getAssociatedTokenAddress(
        mintAddress,
        buyerPubkey
      );
      
      // Get escrow token account
      const escrowTokenAccount = await getAssociatedTokenAddress(
        mintAddress,
        escrowPubkey,
        true // Allow PDA as owner
      );
      
      // Create refund instruction
      const txSignature = `tx_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
      const refundInstruction = new RefundInstruction({
        transactionSignature: txSignature
      });
      
      // Admin keypair for signing the transaction
      const adminKeypair = Keypair.fromSecretKey(
        bs58.decode(adminPrivateKey)
      );
      
      // Create refund transaction
      const transaction = await this.buildRefundTransaction(
        escrowPubkey,
        buyerTokenAccount,
        escrowTokenAccount,
        adminKeypair.publicKey,
        refundInstruction
      );
      
      // Sign and send transaction
      const signature = await this.connection.sendTransaction(
        transaction,
        [adminKeypair]
      );
      
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      return {
        transactionId: signature,
        status: 'confirmed'
      };
    } catch (error: any) {
      logger.error('Error refunding escrow:', error);
      throw new BlockchainError(`Failed to refund escrow: ${error.message}`);
    }
  }

  // Build refund transaction
  private async buildRefundTransaction(
    escrowPubkey: PublicKey,
    buyerTokenAccount: PublicKey,
    escrowTokenAccount: PublicKey,
    signerPubkey: PublicKey,
    refundInstruction: RefundInstruction
  ): Promise<Transaction> {
    const instructionData = borsh.serialize(
      escrowInstructionSchema,
      refundInstruction
    );
    
    // Create the transaction instruction
    const transaction = new Transaction().add(
      new TransactionInstruction({
        keys: [
          { pubkey: signerPubkey, isSigner: true, isWritable: false },
          { pubkey: escrowPubkey, isSigner: false, isWritable: true },
          { pubkey: escrowTokenAccount, isSigner: false, isWritable: true },
          { pubkey: buyerTokenAccount, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: this.programId,
        data: Buffer.from(instructionData)
      })
    );
    
    return transaction;
  }

  // Verify transaction on Solana blockchain
  async verifyTransaction(signature: string): Promise<{ confirmed: boolean; status: string }> {
    try {
      const transaction = await this.connection.getTransaction(signature, {
        commitment: 'confirmed',
      });
      
      if (!transaction) {
        return { confirmed: false, status: 'not_found' };
      }
      
      return {
        confirmed: true,
        status: transaction.meta?.err ? 'failed' : 'confirmed'
      };
    } catch (error: any) {
      logger.error('Error verifying transaction:', error);
      return { confirmed: false, status: 'error' };
    }
  }

  getTokenMintAddress(currency: string): string {
    const network = (NETWORK === 'mainnet') ? 'mainnet' : 'devnet';
    if (!TOKEN_MINT_ADDRESSES[network][currency]) {
      throw new Error(`Unsupported currency: ${currency}`);
    }
    return TOKEN_MINT_ADDRESSES[network][currency];
  }

  // Convert USD amount to token amount with proper decimals
  convertToTokenAmount(amount: number): bigint {
    // USDC has 6 decimals
    return BigInt(Math.floor(amount * 1_000_000));
  }

  // Import an existing wallet to the escrow service
  async importWallet(privateKey: string): Promise<{ publicKey: string }> {
    try {
      const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
      return { publicKey: keypair.publicKey.toString() };
    } catch (error: any) {
      logger.error('Error importing wallet:', error);
      throw new BlockchainError(`Failed to import wallet: ${error.message}`);
    }
  }

  // Generate a new wallet for use with the escrow service
  async generateWallet(): Promise<{ publicKey: string; privateKey: string }> {
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toString();
    const privateKey = bs58.encode(keypair.secretKey);
    
    return { publicKey, privateKey };
  }

  // Close an escrow if it has timed out
  async handleEscrowTimeout(escrowAddress: string, adminPrivateKey: string): Promise<boolean> {
    try {
      const escrowPubkey = new PublicKey(escrowAddress);
      
      // Get the escrow account data
      const escrowAccountInfo = await this.connection.getAccountInfo(escrowPubkey);
      
      if (!escrowAccountInfo) {
        logger.error(`Escrow account ${escrowAddress} not found`);
        return false;
      }
      
      // Parse the account data to get the release timestamp
      // This would require implementing a proper deserialization function
      // For now, we'll assume the escrow has timed out
      
      // Admin keypair for signing the transaction
      const adminKeypair = Keypair.fromSecretKey(
        bs58.decode(adminPrivateKey)
      );
      
      // Create timeout instruction (would need to implement in the smart contract)
      const timeoutTxSignature = `timeout_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
      
      // For simplicity, using the RefundInstruction for now
      // In a real implementation, we would have a specific TimeoutInstruction
      const timeoutInstruction = new RefundInstruction({
        transactionSignature: timeoutTxSignature
      });
      
      const instructionData = borsh.serialize(
        escrowInstructionSchema,
        timeoutInstruction
      );
      
      // Create the transaction instruction
      const transaction = new Transaction().add(
        new TransactionInstruction({
          keys: [
            { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: false },
            { pubkey: escrowPubkey, isSigner: false, isWritable: true },
            // Additional keys would be needed based on the smart contract
          ],
          programId: this.programId,
          data: Buffer.from(instructionData)
        })
      );
      
      // Sign and send the transaction
      const signature = await this.connection.sendTransaction(
        transaction,
        [adminKeypair]
      );
      
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      return true;
    } catch (error: any) {
      logger.error(`Error handling escrow timeout for ${escrowAddress}:`, error);
      return false;
    }
  }
}

// Export the service instance
export default new EscrowService();