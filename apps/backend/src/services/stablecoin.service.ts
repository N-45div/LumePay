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

interface TokenInfo {
  mint: string;
  amount: string;
  decimals: number;
  uiAmount: number;
  symbol?: string;
  name?: string;
  address?: string;
}

interface HeliusTransaction {
  description: string;
  type: string;
  source: string;
  fee: number;
  signature: string;
  slot: number;
  timestamp: number;
  tokenTransfers: {
    fromUserAccount: string;
    toUserAccount: string;
    fromTokenAccount: string;
    toTokenAccount: string;
    tokenAmount: number;
    mint: string;
    tokenStandard: string;
  }[];
  nativeTransfers: {
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }[];
  accountData: {
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges: {
      userAccount: string;
      tokenAccount: string;
      mint: string;
      rawTokenAmount: {
        tokenAmount: string;
        decimals: number;
      };
    }[];
  }[];
  events: Record<string, any>;
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
      
      if (this.heliusApiKey) {
        return this.getTokenBalanceFromHelius(walletAddress, tokenSymbol);
      }
      
      const tokenAccountInfo = await this.connection.getTokenAccountBalance(tokenAccount);
      
      if (!tokenAccountInfo?.value) {
        throw new BlockchainError(`Failed to fetch token balance for ${tokenSymbol}`);
      }
      
      const amount = parseFloat(tokenAccountInfo.value.amount) / Math.pow(10, tokenAccountInfo.value.decimals);
      
