import * as disputesRepository from '../db/disputes.repository';
import * as escrowsRepository from '../db/escrows.repository';
import * as notificationsService from './notifications.service';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../utils/errors';
import { Dispute, DisputeStatus, EscrowStatus } from '../types';

export async function createDispute(
  escrowId: string,
  userId: string,
  reason: string
): Promise<Dispute> {
  const escrow = await escrowsRepository.findById(escrowId);
  
  if (!escrow) {
    throw new NotFoundError('Escrow not found');
  }
  
  if (escrow.buyerId !== userId && escrow.sellerId !== userId) {
    throw new UnauthorizedError('Only buyer or seller can create a dispute');
  }
  
  if (escrow.status !== EscrowStatus.FUNDED) {
    throw new BadRequestError(`Cannot dispute escrow with status ${escrow.status}. Escrow must be funded.`);
  }
  
  const existingDispute = await disputesRepository.findByEscrowId(escrowId);
  if (existingDispute) {
    throw new BadRequestError('A dispute already exists for this escrow');
  }
  
  await escrowsRepository.updateStatus(escrowId, EscrowStatus.DISPUTED);
  
  const dispute = await disputesRepository.create(escrowId, userId, reason);
  
  const otherUserId = userId === escrow.buyerId ? escrow.sellerId : escrow.buyerId;
  
  await notificationsService.createDisputeNotification(
    userId,
    `You opened a dispute for escrow ${escrowId.substring(0, 8)}`
  );
  
  await notificationsService.createDisputeNotification(
    otherUserId,
    `A dispute was opened for escrow ${escrowId.substring(0, 8)}`
  );
  
  return dispute;
}

export async function getDisputeById(id: string, userId: string): Promise<Dispute> {
  const dispute = await disputesRepository.findById(id);
  
  if (!dispute) {
    throw new NotFoundError('Dispute not found');
  }
  
  const escrow = await escrowsRepository.findById(dispute.escrowId);
  
  if (!escrow) {
    throw new NotFoundError('Associated escrow not found');
  }
  
  if (escrow.buyerId !== userId && escrow.sellerId !== userId) {
    throw new UnauthorizedError('You are not authorized to view this dispute');
  }
  
  return dispute;
}

export async function getUserDisputes(userId: string): Promise<Dispute[]> {
  return disputesRepository.findByUser(userId);
}

export async function resolveDispute(
  id: string,
  adminId: string,
  resolution: string,
  outcome: DisputeStatus
): Promise<Dispute> {
  if (
    outcome !== DisputeStatus.RESOLVED_BUYER &&
    outcome !== DisputeStatus.RESOLVED_SELLER &&
    outcome !== DisputeStatus.RESOLVED_SPLIT
  ) {
    throw new BadRequestError('Invalid resolution outcome');
  }
  
  const dispute = await disputesRepository.findById(id);
  
  if (!dispute) {
    throw new NotFoundError('Dispute not found');
  }
  
  if (
    dispute.status === DisputeStatus.RESOLVED_BUYER ||
    dispute.status === DisputeStatus.RESOLVED_SELLER ||
    dispute.status === DisputeStatus.RESOLVED_SPLIT
  ) {
    throw new BadRequestError('Dispute is already resolved');
  }
  
  const escrow = await escrowsRepository.findById(dispute.escrowId);
  
  if (!escrow) {
    throw new NotFoundError('Associated escrow not found');
  }
  
  const updatedDispute = await disputesRepository.updateStatus(id, outcome, resolution);
  
  let escrowStatus: EscrowStatus;
  
  if (outcome === DisputeStatus.RESOLVED_BUYER) {
    escrowStatus = EscrowStatus.REFUNDED;
  } else if (outcome === DisputeStatus.RESOLVED_SELLER) {
    escrowStatus = EscrowStatus.RELEASED;
  } else {
    escrowStatus = EscrowStatus.REFUNDED; // For split resolution, implement custom logic
  }
  
  await escrowsRepository.updateStatus(dispute.escrowId, escrowStatus);
  
  await notificationsService.createDisputeNotification(
    escrow.buyerId,
    `Dispute for escrow ${escrow.id.substring(0, 8)} has been resolved: ${resolution}`
  );
  
  await notificationsService.createDisputeNotification(
    escrow.sellerId,
    `Dispute for escrow ${escrow.id.substring(0, 8)} has been resolved: ${resolution}`
  );
  
  return updatedDispute!;
}

export async function updateDisputeStatus(
  id: string,
  status: DisputeStatus,
  adminId: string
): Promise<Dispute> {
  const dispute = await disputesRepository.findById(id);
  
  if (!dispute) {
    throw new NotFoundError('Dispute not found');
  }
  
  if (status === dispute.status) {
    return dispute;
  }
  
  const updatedDispute = await disputesRepository.updateStatus(id, status);
  
  if (status === DisputeStatus.IN_REVIEW) {
    const escrow = await escrowsRepository.findById(dispute.escrowId);
    
    if (escrow) {
      await notificationsService.createDisputeNotification(
        escrow.buyerId,
        `Your dispute for escrow ${escrow.id.substring(0, 8)} is now under review`
      );
      
      await notificationsService.createDisputeNotification(
        escrow.sellerId,
        `Dispute for escrow ${escrow.id.substring(0, 8)} is now under review`
      );
    }
  }
  
  return updatedDispute!;
}

export async function getDisputes(
  limit: number = 10,
  offset: number = 0,
  status?: DisputeStatus
): Promise<{ disputes: Dispute[], total: number }> {
  return disputesRepository.findAll(limit, offset, status);
}
