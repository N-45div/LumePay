import { PublicKey, Transaction, Connection, Keypair } from '@solana/web3.js';
import { createQR, encodeURL, TransactionRequestURL } from '@solana/pay';
import BigNumber from 'bignumber.js';
import logger from '../utils/logger';
import escrowService from '../blockchain/escrow.service';
import * as notificationsService from './notifications.service';
import * as escrowsRepository from '../db/escrows.repository';
import * as usersRepository from '../db/users.repository';
import { v4 as uuidv4 } from 'uuid';
import bs58 from 'bs58';
import { EscrowStatus } from '../types';

interface TokenAddressMap {
  [key: string]: string | undefined;
}

interface NetworkTokenMap {
  [network: string]: TokenAddressMap;
}

const TOKEN_ADDRESSES: NetworkTokenMap = {
  mainnet: {
    'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    'USD*': 'USD5tarbgyyersCiLXHKVjbFTcfLNhYZ9EEEKSj3hbQU',
    'SOL': undefined // Native SOL
  },
  devnet: {
    'USDC': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    'USDT': 'BQcdHdAQW1hczDbBi9hiegXAR7A98Q9jx3X3sXJHgS7b',
    'USD*': 'UsdStarMintAddressToBeUpdated11111111111111',  // Placeholder for devnet USD*
    'SOL': undefined // Native SOL
  }
};

const TEN_MINS_IN_MS = 10 * 60 * 1000;

interface PaymentRequest {
  id: string;
  recipient: string;
  amount: number;
  currency: string;
  reference: string;
  memo?: string;
  label?: string;
  message?: string;
  createdAt: Date;
  expiresAt: Date;
  status: 'pending' | 'completed' | 'expired' | 'failed';
  metadata?: Record<string, any>;
}

