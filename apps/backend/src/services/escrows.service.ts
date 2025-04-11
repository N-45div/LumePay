import * as escrowsRepository from '../db/escrows.repository';
import * as listingsRepository from '../db/listings.repository';
import * as usersRepository from '../db/users.repository';
import { EscrowService as BlockchainEscrowService } from '../blockchain/escrow.service';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/errors';
import { Escrow, EscrowStatus, ListingStatus, TransactionStatus, DisputeResolutionMode, MultiSigStatus } from '../types';
import logger from '../utils/logger';
import * as notificationsService from './notifications.service';
import transactionMonitorService from './transaction-monitor.service';
import * as circleService from './circle.service';
import reputationService from './reputation.service';
import { v4 as uuidv4 } from 'uuid';

const blockchainEscrowService = new BlockchainEscrowService();
const HIGH_VALUE_THRESHOLD = 1000;

export const createEscrow = async (
  buyerId: string,
  listingId: string,
  options?: {
    isMultiSig?: boolean;
    isTimeLocked?: boolean;
    unlockTimeInDays?: number;
    autoResolveAfterDays?: number;
    disputeResolutionMode?: DisputeResolutionMode;
  }
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
 
  const escrowAddress = `circle-escrow-${uuidv4()}`;
  
  const isHighValue = listing.price >= HIGH_VALUE_THRESHOLD;
  const isMultiSig = options?.isMultiSig !== undefined ? options.isMultiSig : isHighValue;
  
  const releaseTime = new Date();
  releaseTime.setDate(releaseTime.getDate() + 7); // 7 days default escrow period
  
  const isTimeLocked = options?.isTimeLocked || false;
  let unlockTime: Date | undefined = undefined;
  
  if (isTimeLocked && options?.unlockTimeInDays) {
    unlockTime = new Date();
    unlockTime.setDate(unlockTime.getDate() + options.unlockTimeInDays);
  }
  
  const multiSigSignatures: MultiSigStatus | undefined = isMultiSig ? {
    buyerSigned: false,
    sellerSigned: false,
    adminSigned: false,
    requiredSignatures: 2,
    completedSignatures: 0
  } : undefined;
  
  let initialStatus = 'created' as EscrowStatus;
  if (isMultiSig) {
    initialStatus = 'awaiting_signatures' as EscrowStatus;
  } else if (isTimeLocked) {
    initialStatus = 'time_locked' as EscrowStatus;
  }
  
  const escrow = await escrowsRepository.create({
    listingId,
    buyerId,
    sellerId: listing.sellerId,
    amount: listing.price,
    currency: listing.currency,
    status: initialStatus,
    escrowAddress: escrowAddress,
    releaseTime: releaseTime,
    isMultiSig,
    multiSigSignatures,
    isTimeLocked,
    unlockTime,
    autoResolveAfterDays: options?.autoResolveAfterDays,
    disputeResolutionMode: options?.disputeResolutionMode
  });
  
  logger.info(`Escrow created: ${escrow.id} for listing: ${listingId} with enhanced features`);
  
  let notificationMessage = `You have created an escrow for ${listing.title} of ${escrow.amount} ${escrow.currency}`;
  
  if (isMultiSig) {
    notificationMessage += `. This is a multi-signature escrow that requires signatures from all parties.`;
  }
  
  if (isTimeLocked) {
    notificationMessage += `. This is a time-locked escrow that will unlock on ${unlockTime?.toLocaleDateString()}.`;
  }
  
  await notificationsService.createEscrowNotification(
    buyerId,
    notificationMessage
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

export const fundEscrow = async (
  id: string,
  transactionHash: string
): Promise<Escrow | null> => {
  const escrow = await escrowsRepository.findById(id);
  if (!escrow) {
    throw new NotFoundError('Escrow not found');
  }

  if (escrow.status !== 'created' as EscrowStatus && escrow.status !== 'awaiting_signatures' as EscrowStatus) {
    throw new BadRequestError(`Escrow in ${escrow.status} state cannot be funded`);
  }
  
  try {
    const transferResult = await circleService.transferToEscrow(
      escrow.buyerId,
      escrow.amount,
      escrow.id,
      escrow.listingId || ''
    );
    
    const updatedEscrow = await escrowsRepository.updateStatus(
      id,
      'funded' as EscrowStatus,
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
      escrow.buyerId,
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
  
  if (escrow.status !== 'funded' as EscrowStatus) {
    throw new BadRequestError(`Escrow must be in funded state to release, current state: ${escrow.status}`);
  }
  
  try {
    const releaseResult = await circleService.releaseFromEscrow(
      escrow.id,
      escrow.amount,
      sellerId
    );
    
    const updatedEscrow = await escrowsRepository.updateStatus(
      id,
      'released' as EscrowStatus,
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
  
  if (escrow.status !== 'funded' as EscrowStatus) {
    throw new BadRequestError(`Escrow must be in funded state to refund, current state: ${escrow.status}`);
  }
  
  try {
    const refundResult = await circleService.refundFromEscrow(
      escrow.id,
      escrow.amount,
      escrow.buyerId
    );
    
    const updatedEscrow = await escrowsRepository.updateStatus(
      id,
      'refunded' as EscrowStatus,
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

export const signMultiSigEscrow = async (
  id: string, 
  signerType: 'buyer' | 'seller' | 'admin'
): Promise<Escrow | null> => {
  const escrow = await escrowsRepository.findById(id);
  if (!escrow) {
    throw new NotFoundError('Escrow not found');
  }

  const extendedEscrow = escrow as (Escrow & {
    isMultiSig?: boolean;
    multiSigSignatures?: MultiSigStatus;
  });
  
  if (!extendedEscrow.isMultiSig) {
    throw new BadRequestError('This is not a multi-signature escrow');
  }

  if (signerType === 'buyer' && escrow.buyerId !== extendedEscrow.buyerId) {
    throw new ForbiddenError('Only the buyer can sign as buyer');
  }
  
  if (signerType === 'seller' && escrow.sellerId !== extendedEscrow.sellerId) {
    throw new ForbiddenError('Only the seller can sign as seller');
  }
  
  if (signerType === 'admin') {
    const user = await usersRepository.findById(extendedEscrow.buyerId);
    if (!user || !user.isAdmin) {
      throw new ForbiddenError('Only admins can sign as admin');
    }
  }

  const signatureData: {
    buyerSigned?: boolean;
    sellerSigned?: boolean;
    adminSigned?: boolean;
  } = {};
  
  if (signerType === 'buyer') signatureData.buyerSigned = true;
  if (signerType === 'seller') signatureData.sellerSigned = true;
  if (signerType === 'admin') signatureData.adminSigned = true;

  const updatedEscrow = await escrowsRepository.updateMultiSigStatus(id, signatureData);
  
  if (!updatedEscrow) {
    throw new Error('Failed to update multi-signature status');
  }
  
  const isComplete = 
    updatedEscrow.status === 'awaiting_signatures' as EscrowStatus && 
    (updatedEscrow as any).multiSigSignatures && 
    (updatedEscrow as any).multiSigSignatures.completedSignatures >= (updatedEscrow as any).multiSigSignatures.requiredSignatures;

  if (isComplete) {
    await notificationsService.createEscrowNotification(
      updatedEscrow.buyerId,
      'Your escrow has been funded with all required signatures',
      {
        escrowId: updatedEscrow.id,
        listingId: updatedEscrow.listingId || '',
        amount: updatedEscrow.amount,
        currency: updatedEscrow.currency
      }
    );
  } else {
    const otherPartyId = signerType === 'buyer' ? updatedEscrow.sellerId : updatedEscrow.buyerId;
    
    await notificationsService.createEscrowNotification(
      otherPartyId,
      `The ${signerType} has signed the multi-signature escrow. ${
        (updatedEscrow as any).multiSigSignatures?.completedSignatures || 0
      } of ${
        (updatedEscrow as any).multiSigSignatures?.requiredSignatures || 2
      } required signatures collected.`
    );
  }
  
  if (updatedEscrow.status === 'created' as EscrowStatus) {
    await escrowsRepository.updateStatus(id, 'awaiting_signatures' as EscrowStatus);
  }

  const updatedEscrowWithSignatures = await escrowsRepository.findById(id);
  if (!updatedEscrowWithSignatures) {
    throw new NotFoundError('Escrow not found after updating');
  }

  const extendedUpdatedEscrow = updatedEscrowWithSignatures as (Escrow & {
    multiSigSignatures?: MultiSigStatus;
  });

  const completedSignatures = 
    (extendedUpdatedEscrow.multiSigSignatures?.completedSignatures || 0);
  const requiredSignatures = 
    (extendedUpdatedEscrow.multiSigSignatures?.requiredSignatures || 2);
  
  return updatedEscrowWithSignatures;
};

export const createTimeLockedEscrow = async (
  id: string,
  userId: string,
  unlockTimeInDays: number
): Promise<Escrow> => {
  if (unlockTimeInDays <= 0) {
    throw new BadRequestError('Unlock time must be a positive number of days');
  }
  
  const escrow = await escrowsRepository.findById(id);
  
  if (!escrow) {
    throw new NotFoundError('Escrow not found');
  }
  
  if (escrow.status !== 'created' as EscrowStatus && escrow.status !== 'funded' as EscrowStatus) {
    throw new BadRequestError(`Cannot set time lock for escrow in ${escrow.status} state`);
  }
  
  const unlockTime = new Date();
  unlockTime.setDate(unlockTime.getDate() + unlockTimeInDays);
  
  const updatedEscrow = await escrowsRepository.updateTimeLockedEscrow(id, unlockTime);
  
  if (!updatedEscrow) {
    throw new Error('Failed to update time-locked escrow');
  }
  
  await notificationsService.createEscrowNotification(
    escrow.buyerId,
    `Your escrow has been time-locked until ${unlockTime.toLocaleDateString()}.`
  );
  
  await notificationsService.createEscrowNotification(
    escrow.sellerId,
    `The escrow has been time-locked until ${unlockTime.toLocaleDateString()}.`
  );
  
  return updatedEscrow;
};

export const setDisputeResolutionMode = async (
  id: string,
  userId: string,
  mode: DisputeResolutionMode,
  autoResolveAfterDays?: number
): Promise<Escrow> => {
  const escrow = await escrowsRepository.findById(id);
  
  if (!escrow) {
    throw new NotFoundError('Escrow not found');
  }
  
  if (escrow.buyerId !== userId && escrow.sellerId !== userId) {
    const user = await usersRepository.findById(userId);
    if (!user || !user.isAdmin) {
      throw new ForbiddenError('You do not have permission to modify this escrow');
    }
  }
  
  if (mode === DisputeResolutionMode.AUTO_REPUTATION) {
    const buyerRep = await reputationService.recalculateReputationScore(escrow.buyerId);
    const sellerRep = await reputationService.recalculateReputationScore(escrow.sellerId);
    
    if (buyerRep < 3.0 || sellerRep < 3.0) {
      throw new BadRequestError('Reputation-based auto-resolution requires both parties to have a minimum reputation score of 3.0');
    }
  }
  
  if (mode !== DisputeResolutionMode.MANUAL && !autoResolveAfterDays) {
    autoResolveAfterDays = 7;
  }
  
  const updatedEscrow = await escrowsRepository.updateDisputeResolutionMode(
    id,
    mode,
    autoResolveAfterDays
  );
  
  if (!updatedEscrow) {
    throw new Error('Failed to update dispute resolution mode');
  }
  
  const modeDescription = {
    [DisputeResolutionMode.MANUAL]: 'manual resolution by administrator',
    [DisputeResolutionMode.AUTO_BUYER]: 'automatic resolution in favor of the buyer',
    [DisputeResolutionMode.AUTO_SELLER]: 'automatic resolution in favor of the seller',
    [DisputeResolutionMode.AUTO_SPLIT]: 'automatic resolution with a 50/50 split',
    [DisputeResolutionMode.AUTO_REPUTATION]: 'automatic resolution based on reputation scores'
  };
  
  await notificationsService.createEscrowNotification(
    escrow.buyerId,
    `The dispute resolution mode for this escrow has been set to ${modeDescription[mode]}${
      autoResolveAfterDays ? ` after ${autoResolveAfterDays} days` : ''
    }.`
  );
  
  await notificationsService.createEscrowNotification(
    escrow.sellerId,
    `The dispute resolution mode for this escrow has been set to ${modeDescription[mode]}${
      autoResolveAfterDays ? ` after ${autoResolveAfterDays} days` : ''
    }.`
  );
  
  return updatedEscrow;
};

export const processTimeLockedEscrows = async (): Promise<void> => {
  const escrowsToRelease = await escrowsRepository.findEscrowsEligibleForAutoRelease();
  
  for (const escrow of escrowsToRelease) {
    try {
      logger.info(`Processing time-locked escrow ${escrow.id} for auto-release`);

      await releaseEscrow(escrow.id, escrow.sellerId);
      
      logger.info(`Successfully released time-locked escrow ${escrow.id}`);
    } catch (error) {
      logger.error(`Error releasing time-locked escrow ${escrow.id}:`, error);
    }
  }
};

export const processAutoDisputeResolution = async (): Promise<void> => {
  const escrowsToResolve = await escrowsRepository.findEscrowsEligibleForAutoResolve();
  
  for (const escrow of escrowsToResolve) {
    try {
      logger.info(`Processing auto-resolution for disputed escrow ${escrow.id} with mode ${(escrow as any).disputeResolutionMode}`);
      
      switch ((escrow as any).disputeResolutionMode) {
        case DisputeResolutionMode.AUTO_BUYER:
          await refundEscrow(escrow.id, escrow.sellerId);
          break;
          
        case DisputeResolutionMode.AUTO_SELLER:
          await releaseEscrow(escrow.id, escrow.sellerId);
          break;
          
        case DisputeResolutionMode.AUTO_SPLIT:
          await processSplitResolution(escrow);
          break;
          
        case DisputeResolutionMode.AUTO_REPUTATION:
          await processReputationBasedResolution(escrow);
          break;
      }
      
      await escrowsRepository.updateStatus(escrow.id, 'auto_resolved' as EscrowStatus);
      
      logger.info(`Successfully auto-resolved disputed escrow ${escrow.id}`);
    } catch (error) {
      logger.error(`Error auto-resolving disputed escrow ${escrow.id}:`, error);
    }
  }
};

const processSplitResolution = async (escrow: Escrow): Promise<void> => {
  const halfAmount = Math.round(escrow.amount * 50) / 100;
  
  try {
    await circleService.releasePartialFromEscrow(
      escrow.id,
      halfAmount,
      escrow.sellerId
    );
    
    await circleService.refundPartialFromEscrow(
      escrow.id,
      escrow.amount - halfAmount,
      escrow.buyerId
    );
    
    await notificationsService.createEscrowNotification(
      escrow.buyerId,
      `Your dispute has been automatically resolved with a 50/50 split. You received ${escrow.amount - halfAmount} ${escrow.currency}.`
    );
    
    await notificationsService.createEscrowNotification(
      escrow.sellerId,
      `Your dispute has been automatically resolved with a 50/50 split. You received ${halfAmount} ${escrow.currency}.`
    );
  } catch (error) {
    logger.error(`Error processing split resolution for escrow ${escrow.id}:`, error);
    throw error;
  }
};

const processReputationBasedResolution = async (escrow: Escrow): Promise<void> => {
  const buyerScore = await reputationService.recalculateReputationScore(escrow.buyerId);
  const sellerScore = await reputationService.recalculateReputationScore(escrow.sellerId);
  
  if (Math.abs(buyerScore - sellerScore) < 1.0) {
    await processSplitResolution(escrow);
  } else if (buyerScore > sellerScore) {
    await refundEscrow(escrow.id, escrow.sellerId);
    
    await notificationsService.createEscrowNotification(
      escrow.buyerId,
      `Based on reputation scores (Buyer: ${buyerScore.toFixed(1)}, Seller: ${sellerScore.toFixed(1)}), the dispute has been resolved in your favor.`
    );
    
    await notificationsService.createEscrowNotification(
      escrow.sellerId,
      `Based on reputation scores (Buyer: ${buyerScore.toFixed(1)}, Seller: ${sellerScore.toFixed(1)}), the dispute has been resolved in favor of the buyer.`
    );
  } else {
    await releaseEscrow(escrow.id, escrow.sellerId);
    
    await notificationsService.createEscrowNotification(
      escrow.buyerId,
      `Based on reputation scores (Buyer: ${buyerScore.toFixed(1)}, Seller: ${sellerScore.toFixed(1)}), the dispute has been resolved in favor of the seller.`
    );
    
    await notificationsService.createEscrowNotification(
      escrow.sellerId,
      `Based on reputation scores (Buyer: ${buyerScore.toFixed(1)}, Seller: ${sellerScore.toFixed(1)}), the dispute has been resolved in your favor.`
    );
  }
};

export const resolveByReputation = async (escrow: Escrow): Promise<void> => {
  const buyerScore = await reputationService.recalculateReputationScore(escrow.buyerId);
  const sellerScore = await reputationService.recalculateReputationScore(escrow.sellerId);

  if (Math.abs(buyerScore - sellerScore) < 1.0) {
    await processSplitResolution(escrow);
  } else if (buyerScore > sellerScore) {
    await refundEscrow(escrow.id, escrow.sellerId);
    
    await notificationsService.createEscrowNotification(
      escrow.buyerId,
      `Based on reputation scores (Buyer: ${buyerScore.toFixed(1)}, Seller: ${sellerScore.toFixed(1)}), the dispute has been resolved in your favor.`
    );
    
    await notificationsService.createEscrowNotification(
      escrow.sellerId,
      `Based on reputation scores (Buyer: ${buyerScore.toFixed(1)}, Seller: ${sellerScore.toFixed(1)}), the dispute has been resolved in favor of the buyer.`
    );
  } else {
    await releaseEscrow(escrow.id, escrow.sellerId);
    
    await notificationsService.createEscrowNotification(
      escrow.buyerId,
      `Based on reputation scores (Buyer: ${buyerScore.toFixed(1)}, Seller: ${sellerScore.toFixed(1)}), the dispute has been resolved in favor of the seller.`
    );
    
    await notificationsService.createEscrowNotification(
      escrow.sellerId,
      `Based on reputation scores (Buyer: ${buyerScore.toFixed(1)}, Seller: ${sellerScore.toFixed(1)}), the dispute has been resolved in your favor.`
    );
  }
};