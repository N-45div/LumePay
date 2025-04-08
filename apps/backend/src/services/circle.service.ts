import axios from 'axios';
import { circleConfig } from '../config/circle';
import { v4 as uuidv4 } from 'uuid';
import { BadRequestError } from '../utils/errors';
import * as walletsRepository from '../db/wallets.repository';
import * as transactionsRepository from '../db/transactions.repository';
import { TransactionStatus } from '../types';

// Circle API response types
interface CircleApiResponse<T> {
  data: T;
}

interface CircleWallet {
  walletId: string;
  addressIds: string[];
  description: string;
  entityId: string;
}

interface CircleTransfer {
  id: string;
  source: {
    id: string;
    type: string;
  };
  destination: {
    id: string;
    type: string;
  };
  amount: {
    amount: string;
    currency: string;
  };
  status: string;
  createDate: string;
}

interface CircleBalance {
  amount: string;
  currency: string;
}

interface CircleWalletBalances {
  balances: CircleBalance[];
}

const circleApi = axios.create({
  baseURL: circleConfig.baseUrl,
  headers: {
    'Authorization': `Bearer ${circleConfig.apiKey}`,
    'Content-Type': 'application/json'
  }
});

export async function createUserWallet(userId: string): Promise<any> {
  try {
    const idempotencyKey = uuidv4();
    const response = await circleApi.post<{data: CircleWallet}>('/wallets', {
      idempotencyKey,
      description: `LumeSquare User Wallet - ${userId}`
    });

    if (response.data && response.data.data) {
      const walletData = response.data.data;
      const wallet = await walletsRepository.create({
        userId,
        walletId: walletData.walletId,
        type: 'circle',
        address: walletData.addressIds[0]
      });
      
      return wallet;
    }
    
    throw new BadRequestError('Failed to create Circle wallet');
  } catch (error) {
    console.error('Error creating Circle wallet:', error);
    throw new BadRequestError('Failed to create Circle wallet');
  }
}

export async function getUserWallet(userId: string): Promise<any> {
  const wallet = await walletsRepository.findByUserId(userId);
  
  if (!wallet) {
    return await createUserWallet(userId);
  }
  
  return wallet;
}

