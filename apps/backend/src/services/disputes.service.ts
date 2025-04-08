import * as disputesRepository from '../db/disputes.repository';
import * as escrowsRepository from '../db/escrows.repository';
import * as notificationsService from './notifications.service';
import { Dispute, DisputeStatus, Escrow, EscrowStatus } from '../types';
import { NotFoundError } from '../utils/errors';
import { EscrowService } from '../blockchain/escrow.service';

async function transferFunds(
  escrowId: string, 
  recipientId: string, 
  amount: number, 
  transferType: 'refund' | 'release' | 'split_buyer' | 'split_seller'
): Promise<void> {
  console.log(`Transferring ${amount} to ${recipientId} for escrow ${escrowId} as ${transferType}`);
  
  
  const escrowService = new EscrowService();
  
  if (transferType === 'refund' || transferType === 'split_buyer') {
    await escrowsRepository.updateStatus(escrowId, 'refunded' as EscrowStatus);
  } else if (transferType === 'release' || transferType === 'split_seller') {
    await escrowsRepository.updateStatus(escrowId, 'released' as EscrowStatus);
  }
}

export async function createDispute(
  escrowId: string,
  userId: string,
  reason: string,
  details?: string
): Promise<Dispute> {
  const escrow = await escrowsRepository.findById(escrowId);
  
  if (!escrow) {
    throw new NotFoundError(`Escrow with id ${escrowId} not found`);
  }
  
  if (escrow.buyerId !== userId && escrow.sellerId !== userId) {
    throw new Error('Only buyer or seller can create a dispute');
  }
  
  if (escrow.status !== EscrowStatus.FUNDED) {
    throw new Error(`Cannot create dispute for escrow in status ${escrow.status}`);
  }
  
  await escrowsRepository.updateStatus(escrowId, EscrowStatus.DISPUTED);
  
  const dispute = await disputesRepository.create(escrowId, userId, reason, details);
  
  const otherPartyId = userId === escrow.buyerId ? escrow.sellerId : escrow.buyerId;
  
  await notificationsService.createDisputeNotification(
    otherPartyId,
    `A dispute has been opened for escrow ${escrowId.substring(0, 8)}`
  );
  
  return dispute;
}

export async function getDisputeById(id: string): Promise<Dispute | null> {
  return disputesRepository.findById(id);
}

export async function getDisputeByEscrowId(escrowId: string): Promise<Dispute | null> {
  return disputesRepository.findByEscrowId(escrowId);
}

export async function getUserDisputes(userId: string): Promise<Dispute[]> {
  const userEscrowsResult = await escrowsRepository.findByUserId(userId);
  
  const disputePromises = userEscrowsResult.escrows.map((escrow: Escrow) => 
    disputesRepository.findByEscrowId(escrow.id)
  );
  const disputeResults = await Promise.all(disputePromises);
  
  return disputeResults.filter((dispute: Dispute | null): dispute is Dispute => 
    dispute !== null
  );
}

export async function resolveDispute(
  id: string,
  outcome: DisputeStatus,
  resolution: string
): Promise<Dispute> {
  const outcomeStr = outcome.toString();

  if (outcomeStr !== 'resolved_buyer' && 
      outcomeStr !== 'resolved_seller' && 
      outcomeStr !== 'resolved_split') {
    throw new Error('Invalid outcome. Must be resolved_buyer, resolved_seller, or resolved_split');
  }

  const dispute = await disputesRepository.findById(id);
  if (!dispute) {
    throw new NotFoundError(`Dispute with id ${id} not found`);
  }

  const escrow = await escrowsRepository.findById(dispute.escrowId);
  if (!escrow) {
    throw new NotFoundError(`Escrow with id ${dispute.escrowId} not found`);
  }
  
  if (escrow.status !== EscrowStatus.DISPUTED) {
    throw new Error(`Cannot resolve dispute for escrow in status ${escrow.status}`);
  }
 
  if (outcomeStr === 'resolved_split') {
    const halfAmount = Number(escrow.amount) / 2;
 
    await transferFunds(escrow.id, escrow.sellerId, halfAmount, 'split_seller');
    await transferFunds(escrow.id, escrow.buyerId, halfAmount, 'split_buyer');
  } else if (outcomeStr === 'resolved_buyer') {
    await transferFunds(escrow.id, escrow.buyerId, Number(escrow.amount), 'refund');
  } else {
    await transferFunds(escrow.id, escrow.sellerId, Number(escrow.amount), 'release');
  }
  
  const updatedDispute = await disputesRepository.resolveDispute(id, resolution, outcome);
  
  return updatedDispute;
}

export async function updateDisputeStatus(id: string, status: DisputeStatus): Promise<Dispute> {
  const statusStr = status.toString();

  if (statusStr !== 'open' && statusStr !== 'in_review' && statusStr !== 'closed') {
    throw new Error('Invalid status. Must be open, in_review, or closed');
  }

  if (statusStr === 'in_review') {
  }
  return await disputesRepository.updateStatus(id, status);
}

export async function getDisputes(
  limit: number = 10,
  offset: number = 0,
  status?: DisputeStatus
): Promise<{ disputes: Dispute[]; total: number }> {
  return disputesRepository.findAll(limit, offset, status);
}
