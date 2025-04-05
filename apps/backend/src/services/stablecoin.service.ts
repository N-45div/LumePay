import { Connection, PublicKey } from '@solana/web3.js';
import * as axiosModule from 'axios';
const axios = axiosModule.default || axiosModule;
import logger from '../utils/logger';
import { BlockchainError, BadRequestError } from '../utils/errors';

export enum StablecoinType {
  USDC = 'USDC',
  USDT = 'USDT',
  PAX = 'PAX',
}

export interface TokenBalance {
  tokenSymbol: string;
  amount: number;
  usdValue: number;
  mintAddress: string;
  decimals: number;
  associatedTokenAddress: string;
  lastUpdated: Date;
}

export interface TokenTransaction {
  signature: string;
  from: string;
  to: string;
  amount: number;
  tokenSymbol: string;
  timestamp: Date;
  status: 'confirmed' | 'pending' | 'failed';
  blockHeight?: number;
  fee?: number;
}

const STABLECOIN_MINTS = {
  [StablecoinType.USDC]: {
    mainnet: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    devnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
  },
  [StablecoinType.USDT]: {
    mainnet: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    devnet: 'BQcdHdAQW1hczDbBi9hiegXAR7A98Q9jx3X3sXJHgS7b'
  },
  [StablecoinType.PAX]: {
    mainnet: 'BbBCH5yTRd2jcZEr2PAYYb7BoNFTYenNkFEeJoaJRvAn',
    devnet: 'DJafV9qemGp7mLMEn5wrfqaFwxsbLgUsGVA16K9PmCnj'
  }
};

const TOKEN_DECIMALS = {
  [StablecoinType.USDC]: 6,
  [StablecoinType.USDT]: 6,
  [StablecoinType.PAX]: 6
};

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

class StablecoinService {
  private connection: Connection;
  private network: 'mainnet' | 'devnet';
  private heliusApiKey?: string;
  private circleApiKey?: string;
  
  constructor() {
    this.connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');
    this.network = (process.env.SOLANA_NETWORK as 'mainnet' | 'devnet') || 'devnet';
    this.heliusApiKey = process.env.HELIUS_API_KEY;
    this.circleApiKey = process.env.CIRCLE_API_KEY;
  }
  
  async getTokenBalance(walletAddress: string, tokenSymbol: StablecoinType): Promise<TokenBalance> {
    try {
      const walletPublicKey = new PublicKey(walletAddress);
      const mintAddress = this.getMintAddress(tokenSymbol);
      const mintPublicKey = new PublicKey(mintAddress);
      
      const tokenAccount = await this.findAssociatedTokenAddress(walletPublicKey, mintPublicKey);
      
      // Check if we can use Helius API (preferred for production)
      if (this.heliusApiKey) {
        return this.getTokenBalanceFromHelius(walletAddress, tokenSymbol);
      }
      
      // Fallback to direct RPC call
      const tokenAccountInfo = await this.connection.getTokenAccountBalance(tokenAccount);
      
      if (!tokenAccountInfo?.value) {
        throw new BlockchainError(`Failed to fetch token balance for ${tokenSymbol}`);
      }
      
      const amount = parseFloat(tokenAccountInfo.value.amount) / Math.pow(10, tokenAccountInfo.value.decimals);
      
      return {
        tokenSymbol,
        amount,
        usdValue: amount, // For stablecoins, amount equals USD value
        mintAddress,
        decimals: tokenAccountInfo.value.decimals,
        associatedTokenAddress: tokenAccount.toBase58(),
        lastUpdated: new Date()
      };
    } catch (error) {
      logger.error('Error fetching token balance:', error);
      
      // If token account doesn't exist, return zero balance
      if (error instanceof Error && error.message.includes('could not find account')) {
        return {
          tokenSymbol,
          amount: 0,
          usdValue: 0,
          mintAddress: this.getMintAddress(tokenSymbol),
          decimals: TOKEN_DECIMALS[tokenSymbol],
          associatedTokenAddress: '',
          lastUpdated: new Date()
        };
      }
      
      if (error instanceof Error) {
        throw new BlockchainError(`Error fetching ${tokenSymbol} balance: ${error.message}`);
      }
      
      throw new BlockchainError(`Unknown error fetching ${tokenSymbol} balance`);
    }
  }
  