export async function getWalletBalance(walletId: string): Promise<CircleBalance[]> {
  try {
    const response = await circleApi.get<{data: CircleWalletBalances}>(`/wallets/${walletId}/balances`);
    
    if (response.data && response.data.data) {
      return response.data.data.balances;
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching wallet balance:', error);
    throw new BadRequestError('Failed to fetch wallet balance');
  }
}

export async function getUserTransactions(userId: string, limit = 20, offset = 0): Promise<any> {
  try {
    return await transactionsRepository.findByUserId(userId, limit, offset);
  } catch (error) {
    console.error('Error getting user transactions:', error);
    throw new BadRequestError('Failed to get user transactions');
  }
}

export async function transferToEscrow(
  userId: string,
  amount: number,
  escrowId: string,
  listingId: string
): Promise<{ transaction: any, transfer: CircleTransfer }> {
  const userWallet = await getUserWallet(userId);
  const escrowWallet = await walletsRepository.getEscrowWallet();
  
  if (!userWallet || !escrowWallet) {
    throw new BadRequestError('User or escrow wallet not found');
  }
  
  try {
    const idempotencyKey = uuidv4();
    
    const response = await circleApi.post<{data: CircleTransfer}>('/transfers', {
      idempotencyKey,
      source: {
        type: 'wallet',
        id: userWallet.walletId
      },
      destination: {
        type: 'wallet',
        id: escrowWallet.walletId
      },
      amount: {
        amount: amount.toString(),
        currency: 'USD'
      },
      metadata: {
        escrowId,
        listingId,
        userId
      }
    });
    
    if (response.data && response.data.data) {
      const transferData = response.data.data;
      const transaction = await transactionsRepository.create({
        userId,
        escrowId,
        transferId: transferData.id,
        amount,
        currency: 'USD',
        status: TransactionStatus.PENDING,
        type: 'deposit',
        metadata: {
          sourceWalletId: userWallet.walletId,
          destinationWalletId: escrowWallet.walletId,
          escrowId,
          listingId
        }
      });
      
      return {
        transaction,
        transfer: transferData
      };
    }
    
    throw new BadRequestError('Failed to initiate transfer');
  } catch (error) {
    console.error('Error initiating transfer:', error);
    throw new BadRequestError('Failed to initiate transfer');
  }
}

export async function releaseFromEscrow(
  escrowId: string,
  amount: number,
  sellerId: string
): Promise<{ transaction: any, transfer: CircleTransfer }> {
  const sellerWallet = await getUserWallet(sellerId);
  const escrowWallet = await walletsRepository.getEscrowWallet();
  
  if (!sellerWallet || !escrowWallet) {
    throw new BadRequestError('Seller or escrow wallet not found');
  }
  
  try {
    const idempotencyKey = uuidv4();
    
    const response = await circleApi.post<{data: CircleTransfer}>('/transfers', {
      idempotencyKey,
      source: {
        type: 'wallet',
        id: escrowWallet.walletId
      },
      destination: {
        type: 'wallet',
        id: sellerWallet.walletId
      },
      amount: {
        amount: amount.toString(),
        currency: 'USD'
      },
      metadata: {
        escrowId,
        sellerId,
        type: 'release'
      }
    });
    
    if (response.data && response.data.data) {
      const transferData = response.data.data;
      const transaction = await transactionsRepository.create({
        userId: sellerId,
        escrowId,
        transferId: transferData.id,
        amount,
        currency: 'USD',
        status: TransactionStatus.PENDING,
        type: 'withdrawal',
        metadata: {
          sourceWalletId: escrowWallet.walletId,
          destinationWalletId: sellerWallet.walletId,
          escrowId,
          sellerId,
          type: 'release'
        }
      });
      
      return {
        transaction,
        transfer: transferData
      };
    }
    
    throw new BadRequestError('Failed to release funds from escrow');
  } catch (error) {
    console.error('Error releasing funds from escrow:', error);
    throw new BadRequestError('Failed to release funds from escrow');
  }
}

export async function refundFromEscrow(
  escrowId: string,
  amount: number,
  buyerId: string
): Promise<{ transaction: any, transfer: CircleTransfer }> {
  const buyerWallet = await getUserWallet(buyerId);
  const escrowWallet = await walletsRepository.getEscrowWallet();
  
  if (!buyerWallet || !escrowWallet) {
    throw new BadRequestError('Buyer or escrow wallet not found');
  }
  
  try {
    const idempotencyKey = uuidv4();
    
    const response = await circleApi.post<{data: CircleTransfer}>('/transfers', {
      idempotencyKey,
      source: {
        type: 'wallet',
        id: escrowWallet.walletId
      },
      destination: {
        type: 'wallet',
        id: buyerWallet.walletId
      },
      amount: {
        amount: amount.toString(),
        currency: 'USD'
      },
      metadata: {
        escrowId,
        buyerId,
        type: 'refund'
      }
    });
    
    if (response.data && response.data.data) {
      const transferData = response.data.data;
      const transaction = await transactionsRepository.create({
        userId: buyerId,
        escrowId,
        transferId: transferData.id,
        amount,
        currency: 'USD',
        status: TransactionStatus.PENDING,
        type: 'refund',
        metadata: {
          sourceWalletId: escrowWallet.walletId,
          destinationWalletId: buyerWallet.walletId,
          escrowId,
          buyerId,
          type: 'refund'
        }
      });
      
      return {
        transaction,
        transfer: transferData
      };
    }
    
    throw new BadRequestError('Failed to refund funds from escrow');
  } catch (error) {
    console.error('Error refunding funds from escrow:', error);
    throw new BadRequestError('Failed to refund funds from escrow');
  }
}

export async function getTransferStatus(transferId: string): Promise<CircleTransfer> {
  try {
    const response = await circleApi.get<{data: CircleTransfer}>(`/transfers/${transferId}`);
    
    if (response.data && response.data.data) {
      return response.data.data;
    }
    
    throw new BadRequestError('Transfer not found');
  } catch (error) {
    console.error('Error getting transfer status:', error);
    throw new BadRequestError('Failed to get transfer status');
  }
}

export async function updateTransactionStatus(transferId: string, status: string): Promise<any> {
  const mappedStatus = mapCircleStatusToInternal(status);
  
  try {
    const transaction = await transactionsRepository.updateByTransferId(
      transferId,
      mappedStatus
    );
    
    return transaction;
  } catch (error) {
    console.error('Error updating transaction status:', error);
    throw new BadRequestError('Failed to update transaction status');
  }
}

export async function processCircleWebhook(payload: any, signature: string): Promise<{ success: boolean }> {
  if (!verifyWebhookSignature(payload, signature)) {
    throw new BadRequestError('Invalid webhook signature');
  }
  
  const { type, data } = payload;
  
  if (type === 'transfer.complete' || type === 'transfer.failed') {
    const status = type === 'transfer.complete' ? 'complete' : 'failed';
    await updateTransactionStatus(data.transfer.id, status);
    
    return { success: true };
  }
  
  return { success: true };
}

function verifyWebhookSignature(payload: any, signature: string): boolean {
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', circleConfig.callbackSecret);
  const digest = hmac.update(JSON.stringify(payload)).digest('hex');
  
  return signature === digest;
}

function mapCircleStatusToInternal(circleStatus: string): TransactionStatus {
  switch (circleStatus) {
    case 'complete':
      return TransactionStatus.CONFIRMED;
    case 'failed':
      return TransactionStatus.FAILED;
    default:
      return TransactionStatus.PENDING;
  }
}
