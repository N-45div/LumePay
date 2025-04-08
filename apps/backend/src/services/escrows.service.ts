import * as escrowsRepository from '../db/escrows.repository';
import * as listingsRepository from '../db/listings.repository';
import * as usersRepository from '../db/users.repository';
import { EscrowService as BlockchainEscrowService } from '../blockchain/escrow.service';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/errors';
import { Escrow, EscrowStatus, ListingStatus, TransactionStatus } from '../types';
import logger from '../utils/logger';
import * as notificationsService from './notifications.service';
import transactionMonitorService from './transaction-monitor.service';
import * as circleService from './circle.service';
import { v4 as uuidv4 } from 'uuid';

const blockchainEscrowService = new BlockchainEscrowService();

export const createEscrow = async (
  buyerId: string,
  listingId: string
): Promise<Escrow> => {
  const buyer = await usersRepository.findById(buyerId);
  if (!buyer) {
    throw new NotFoundError('Buyer not found');
  }
  
  const listing = await listingsRepository.findById(listingId);
  if (!listing) {
    throw new NotFoundError('Listing not found');
  }
  
  if (listing.status !== ListingStatus.ACTIVE) {
    throw new BadRequestError('Listing is not available');
  }
  
  if (listing.sellerId === buyerId) {
    throw new BadRequestError('You cannot buy your own listing');
  }
  
  const seller = await usersRepository.findById(listing.sellerId);
  if (!seller) {
    throw new NotFoundError('Seller not found');
  }
  
  // Generate a unique escrow address identifier
  const escrowAddress = `circle-escrow-${uuidv4()}`;
  const releaseTime = new Date();
  releaseTime.setDate(releaseTime.getDate() + 7); // 7 days escrow period
  
  const escrow = await escrowsRepository.create({
    listingId,
    buyerId,
    sellerId: listing.sellerId,
    amount: listing.price,
    currency: listing.currency,
    status: EscrowStatus.CREATED,
    escrowAddress: escrowAddress,
    releaseTime: releaseTime
  });
  
  logger.info(`Escrow created: ${escrow.id} for listing: ${listingId}`);
  
  await notificationsService.createEscrowNotification(
    buyerId,
    `You have created an escrow for ${listing.title} of ${escrow.amount} ${escrow.currency}`
  );
  
  await notificationsService.createEscrowNotification(
    seller.id,
    `${buyer.username || 'A buyer'} has initiated an escrow purchase for your listing: ${listing.title}`
  );
  
  return escrow;
};

export const getEscrowById = async (id: string, userId: string): Promise<Escrow> => {
  const escrow = await escrowsRepository.findById(id);
  
  if (!escrow) {
    throw new NotFoundError('Escrow not found');
  }
  
  if (escrow.buyerId !== userId && escrow.sellerId !== userId) {
    throw new ForbiddenError('You do not have permission to view this escrow');
  }
  
  return escrow;
};

export const getUserEscrows = async (
  userId: string,
  options: { role?: 'buyer' | 'seller'; status?: EscrowStatus; limit?: number; offset?: number } = {}
): Promise<{ escrows: Escrow[]; total: number }> => {
  return await escrowsRepository.findByUserId(userId, options);
};

export const fundEscrow = async (id: string, buyerId: string): Promise<Escrow> => {
  const escrow = await escrowsRepository.findById(id);
  
  if (!escrow) {
    throw new NotFoundError('Escrow not found');
  }
  
  if (escrow.buyerId !== buyerId) {
    throw new ForbiddenError('Only the buyer can fund this escrow');
  }
  
  if (escrow.status !== EscrowStatus.CREATED) {
    throw new BadRequestError(`Escrow is already in ${escrow.status} state`);
  }
  
  if (!escrow.listingId) {
    throw new BadRequestError('Escrow must be associated with a listing');
  }
  
  try {
    const transferResult = await circleService.transferToEscrow(
      buyerId,
      escrow.amount,
      escrow.id,
      escrow.listingId
    );
    
    // Update escrow status to FUNDED
    const updatedEscrow = await escrowsRepository.updateStatus(
      id,
      EscrowStatus.FUNDED,
      transferResult.transfer.id
    );
    
    if (!updatedEscrow) {
      throw new NotFoundError('Escrow not found');
    }
    
    logger.info(`Escrow funded with Circle: ${id} with transfer: ${transferResult.transfer.id}`);
    
    let listingTitle = "your purchase";
    if (escrow.listingId) {
      const listing = await listingsRepository.findById(escrow.listingId);
      if (listing) {
        listingTitle = listing.title;
      }
    }
    
    await notificationsService.createTransactionNotification(
      buyerId,
      `You have successfully funded the escrow for ${listingTitle} with ${escrow.amount} ${escrow.currency} using USDC`
    );
    
    await notificationsService.createTransactionNotification(
      escrow.sellerId,
      `The escrow for ${listingTitle} has been funded by the buyer using USDC and is awaiting your confirmation`
    );
    
    return updatedEscrow;
  } catch (error: any) {
    logger.error(`Error funding escrow with Circle: ${id}`, error);
    throw new BadRequestError(`Failed to fund escrow: ${error.message || 'Unknown error'}`);
  }
};