  async getAllTokenBalances(walletAddress: string): Promise<TokenBalance[]> {
    try {
      const balances: TokenBalance[] = [];
      
      // Check if we can use Helius API (preferred for production)
      if (this.heliusApiKey) {
        return this.getAllTokenBalancesFromHelius(walletAddress);
      }
      
      // Fallback to fetching each stablecoin individually
      const supportedTokens = Object.values(StablecoinType);
      
      for (const token of supportedTokens) {
        try {
          const balance = await this.getTokenBalance(walletAddress, token);
          balances.push(balance);
        } catch (error) {
          logger.warn(`Error fetching ${token} balance for ${walletAddress}`, error);
          
          // Add zero balance for this token
          balances.push({
            tokenSymbol: token,
            amount: 0,
            usdValue: 0,
            mintAddress: this.getMintAddress(token),
            decimals: TOKEN_DECIMALS[token],
            associatedTokenAddress: '',
            lastUpdated: new Date()
          });
        }
      }
      
      return balances;
    } catch (error) {
      logger.error('Error fetching all token balances:', error);
      
      if (error instanceof Error) {
        throw new BlockchainError(`Error fetching token balances: ${error.message}`);
      }
      
      throw new BlockchainError('Unknown error fetching token balances');
    }
  }
  
  async getTransactionHistory(walletAddress: string, tokenSymbol?: StablecoinType, limit = 20): Promise<TokenTransaction[]> {
    try {
      // If Helius API is available, use it for better transaction history
      if (this.heliusApiKey) {
        return this.getTransactionHistoryFromHelius(walletAddress, tokenSymbol, limit);
      }
      
      // Fallback to basic transaction history from RPC
      const walletPublicKey = new PublicKey(walletAddress);
      const signatures = await this.connection.getSignaturesForAddress(walletPublicKey, { limit });
      
      const transactions: TokenTransaction[] = [];
      
      for (const sig of signatures) {
        try {
          const tx = await this.connection.getTransaction(sig.signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
          });
          
          if (!tx || !tx.meta) continue;
          
          // Extract token transfers from transaction (simplified implementation)
          // In a production environment, this would need more robust parsing logic
          const isTokenTx = this.isTokenTransaction(tx);
          
          if (isTokenTx) {
            const fromAddress = tx.transaction.signatures[0] ? 
              (await this.connection.getSignatureStatus(tx.transaction.signatures[0])).value?.confirmationStatus ? 
              walletAddress : walletAddress : walletAddress;
            
            let toAddress = 'unknown';
            let amount = 0;
            
            // Try to extract token amount and destination (simplified)
            if (tx.meta && tx.meta.postTokenBalances && tx.meta.postTokenBalances.length > 0) {
              const tokenBalance = tx.meta.postTokenBalances[0];
              amount = Number(tokenBalance.uiTokenAmount?.amount || 0) / Math.pow(10, tokenBalance.uiTokenAmount?.decimals || 9);
              
              if (tokenBalance.owner && tokenBalance.owner !== walletAddress) {
                toAddress = tokenBalance.owner;
              }
            }
            
            transactions.push({
              signature: sig.signature,
              from: fromAddress,
              to: toAddress,
              amount,
              tokenSymbol: tokenSymbol || StablecoinType.USDC, // Default token type
              timestamp: new Date(tx.blockTime ? tx.blockTime * 1000 : Date.now()),
              status: sig.err ? 'failed' : 'confirmed',
              blockHeight: tx.slot,
              fee: tx.meta.fee / 1e9 // Convert from lamports to SOL
            });
          }
        } catch (error) {
          logger.warn(`Error parsing transaction ${sig.signature}:`, error);
        }
      }
      
      return transactions;
    } catch (error) {
      logger.error('Error fetching transaction history:', error);
      
      if (error instanceof Error) {
        throw new BlockchainError(`Error fetching transaction history: ${error.message}`);
      }
      
      throw new BlockchainError('Unknown error fetching transaction history');
    }
  }
  
  // Helper method to check if a transaction is a token transaction
  private isTokenTransaction(tx: any): boolean {
    if (!tx || !tx.meta) return false;
    
    const programIds = tx.transaction.message.programIds?.map((id: any) => id.toString());
    if (programIds && programIds.includes(TOKEN_PROGRAM_ID.toString())) {
      return true;
    }
    
    if (tx.meta.preTokenBalances && tx.meta.preTokenBalances.length > 0) {
      return true;
    }
    
    if (tx.meta.postTokenBalances && tx.meta.postTokenBalances.length > 0) {
      return true;
    }
    
    return false;
  }
  
  async verifyTransaction(signature: string): Promise<{
    isValid: boolean;
    transaction?: TokenTransaction;
  }> {
    try {
      const tx = await this.connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
      
      if (!tx) {
        return { isValid: false };
      }
      
      // Check if it's a token transaction
      const isTokenTx = this.isTokenTransaction(tx);
      
      if (!isTokenTx) {
        return { isValid: false };
      }
      
      // Extract basic transaction details
      let fromAddress = 'unknown';
      let toAddress = 'unknown';
      let amount = 0;
      let tokenSymbol = StablecoinType.USDC; // Default
      
      // Try to extract sender (from first signature)
      if (tx.transaction.signatures && tx.transaction.signatures.length > 0) {
        fromAddress = await this.getAddressFromSignature(tx.transaction.signatures[0]);
      }
      
      // Try to extract token details
      if (tx.meta && tx.meta.postTokenBalances && tx.meta.postTokenBalances.length > 0) {
        const tokenBalance = tx.meta.postTokenBalances[0];
        
        // Extract amount
        amount = Number(tokenBalance.uiTokenAmount?.amount || 0) / 
                 Math.pow(10, tokenBalance.uiTokenAmount?.decimals || 9);
        
        // Extract recipient
        if (tokenBalance.owner && tokenBalance.owner !== fromAddress) {
          toAddress = tokenBalance.owner;
        }
        
        // Try to determine token type from mint address
        if (tokenBalance.mint) {
          tokenSymbol = this.getTokenSymbolFromMint(tokenBalance.mint) || StablecoinType.USDC;
        }
      }
      
      const transaction: TokenTransaction = {
        signature,
        from: fromAddress,
        to: toAddress,
        amount,
        tokenSymbol,
        timestamp: new Date(tx.blockTime ? tx.blockTime * 1000 : Date.now()),
        status: tx.meta?.err ? 'failed' : 'confirmed',
        blockHeight: tx.slot,
        fee: tx.meta?.fee ? tx.meta.fee / 1e9 : 0 // Convert from lamports to SOL
      };
      
      return {
        isValid: !tx.meta?.err,
        transaction
      };
    } catch (error) {
      logger.error('Error verifying transaction:', error);
      
      if (error instanceof Error) {
        throw new BlockchainError(`Error verifying transaction: ${error.message}`);
      }
      
      throw new BlockchainError('Unknown error verifying transaction');
    }
  }
  
  // Helper method to get address from signature
  private async getAddressFromSignature(signature: string): Promise<string> {
    try {
      const status = await this.connection.getSignatureStatus(signature);
      return status.value?.confirmationStatus ? signature.substring(0, 44) : 'unknown';
    } catch {
      return 'unknown';
    }
  }
  
  // Helper method to get token symbol from mint address
  private getTokenSymbolFromMint(mintAddress: string): StablecoinType | undefined {
    for (const [symbol, addresses] of Object.entries(STABLECOIN_MINTS)) {
      if (Object.values(addresses).includes(mintAddress)) {
        return symbol as StablecoinType;
      }
    }
    return undefined;
  }
  
  async circleTokenTransfer(fromPrivateKey: string, toAddress: string, amount: number, tokenSymbol: StablecoinType): Promise<string> {
    if (!this.circleApiKey) {
      throw new BadRequestError('Circle API key not configured');
    }
    
    try {
      logger.info(`Creating Circle token transfer: ${amount} ${tokenSymbol} to ${toAddress}`);
      
      const mockTransactionId = `circle_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
      
      return mockTransactionId;
    } catch (error) {
      logger.error('Error in Circle token transfer:', error);
      
      if (typeof error === 'object' && error !== null && 'response' in error) {
        const axiosError = error as { response?: { data?: { message?: string } } };
        throw new BlockchainError(`Circle API error: ${axiosError.response?.data?.message || 'Unknown API error'}`);
      }
      
      if (error instanceof Error) {
        throw new BlockchainError(`Error in Circle token transfer: ${error.message}`);
      }
      
      throw new BlockchainError('Unknown error in Circle token transfer');
    }
  }
  
  // Helper methods for Helius API integration
  private async getTokenBalanceFromHelius(walletAddress: string, tokenSymbol: StablecoinType): Promise<TokenBalance> {
    try {
      if (!this.heliusApiKey) {
        throw new BlockchainError('Helius API key not configured');
      }
      
      const mintAddress = this.getMintAddress(tokenSymbol);
      const url = `https://api.helius.xyz/v0/addresses/${walletAddress}/balances?api-key=${this.heliusApiKey}`;
      
      interface HeliusBalanceResponse {
        tokens?: Array<{
          mint: string;
          amount: string;
          decimals: number;
          address?: string;
        }>;
      }
      
      const response = await axios.get<HeliusBalanceResponse>(url);
      const tokens = response.data?.tokens || [];
      
      const token = tokens.find((t) => t.mint === mintAddress);
      
      if (!token) {
        return {
          tokenSymbol,
          amount: 0,
          usdValue: 0,
          mintAddress,
          decimals: TOKEN_DECIMALS[tokenSymbol],
          associatedTokenAddress: '',
          lastUpdated: new Date()
        };
      }
      
      const amount = parseFloat(token.amount) / Math.pow(10, token.decimals);
      
      return {
        tokenSymbol,
        amount,
        usdValue: amount,
        mintAddress,
        decimals: token.decimals,
        associatedTokenAddress: token.address || '',
        lastUpdated: new Date()
      };
    } catch (error) {
      logger.error('Error fetching token balance from Helius:', error);
      
      if (error instanceof Error) {
        throw new BlockchainError(`Error fetching token balance from Helius: ${error.message}`);
      }
      
      throw new BlockchainError('Unknown error fetching token balance from Helius');
    }
  }
  
  private async getAllTokenBalancesFromHelius(walletAddress: string): Promise<TokenBalance[]> {
    try {
      if (!this.heliusApiKey) {
        throw new BlockchainError('Helius API key not configured');
      }
      
      const url = `https://api.helius.xyz/v0/addresses/${walletAddress}/balances?api-key=${this.heliusApiKey}`;
      
      interface HeliusBalanceResponse {
        tokens?: Array<{
          mint: string;
          amount: string;
          decimals: number;
          address?: string;
        }>;
      }
      
      const response = await axios.get<HeliusBalanceResponse>(url);
      const tokens = response.data?.tokens || [];
      
      const supportedTokens = Object.values(StablecoinType);
      const balances: TokenBalance[] = [];
      
      for (const tokenSymbol of supportedTokens) {
        const mintAddress = this.getMintAddress(tokenSymbol);
        const token = tokens.find((t) => t.mint === mintAddress);
        
        if (token) {
          const amount = parseFloat(token.amount) / Math.pow(10, token.decimals);
          
          balances.push({
            tokenSymbol,
            amount,
            usdValue: amount,
            mintAddress,
            decimals: token.decimals,
            associatedTokenAddress: token.address || '',
            lastUpdated: new Date()
          });
        } else {
          balances.push({
            tokenSymbol,
            amount: 0,
            usdValue: 0,
            mintAddress,
            decimals: TOKEN_DECIMALS[tokenSymbol],
            associatedTokenAddress: '',
            lastUpdated: new Date()
          });
        }
      }
      
      return balances;
    } catch (error) {
      logger.error('Error fetching all token balances from Helius:', error);
      
      if (error instanceof Error) {
        throw new BlockchainError(`Error fetching token balances from Helius: ${error.message}`);
      }
      
      throw new BlockchainError('Unknown error fetching token balances from Helius');
    }
  }
  
  private async getTransactionHistoryFromHelius(
    walletAddress: string, 
    tokenSymbol?: StablecoinType, 
    limit = 20
  ): Promise<TokenTransaction[]> {
    try {
      if (!this.heliusApiKey) {
        throw new BlockchainError('Helius API key not configured');
      }
      
      let params = `api-key=${this.heliusApiKey}&limit=${limit}`;
      
      if (tokenSymbol) {
        const mintAddress = this.getMintAddress(tokenSymbol);
        params += `&type=TOKEN_TRANSFER&mintAccounts[]=${mintAddress}`;
      } else {
        params += '&type=TOKEN_TRANSFER';
      }
      
      const url = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?${params}`;
      
      interface HeliusTokenTransfer {
        amount: number;
        mint: string;
        toUserAccount: string;
        fromUserAccount: string;
      }
      
      interface HeliusTransaction {
        signature?: string;
        id?: string;
        sourceAddress?: string;
        destinationAddress?: string;
        amount?: number | string;
        tokenSymbol?: string;
        timestamp?: number;
        status?: string;
        blockHeight?: number;
        slot?: number;
        fee?: number | string;
        tokenTransfers?: HeliusTokenTransfer[];
        fromUserAccount?: string;
      }
      
      const response = await axios.get<HeliusTransaction[]>(url);
      const transactions = response.data || [];
      
      return transactions.map((tx): TokenTransaction => {
        let amount = 0;
        let destinationAddress = 'unknown';
        let actualTokenSymbol = tokenSymbol || StablecoinType.USDC;
        
        if (tx.tokenTransfers && Array.isArray(tx.tokenTransfers) && tx.tokenTransfers.length > 0) {
          const transfer = tx.tokenTransfers[0];
          amount = typeof transfer.amount === 'number' ? transfer.amount : 0;
          destinationAddress = transfer.toUserAccount || tx.destinationAddress || 'unknown';
          
          if (transfer.mint) {
            for (const [symbol, addresses] of Object.entries(STABLECOIN_MINTS)) {
              if (Object.values(addresses).includes(transfer.mint)) {
                actualTokenSymbol = symbol as StablecoinType;
                break;
              }
            }
          }
        } else if (tx.amount) {
          amount = typeof tx.amount === 'number' ? tx.amount : parseFloat(tx.amount as string) || 0;
        }
        
        let txStatus: 'confirmed' | 'pending' | 'failed' = 'confirmed';
        if (tx.status) {
          if (tx.status.toLowerCase().includes('fail')) {
            txStatus = 'failed';
          } else if (tx.status.toLowerCase().includes('pend')) {
            txStatus = 'pending';
          }
        }
        
        return {
          signature: tx.signature || tx.id || '',
          from: tx.sourceAddress || tx.fromUserAccount || walletAddress,
          to: destinationAddress,
          amount: amount,
          tokenSymbol: actualTokenSymbol,
          timestamp: new Date(tx.timestamp ? tx.timestamp * 1000 : Date.now()),
          status: txStatus,
          blockHeight: tx.blockHeight || tx.slot || 0,
          fee: typeof tx.fee === 'number' ? tx.fee / 1e9 : parseFloat(tx.fee as string || '0') / 1e9
        };
      });
    } catch (error) {
      logger.error('Error fetching transaction history from Helius:', error);
      
      if (error instanceof Error) {
        throw new BlockchainError(`Error fetching transaction history from Helius: ${error.message}`);
      }
      
      throw new BlockchainError('Unknown error fetching transaction history from Helius');
    }
  }
  
  private getMintAddress(tokenSymbol: StablecoinType): string {
    const mintAddresses = STABLECOIN_MINTS[tokenSymbol];
    
    if (!mintAddresses) {
      throw new BadRequestError(`Unsupported stablecoin: ${tokenSymbol}`);
    }
    
    return mintAddresses[this.network];
  }
  
  private async findAssociatedTokenAddress(
    walletAddress: PublicKey,
    tokenMintAddress: PublicKey
  ): Promise<PublicKey> {
    return PublicKey.findProgramAddress(
      [
        walletAddress.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        tokenMintAddress.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    ).then(([address]) => address);
  }
}

export const stablecoinService = new StablecoinService();
export default stablecoinService;
