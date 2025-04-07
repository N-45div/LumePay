import { Connection } from '@solana/web3.js';
import logger from '../utils/logger';
import * as notificationsService from './notifications.service';
import { EscrowService } from '../blockchain/escrow.service';
import { EscrowStatus, TransactionStatus } from '../types';
import * as escrowsRepository from '../db/escrows.repository';
import * as usersRepository from '../db/users.repository';
import * as listingsRepository from '../db/listings.repository';

interface PendingTransaction {
  id: string;
  signature: string;
  escrowId: string;
  userId: string;
  type: 'fund' | 'release' | 'refund';
  createdAt: Date;
  lastChecked?: Date;
  retries: number;
}

const MAX_RETRIES = 10;
const CHECK_INTERVAL_MS = 15000; // 15 seconds
const pendingTransactions: Map<string, PendingTransaction> = new Map();
let isMonitoringActive = false;

export async function addTransactionToMonitor(
  signature: string,
  escrowId: string,
  userId: string,
  type: 'fund' | 'release' | 'refund'
): Promise<string> {
  const id = `${type}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  
  const transaction: PendingTransaction = {
    id,
    signature,
    escrowId,
    userId,
    type,
    createdAt: new Date(),
    retries: 0
  };
  
  pendingTransactions.set(id, transaction);
  logger.info(`Added transaction to monitor: ${signature} (${type}) for escrow ${escrowId}`);
  
  if (!isMonitoringActive) {
    startMonitoring();
  }
  
  return id;
}

export function removeTransaction(id: string): boolean {
  const result = pendingTransactions.delete(id);
  if (result) {
    logger.info(`Removed transaction ${id} from monitoring`);
  }
  return result;
}

export function getPendingTransactions(): PendingTransaction[] {
  return Array.from(pendingTransactions.values());
}

function startMonitoring(): void {
  if (isMonitoringActive) return;
  
  isMonitoringActive = true;
  logger.info('Starting transaction monitoring service');
  
  setInterval(async () => {
    if (pendingTransactions.size === 0) {
      return;
    }
    
    logger.debug(`Checking ${pendingTransactions.size} pending transactions`);
    
    const escrowService = new EscrowService();
    const transactionsToRemove: string[] = [];
    
    for (const [id, transaction] of pendingTransactions.entries()) {
      try {
        const isVerified = await escrowService.verifyTransaction(transaction.signature);
        
        transaction.lastChecked = new Date();
        transaction.retries++;
        
        if (isVerified) {
          // Transaction confirmed - update status and notify user
          await handleConfirmedTransaction(transaction);
          transactionsToRemove.push(id);
        } else if (transaction.retries >= MAX_RETRIES) {
          // Max retries reached - mark as failed and notify user
          await handleFailedTransaction(transaction);
          transactionsToRemove.push(id);
        }
      } catch (error) {
        logger.error(`Error monitoring transaction ${transaction.signature}:`, error);
        
        if (transaction.retries >= MAX_RETRIES) {
          await handleFailedTransaction(transaction);
          transactionsToRemove.push(id);
        }
      }
    }
    
    // Clean up processed transactions
    transactionsToRemove.forEach(id => pendingTransactions.delete(id));
    
  }, CHECK_INTERVAL_MS);
}

async function handleConfirmedTransaction(transaction: PendingTransaction): Promise<void> {
  try {
    const escrow = await escrowsRepository.findById(transaction.escrowId);
    if (!escrow) {
      logger.warn(`Escrow ${transaction.escrowId} not found for transaction ${transaction.signature}`);
      return;
    }
    
    let newStatus: EscrowStatus;
    let notificationMessage = '';
    let sellerNotificationMessage = '';
    
    // Get listing details if available
    let listingTitle = "your transaction";
    if (escrow.listingId) {
      const listing = await listingsRepository.findById(escrow.listingId);
      if (listing) {
        listingTitle = listing.title;
      }
    }
    
    switch (transaction.type) {
      case 'fund':
        newStatus = EscrowStatus.FUNDED;
        notificationMessage = `Your payment of ${escrow.amount} ${escrow.currency} for ${listingTitle} has been confirmed on the blockchain.`;
        
        // Also notify seller that funds are available
        if (escrow.sellerId) {
          sellerNotificationMessage = `The escrow for ${listingTitle} has been funded with ${escrow.amount} ${escrow.currency} and is awaiting your confirmation.`;
          await notificationsService.createTransactionNotification(
            escrow.sellerId,
            sellerNotificationMessage
          );
        }
        break;
        
      case 'release':
        newStatus = EscrowStatus.RELEASED;
        notificationMessage = `The escrow for ${listingTitle} has been successfully released. The seller has received the funds.`;
        
        // Also notify seller that they've received the funds
        if (escrow.sellerId) {
          sellerNotificationMessage = `You have received ${escrow.amount} ${escrow.currency} from the escrow for ${listingTitle}.`;
          await notificationsService.createTransactionNotification(
            escrow.sellerId,
            sellerNotificationMessage
          );
        }
        break;
        
      case 'refund':
        newStatus = EscrowStatus.REFUNDED;
        notificationMessage = `Your ${escrow.amount} ${escrow.currency} has been refunded for ${listingTitle}.`;
        
        // Also notify seller about the refund
        if (escrow.sellerId) {
          sellerNotificationMessage = `You have refunded ${escrow.amount} ${escrow.currency} to the buyer for ${listingTitle}.`;
          await notificationsService.createTransactionNotification(
            escrow.sellerId,
            sellerNotificationMessage
          );
        }
        break;
        
      default:
        logger.warn(`Unknown transaction type: ${transaction.type}`);
        return;
    }
    
    // Update escrow status
    await escrowsRepository.updateStatus(
      transaction.escrowId,
      newStatus,
      transaction.signature
    );
    
    // Notify the user
    await notificationsService.createTransactionNotification(
      transaction.userId,
      notificationMessage
    );
    
    logger.info(`Transaction ${transaction.signature} confirmed. Updated escrow ${transaction.escrowId} to ${newStatus}`);
  } catch (error) {
    logger.error(`Error handling confirmed transaction ${transaction.signature}:`, error);
  }
}

async function handleFailedTransaction(transaction: PendingTransaction): Promise<void> {
  try {
    // Fetch escrow details
    const escrow = await escrowsRepository.findById(transaction.escrowId);
    if (!escrow) {
      logger.warn(`Escrow ${transaction.escrowId} not found for failed transaction ${transaction.signature}`);
      return;
    }
    
    // Get listing details if available
    let listingTitle = "your transaction";
    if (escrow.listingId) {
      const listing = await listingsRepository.findById(escrow.listingId);
      if (listing) {
        listingTitle = listing.title;
      }
    }
    
    // Determine notification message based on transaction type
    let notificationMessage = '';
    switch (transaction.type) {
      case 'fund':
        notificationMessage = `Transaction failed: Your payment of ${escrow.amount} ${escrow.currency} for ${listingTitle} could not be confirmed on the blockchain.`;
        break;
        
      case 'release':
        notificationMessage = `Transaction failed: The release of funds for ${listingTitle} could not be confirmed on the blockchain.`;
        break;
        
      case 'refund':
        notificationMessage = `Transaction failed: The refund of ${escrow.amount} ${escrow.currency} for ${listingTitle} could not be confirmed on the blockchain.`;
        break;
        
      default:
        logger.warn(`Unknown transaction type: ${transaction.type}`);
        return;
    }
    
    // Send notification about the failed transaction
    await notificationsService.createTransactionNotification(
      transaction.userId,
      notificationMessage
    );
    
    // Update escrow status to CANCELED if it was a funding transaction that didn't complete
    if (transaction.type === 'fund' && escrow.status === EscrowStatus.CREATED) {
      await escrowsRepository.updateStatus(
        transaction.escrowId,
        EscrowStatus.CANCELED,
        transaction.signature
      );
    }
    
    logger.info(`Transaction ${transaction.signature} failed after ${transaction.retries} retries. Notification sent to user ${transaction.userId}`);
  } catch (error) {
    logger.error(`Error handling failed transaction ${transaction.signature}:`, error);
  }
}

// Initialize the monitoring service
startMonitoring();

export default {
  addTransactionToMonitor,
  removeTransaction,
  getPendingTransactions
};