export const releaseEscrow = async (id: string, sellerId: string): Promise<Escrow> => {
  const escrow = await escrowsRepository.findById(id);
  
  if (!escrow) {
    throw new NotFoundError('Escrow not found');
  }
  
  if (escrow.sellerId !== sellerId) {
    throw new ForbiddenError('Only the seller can release this escrow');
  }
  
  if (escrow.status !== EscrowStatus.FUNDED) {
    throw new BadRequestError(`Escrow must be in funded state to release, current state: ${escrow.status}`);
  }
  
  try {
    const releaseResult = await circleService.releaseFromEscrow(
      escrow.id,
      escrow.amount,
      sellerId
    );
    
    // Update escrow status to RELEASED
    const updatedEscrow = await escrowsRepository.updateStatus(
      id,
      EscrowStatus.RELEASED,
      releaseResult.transfer.id
    );
    
    if (!updatedEscrow) {
      throw new NotFoundError('Escrow not found');
    }
    
    let listingTitle = "your purchase";
    if (escrow.listingId) {
      const listing = await listingsRepository.findById(escrow.listingId);
      if (listing) {
        listingTitle = listing.title;
        await listingsRepository.update(escrow.listingId, { status: ListingStatus.SOLD });
      }
    }
    
    logger.info(`Escrow released with Circle: ${id} with transfer: ${releaseResult.transfer.id}`);
    
    await notificationsService.createTransactionNotification(
      escrow.buyerId,
      `The transaction for ${listingTitle} has been completed. The USDC funds have been released to the seller.`
    );
    
    await notificationsService.createTransactionNotification(
      sellerId,
      `You have released the escrow for ${listingTitle}. The USDC funds have been transferred to your wallet.`
    );
    
    return updatedEscrow;
  } catch (error: any) {
    logger.error(`Error releasing escrow with Circle: ${id}`, error);
    throw new BadRequestError(`Failed to release escrow: ${error.message || 'Unknown error'}`);
  }
};

export const refundEscrow = async (id: string, sellerId: string): Promise<Escrow> => {
  const escrow = await escrowsRepository.findById(id);
  
  if (!escrow) {
    throw new NotFoundError('Escrow not found');
  }
  
  if (escrow.sellerId !== sellerId) {
    throw new ForbiddenError('Only the seller can refund this escrow');
  }
  
  if (escrow.status !== EscrowStatus.FUNDED) {
    throw new BadRequestError(`Escrow must be in funded state to refund, current state: ${escrow.status}`);
  }
  
  try {
    const refundResult = await circleService.refundFromEscrow(
      escrow.id,
      escrow.amount,
      escrow.buyerId
    );
    
    // Update escrow status to REFUNDED
    const updatedEscrow = await escrowsRepository.updateStatus(
      id,
      EscrowStatus.REFUNDED,
      refundResult.transfer.id
    );
    
    if (!updatedEscrow) {
      throw new NotFoundError('Escrow not found');
    }
    
    let listingTitle = "your purchase";
    if (escrow.listingId) {
      const listing = await listingsRepository.findById(escrow.listingId);
      if (listing) {
        listingTitle = listing.title;
      }
    }
    
    logger.info(`Escrow refunded with Circle: ${id} with transfer: ${refundResult.transfer.id}`);
    
    await notificationsService.createTransactionNotification(
      escrow.buyerId,
      `The seller has refunded your escrow for ${listingTitle}. The USDC funds have been returned to your wallet.`
    );
    
    await notificationsService.createTransactionNotification(
      sellerId,
      `You have refunded the escrow for ${listingTitle}. The USDC funds have been returned to the buyer.`
    );
    
    return updatedEscrow;
  } catch (error: any) {
    logger.error(`Error refunding escrow with Circle: ${id}`, error);
    throw new BadRequestError(`Failed to refund escrow: ${error.message || 'Unknown error'}`);
  }
};