class SolanaPayService {
  private connection: Connection;
  private paymentRequests: Map<string, PaymentRequest> = new Map();
  
  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );
 
    this.startExpiryCleanup();
  }
  
  /**
   * Create a Solana Pay payment request
   */
  async createPaymentRequest(
    recipient: string,
    amount: number,
    currency = 'USDC',
    memo?: string,
    label?: string,
    message?: string,
    expiryMinutes = 10
  ): Promise<{ paymentId: string; qrCode: string; url: string; tokenInfo: { symbol: string; isNative: boolean } }> {
    try {
      if (!this.isSupportedCurrency(currency)) {
        throw new Error(`Unsupported currency: ${currency}`);
      }
      
      const recipientPublicKey = new PublicKey(recipient);
      const reference = new Keypair().publicKey.toString();
      const paymentId = uuidv4();
      
      const paymentRequest: PaymentRequest = {
        id: paymentId,
        recipient,
        amount,
        currency,
        reference,
        memo,
        label: label || 'LumeSquare Marketplace',
        message: message || `Payment of ${amount} ${currency}`,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
        status: 'pending'
      };
      
      this.paymentRequests.set(paymentId, paymentRequest);
      const url = this.generatePaymentUrl(paymentRequest);
      const qrCode = this.generateQrCode(url);
      
      logger.info(`Created Solana Pay payment request: ${paymentId} for ${amount} ${currency}`);
      
      return {
        paymentId,
        qrCode,
        url,
        tokenInfo: {
          symbol: currency,
          isNative: currency === 'SOL'
        }
      };
    } catch (error: any) {
      logger.error('Error creating Solana Pay payment request:', error);
      throw new Error(`Failed to create payment request: ${error.message}`);
    }
  }
  
  /**
   * Generate a Solana Pay URL for a payment request
   */
  private generatePaymentUrl(paymentRequest: PaymentRequest): string {
    const { recipient, amount, currency, reference, memo, label, message } = paymentRequest;
    
    const recipientPublicKey = new PublicKey(recipient);
    const referencePublicKey = new PublicKey(reference);
    
    const url = encodeURL({
      recipient: recipientPublicKey,
      amount: new BigNumber(amount),
      splToken: this.getTokenMintAddress(currency),
      reference: referencePublicKey,
      label,
      message,
      memo
    });
    
    return url.toString();
  }
  
  /**
   * Generate a QR code for a Solana Pay URL
   */
  private generateQrCode(url: string): string {
    const qr = createQR(url);
    return qr.toString();
  }
  
  /**
   * Check the status of a payment request
   */
  async checkPaymentStatus(paymentId: string): Promise<{ status: string; transaction?: string }> {
    const paymentRequest = this.paymentRequests.get(paymentId);
    
    if (!paymentRequest) {
      throw new Error(`Payment request not found: ${paymentId}`);
    }
 
    if (paymentRequest.status === 'pending' && new Date() > paymentRequest.expiresAt) {
      paymentRequest.status = 'expired';
      this.paymentRequests.set(paymentId, paymentRequest);
    }
    
    if (paymentRequest.status === 'pending') {
      try {
        const referencePublicKey = new PublicKey(paymentRequest.reference);
        const signatures = await this.connection.getSignaturesForAddress(referencePublicKey);
        
        if (signatures.length > 0) {
          paymentRequest.status = 'completed';
          this.paymentRequests.set(paymentId, paymentRequest);

          const metadata = paymentRequest.metadata || {};
          if (metadata.escrowId) {
            await this.updateEscrowStatusAfterPayment(
              metadata.escrowId, 
              signatures[0].signature,
              paymentRequest.amount,
              paymentRequest.currency
            );
          }
          
          if (metadata.userId) {
            await this.sendPaymentStatusNotification(
              metadata.userId,
              'completed',
              paymentRequest.amount,
              paymentRequest.currency,
              { 
                paymentId,
                transaction: signatures[0].signature,
                ...metadata
              }
            );
          }
          
          return {
            status: 'completed',
            transaction: signatures[0].signature
          };
        }
      } catch (error: any) {
        logger.error(`Error checking payment status for ${paymentId}:`, error);
      }
    } else if (paymentRequest.status === 'completed' || paymentRequest.status === 'expired') {
      const metadata = paymentRequest.metadata || {};
      if (metadata.userId && !metadata.notificationSent) {
        await this.sendPaymentStatusNotification(
          metadata.userId,
          paymentRequest.status,
          paymentRequest.amount,
          paymentRequest.currency,
          { 
            paymentId,
            ...metadata 
          }
        );
        
        paymentRequest.metadata = { ...metadata, notificationSent: true };
        this.paymentRequests.set(paymentId, paymentRequest);
        
        if (metadata.escrowId && metadata.sellerId) {
          await notificationsService.createEscrowNotification(
            metadata.sellerId,
            `Buyer has funded the escrow #${metadata.escrowId.substring(0, 8)} with ${paymentRequest.amount} ${paymentRequest.currency}.`,
            metadata
          );
        }
      }
    }
    
    return {
      status: paymentRequest.status
    };
  }

  /**
   * Update escrow status after payment confirmation
   */
  private async updateEscrowStatusAfterPayment(
    escrowId: string,
    transactionSignature: string,
    amount: number,
    currency: string
  ): Promise<void> {
    try {
      const escrow = await escrowsRepository.findById(escrowId);
      
      if (!escrow) {
        logger.error(`Escrow ${escrowId} not found while updating after payment`);
        return;
      }
      
      await escrowsRepository.updateStatus(
        escrowId,
        EscrowStatus.FUNDED,
        transactionSignature
      );
      
      logger.info(`Updated escrow ${escrowId} status to FUNDED after payment confirmation`);
      
      try {
        const buyer = await usersRepository.findById(escrow.buyerId);
        
        if (!buyer) {
          logger.error(`Buyer with ID ${escrow.buyerId} not found for escrow ${escrowId}`);
          return;
        }

        await escrowService.fundEscrow(
          escrowId,
          buyer.walletAddress,
          escrow.buyerId,
          transactionSignature,
          amount,
          currency
        );
        
        logger.info(`Successfully updated on-chain escrow for ${escrowId}`);
      } catch (error: any) {
        logger.error(`Error updating on-chain escrow for ${escrowId}:`, error);

      }
    } catch (error: any) {
      logger.error(`Error updating escrow status after payment for ${escrowId}:`, error);
    }
  }
  
  /**
   * Create an escrow payment using Solana Pay
   */
  async createEscrowPayment(
    sellerId: string,
    buyerId: string,
    sellerWalletAddress: string,
    buyerWalletAddress: string,
    amount: number,
    listingId: string,
    currency = 'USDC',
    memo?: string
  ): Promise<{ paymentId: string; qrCode: string; url: string; escrowAddress: string }> {
    try {
      const { escrowAddress, releaseTime } = await escrowService.createEscrow(
        sellerWalletAddress,
        buyerWalletAddress,
        amount,
        currency
      );
      
      const label = 'LumeSquare Escrow Payment';
      const message = `Payment of ${amount} ${currency} for escrow ${escrowAddress}`;
      
      const { paymentId, qrCode, url, tokenInfo } = await this.createPaymentRequest(
        escrowAddress,
        amount,
        currency,
        memo || `Escrow for listing ${listingId}`,
        label,
        message
      );

      const paymentRequest = this.paymentRequests.get(paymentId);
      if (paymentRequest) {
        paymentRequest.metadata = {
          escrowId: escrowAddress,
          listingId,
          buyerId,
          sellerId,
          userId: buyerId
        };
        this.paymentRequests.set(paymentId, paymentRequest);
        
        await notificationsService.createEscrowNotification(
          buyerId,
          `Escrow created for listing #${listingId}. Please complete the payment.`,
          {
            escrowId: escrowAddress,
            listingId,
            amount,
            currency,
            paymentId
          }
        );
        
        await notificationsService.createEscrowNotification(
          sellerId,
          `A buyer has initiated an escrow for your listing #${listingId}.`,
          {
            escrowId: escrowAddress,
            listingId,
            amount,
            currency,
            paymentId
          }
        );
      }
      
      logger.info(`Created escrow payment request: ${paymentId} for escrow ${escrowAddress}`);
      
      return {
        paymentId,
        qrCode,
        url,
        escrowAddress
      };
    } catch (error: any) {
      logger.error('Error creating escrow payment:', error);
      throw new Error(`Failed to create escrow payment: ${error.message}`);
    }
  }
  
  /**
   * Send payment status notification to user
   */
  private async sendPaymentStatusNotification(
    userId: string,
    status: string,
    amount: number,
    currency: string,
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      let message = '';
      
      switch (status) {
        case 'completed':
          if (metadata.escrowId) {
            message = `Your payment of ${amount} ${currency} for escrow #${metadata.escrowId.substring(0, 8)} has been completed.`;
            
            if (metadata.sellerId && metadata.sellerId !== userId) {
              await notificationsService.createEscrowNotification(
                metadata.sellerId,
                `Buyer has funded the escrow #${metadata.escrowId.substring(0, 8)} with ${amount} ${currency}.`,
                metadata
              );
            }
          } else {
            message = `Your payment of ${amount} ${currency} has been completed.`;
          }
          
          await notificationsService.createTransactionNotification(userId, message, metadata);
          break;
          
        case 'expired':
          if (metadata.escrowId) {
            message = `Your payment for escrow #${metadata.escrowId.substring(0, 8)} has expired. Please try again.`;
            
            if (metadata.sellerId && metadata.sellerId !== userId) {
              await notificationsService.createEscrowNotification(
                metadata.sellerId,
                `The buyer's payment for escrow #${metadata.escrowId.substring(0, 8)} has expired.`,
                metadata
              );
            }
          } else {
            message = `Your payment of ${amount} ${currency} has expired. Please try again.`;
          }
          
          await notificationsService.createTransactionNotification(userId, message, metadata);
          break;
          
        default:
          break;
      }
    } catch (error: any) {
      logger.error('Error sending payment notification:', error);
    }
  }
  
  /**
   * Get token mint address for a currency
   */
  private getTokenMintAddress(currency: string): PublicKey | undefined {
    const network = process.env.SOLANA_NETWORK === 'mainnet' ? 'mainnet' : 'devnet';
    const address = TOKEN_ADDRESSES[network][currency];
    
    if (!address) {
      return undefined;
    }
    
    return new PublicKey(address);
  }
  
  /**
   * Check if a currency is supported
   */
  isSupportedCurrency(currency: string): boolean {
    const network = process.env.SOLANA_NETWORK === 'mainnet' ? 'mainnet' : 'devnet';
    return currency === 'SOL' || Object.keys(TOKEN_ADDRESSES[network]).includes(currency);
  }
  
  /**
   * Get supported currencies
   */
  getSupportedCurrencies(): { symbol: string; name: string; isNative: boolean }[] {
    const network = process.env.SOLANA_NETWORK === 'mainnet' ? 'mainnet' : 'devnet';
    
    const currencies = [
      { symbol: 'SOL', name: 'Solana', isNative: true },
      { symbol: 'USDC', name: 'USD Coin', isNative: false },
      { symbol: 'USDT', name: 'Tether', isNative: false }
    ];
    
    const usdStarAddress = TOKEN_ADDRESSES[network]['USD*'];
    if (network === 'mainnet' || (usdStarAddress && !usdStarAddress.includes('ToBeUpdated'))) {
      currencies.push({ symbol: 'USD*', name: 'Perena USD* (Yield-bearing)', isNative: false });
    }
    
    return currencies;
  }
  
  /**
   * Start a periodic job to clean up expired payment requests
   */
  private startExpiryCleanup(): void {
    setInterval(() => {
      const now = new Date();
      
      for (const [id, request] of this.paymentRequests.entries()) {
        if (request.status === 'pending' && now > request.expiresAt) {
          request.status = 'expired';
          this.paymentRequests.set(id, request);
          logger.info(`Payment request expired: ${id}`);
        }
      }
      
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      for (const [id, request] of this.paymentRequests.entries()) {
        if (request.status === 'expired' && request.expiresAt < oneDayAgo) {
          this.paymentRequests.delete(id);
          logger.info(`Removed expired payment request: ${id}`);
        }
      }
    }, 60 * 1000);
  }
}

export const solanaPayService = new SolanaPayService();
export default solanaPayService;