      return {
        tokenSymbol,
        amount,
        usdValue: amount,
        mintAddress,
        decimals: tokenAccountInfo.value.decimals,
        associatedTokenAddress: tokenAccount.toBase58(),
        lastUpdated: new Date()
      };
    } catch (error) {
      logger.error('Error getting token balance:', error);
      
      if (error instanceof Error && !(error instanceof BlockchainError)) {
        throw new BlockchainError(`Failed to get token balance: ${error.message}`);
      }
      
      throw error;
    }
  }
  
  async getAllTokenBalances(walletAddress: string): Promise<TokenBalance[]> {
    try {
      if (this.heliusApiKey) {
        return this.getAllTokenBalancesFromHelius(walletAddress);
      }
      
      const balances: TokenBalance[] = [];
      
      for (const tokenSymbol of Object.values(StablecoinType)) {
        try {
          const balance = await this.getTokenBalance(walletAddress, tokenSymbol);
          balances.push(balance);
        } catch (error) {
          logger.warn(`Failed to get balance for ${tokenSymbol}`, error);
          
          const mintAddress = this.getMintAddress(tokenSymbol);
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
      logger.error('Error getting all token balances:', error);
      
      if (error instanceof Error) {
        throw new BlockchainError(`Failed to get all token balances: ${error.message}`);
      }
      
      throw new BlockchainError('Failed to get all token balances');
    }
  }
  
  async getTransactionHistory(
    walletAddress: string,
    tokenSymbol?: StablecoinType,
    limit = 20
  ): Promise<TokenTransaction[]> {
    try {
      if (this.heliusApiKey) {
        return this.getTransactionHistoryFromHelius(walletAddress, tokenSymbol, limit);
      }
      
      throw new BlockchainError('Transaction history without Helius API is not implemented');
    } catch (error) {
      logger.error('Error getting transaction history:', error);
      
      if (error instanceof Error && !(error instanceof BlockchainError)) {
        throw new BlockchainError(`Failed to get transaction history: ${error.message}`);
      }
      
      throw error;
    }
  }
  
  isTokenTransaction(tx: any): boolean {
    try {
      if (!tx || !tx.transaction || !tx.transaction.message || !tx.transaction.message.accountKeys) {
        return false;
      }
      
      const accountKeys = tx.transaction.message.accountKeys;
      
      for (const key of accountKeys) {
        if (key.pubkey.toBase58() === TOKEN_PROGRAM_ID.toBase58()) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      logger.error('Error checking if transaction is token transaction:', error);
      return false;
    }
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
      
      if (!this.isTokenTransaction(tx)) {
        return { isValid: false };
      }
      
      if (tx.meta?.err) {
        return { isValid: false };
      }
      
      const tokenTransfers = tx.meta?.postTokenBalances?.filter(post => {
        const pre = tx.meta?.preTokenBalances?.find(
          pre => pre.accountIndex === post.accountIndex
        );
        return pre && pre.uiTokenAmount.uiAmount !== post.uiTokenAmount.uiAmount;
      });
      
      if (!tokenTransfers || tokenTransfers.length === 0) {
        return { isValid: false };
      }
      
      const transfer = tokenTransfers[0];
      const mintAddress = transfer.mint;
      const tokenSymbol = this.getTokenSymbolFromMint(mintAddress);
      
      if (!tokenSymbol) {
        return { isValid: false };
      }
      
      const pre = tx.meta?.preTokenBalances?.find(
        pre => pre.accountIndex === transfer.accountIndex
      );
      
      const post = tx.meta?.postTokenBalances?.find(
        post => post.accountIndex === transfer.accountIndex
      );
      
      if (!pre || !post) {
        return { isValid: false };
      }
      
      const fromAddress = await this.getAddressFromSignature(signature);
      
      return {
        isValid: true,
        transaction: {
          signature,
          from: fromAddress || 'unknown',
          to: 'unknown',
          amount: Math.abs(
            (post.uiTokenAmount.uiAmount || 0) - (pre.uiTokenAmount.uiAmount || 0)
          ),
          tokenSymbol,
          timestamp: new Date(tx.blockTime ? tx.blockTime * 1000 : Date.now()),
          status: 'confirmed',
          blockHeight: tx.slot,
          fee: tx.meta?.fee ? tx.meta.fee / 1e9 : undefined
        }
      };
    } catch (error) {
      logger.error('Error verifying transaction:', error);
      return { isValid: false };
    }
  }
  
  async getAddressFromSignature(signature: string): Promise<string> {
    try {
      const tx = await this.connection.getTransaction(signature);
      if (!tx || !tx.transaction || !tx.transaction.signatures || tx.transaction.signatures.length === 0) {
        return '';
      }
      return tx.transaction.message.accountKeys[0].toString();
    } catch (error) {
      logger.error('Error getting address from signature:', error);
      return '';
    }
  }
  
  getTokenSymbolFromMint(mintAddress: string): StablecoinType | undefined {
    for (const [symbol, addresses] of Object.entries(STABLECOIN_MINTS)) {
      if (addresses[this.network] === mintAddress) {
        return symbol as StablecoinType;
      }
    }
    return undefined;
  }
  
  async circleTokenTransfer(
    fromPrivateKey: string,
    toAddress: string,
    amount: number,
    tokenSymbol: StablecoinType
  ): Promise<string> {
    try {
      if (!this.circleApiKey) {
        throw new BlockchainError('Circle API key not configured');
      }
      
      throw new BlockchainError('Circle API integration not implemented');
    } catch (error) {
      logger.error('Error in Circle token transfer:', error);
      
      if (error instanceof Error && !(error instanceof BlockchainError)) {
        throw new BlockchainError(`Failed to complete Circle token transfer: ${error.message}`);
      }
      
      throw error;
    }
  }
  
  private async getTokenBalanceFromHelius(walletAddress: string, tokenSymbol: StablecoinType): Promise<TokenBalance> {
    try {
      if (!this.heliusApiKey) {
        throw new BlockchainError('Helius API key not configured');
      }
      
      const mintAddress = this.getMintAddress(tokenSymbol);
      const walletPublicKey = new PublicKey(walletAddress);
      const mintPublicKey = new PublicKey(mintAddress);
      const associatedTokenAddress = (await this.findAssociatedTokenAddress(walletPublicKey, mintPublicKey)).toBase58();
      
      const url = `https://api.helius.xyz/v0/addresses/${associatedTokenAddress}/balances?api-key=${this.heliusApiKey}`;
      
      const response = await axios.get<{ tokens: TokenInfo[] }>(url);
      const data = response.data;
      
      if (!data.tokens || data.tokens.length === 0) {
        return {
          tokenSymbol,
          amount: 0,
          usdValue: 0,
          mintAddress,
          decimals: TOKEN_DECIMALS[tokenSymbol],
          associatedTokenAddress,
          lastUpdated: new Date()
        };
      }
      
      const token = data.tokens.find((t: TokenInfo) => t.mint === mintAddress);
      
      if (!token) {
        return {
          tokenSymbol,
          amount: 0,
          usdValue: 0,
          mintAddress,
          decimals: TOKEN_DECIMALS[tokenSymbol],
          associatedTokenAddress,
          lastUpdated: new Date()
        };
      }
      
      return {
        tokenSymbol,
        amount: token.uiAmount,
        usdValue: token.uiAmount,
        mintAddress,
        decimals: token.decimals,
        associatedTokenAddress,
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
      
      const balances: TokenBalance[] = [];
      
      for (const tokenSymbol of Object.values(StablecoinType)) {
        try {
          const balance = await this.getTokenBalanceFromHelius(walletAddress, tokenSymbol);
          balances.push(balance);
        } catch (error) {
          logger.warn(`Failed to get Helius balance for ${tokenSymbol}`, error);
          
          const mintAddress = this.getMintAddress(tokenSymbol);
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
      
      const response = await axios.get<HeliusTransaction[]>(url);
      const transactions = response.data || [];
      
      return transactions.map((tx: HeliusTransaction): TokenTransaction => {
        let amount = 0;
        let destinationAddress = 'unknown';
        let actualTokenSymbol = tokenSymbol || StablecoinType.USDC;
        
        if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
          const tokenTransfer = tx.tokenTransfers[0];
          
          if (!tokenSymbol) {
            actualTokenSymbol = this.getTokenSymbolFromMint(tokenTransfer.mint) || StablecoinType.USDC;
          }
          
          amount = tokenTransfer.tokenAmount;
          
          if (tokenTransfer.fromUserAccount === walletAddress) {
            destinationAddress = tokenTransfer.toUserAccount;
          } else if (tokenTransfer.toUserAccount === walletAddress) {
            destinationAddress = tokenTransfer.fromUserAccount;
          }
        }
        
        return {
          signature: tx.signature,
          from: tx.source,
          to: destinationAddress,
          amount,
          tokenSymbol: actualTokenSymbol,
          timestamp: new Date(tx.timestamp * 1000),
          status: tx.type === 'TOKEN_TRANSFER' ? 'confirmed' : 'failed',
          blockHeight: tx.slot,
          fee: tx.fee / 1e9
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
