import * as escrowsRepository from '../db/escrows.repository';
import * as listingsRepository from '../db/listings.repository';
import * as usersRepository from '../db/users.repository';
import { EscrowService as BlockchainEscrowService } from '../blockchain/escrow';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/errors';
import { Escrow, EscrowStatus, ListingStatus } from '../types';
import logger from '../utils/logger';
import * as notificationsService from './notifications.service';

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
  
  const escrowResult = await blockchainEscrowService.createEscrow(
    buyer.walletAddress,
    seller.walletAddress,
    listing.price
  );
  
  const escrow = await escrowsRepository.create({
    listingId,
    buyerId,
    sellerId: listing.sellerId,
    amount: listing.price,
    currency: listing.currency,
    status: EscrowStatus.CREATED,
    escrowAddress: escrowResult.escrowAddress,
    releaseTime: escrowResult.releaseTime
  });
  
  logger.info(`Escrow created: ${escrow.id} for listing: ${listingId}`);
  
  // Create notifications for both buyer and seller
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

export const fundEscrow = async (id: string, buyerId: string, buyerPrivateKey: string): Promise<Escrow> => {
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
  
  const fundResult = await blockchainEscrowService.fundEscrow(
    escrow.escrowAddress!,
    escrow.amount,
    buyerPrivateKey
  );
  
  const updatedEscrow = await escrowsRepository.updateStatus(
    id,
    EscrowStatus.FUNDED,
    fundResult.transactionSignature
  );
  
  if (!updatedEscrow) {
    throw new NotFoundError('Escrow not found');
  }
  
  logger.info(`Escrow funded: ${id} with transaction: ${fundResult.transactionSignature}`);
  
  // Get the listing details if available
  let listingTitle = "your purchase";
  if (escrow.listingId) {
    const listing = await listingsRepository.findById(escrow.listingId);
    if (listing) {
      listingTitle = listing.title;
    }
  }
  
  // Create notifications for both buyer and seller
  await notificationsService.createTransactionNotification(
    buyerId,
    `You have successfully funded the escrow for ${listingTitle} with ${escrow.amount} ${escrow.currency}`
  );
  
  await notificationsService.createTransactionNotification(
    escrow.sellerId,
    `The escrow for ${listingTitle} has been funded by the buyer and is awaiting your confirmation`
  );
  
  return updatedEscrow;
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
  
  const releaseResult = await blockchainEscrowService.releaseEscrow(
    escrow.escrowAddress!,
    (await usersRepository.findById(escrow.sellerId))!.walletAddress
  );
  
  const updatedEscrow = await escrowsRepository.updateStatus(
    id,
    EscrowStatus.RELEASED,
    releaseResult.transactionSignature
  );
  
  if (!updatedEscrow) {
    throw new NotFoundError('Escrow not found');
  }
  
  // Get the listing details if available
  let listingTitle = "your purchase";
  if (escrow.listingId) {
    const listing = await listingsRepository.findById(escrow.listingId);
    if (listing) {
      listingTitle = listing.title;
      await listingsRepository.update(escrow.listingId, { status: ListingStatus.SOLD });
    }
  }
  
  logger.info(`Escrow released: ${id} with transaction: ${releaseResult.transactionSignature}`);
  
  // Create notifications for both buyer and seller
  await notificationsService.createTransactionNotification(
    escrow.buyerId,
    `The transaction for ${listingTitle} has been completed. The funds have been released to the seller.`
  );
  
  await notificationsService.createTransactionNotification(
    sellerId,
    `You have released the escrow for ${listingTitle}. The funds have been transferred to your wallet.`
  );
  
  return updatedEscrow;
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
  
  const refundResult = await blockchainEscrowService.refundEscrow(
    escrow.escrowAddress!,
    (await usersRepository.findById(escrow.buyerId))!.walletAddress
  );
  
  const updatedEscrow = await escrowsRepository.updateStatus(
    id,
    EscrowStatus.REFUNDED,
    refundResult.transactionSignature
  );
  
  if (!updatedEscrow) {
    throw new NotFoundError('Escrow not found');
  }
  
  // Get the listing details if available
  let listingTitle = "your purchase";
  if (escrow.listingId) {
    const listing = await listingsRepository.findById(escrow.listingId);
    if (listing) {
      listingTitle = listing.title;
    }
  }
  
  logger.info(`Escrow refunded: ${id} with transaction: ${refundResult.transactionSignature}`);
  
  // Create notifications for both buyer and seller
  await notificationsService.createTransactionNotification(
    escrow.buyerId,
    `The seller has refunded your escrow for ${listingTitle}. The funds have been returned to your wallet.`
  );
  
  await notificationsService.createTransactionNotification(
    sellerId,
    `You have refunded the escrow for ${listingTitle}. The funds have been returned to the buyer.`
  );
  
  return updatedEscrow;
};
