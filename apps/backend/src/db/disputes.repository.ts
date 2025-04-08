import { v4 as uuidv4 } from 'uuid';
import { query } from './index';
import { Dispute, DisputeStatus } from '../types';
import { NotFoundError } from '../utils/errors';

export async function create(
  escrowId: string,
  initiatorId: string,
  reason: string,
  details?: string
): Promise<Dispute> {
  const escrowResult = await query('SELECT * FROM escrows WHERE id = $1', [escrowId]);
  if (escrowResult.rows.length === 0) {
    throw new Error(`Escrow with id ${escrowId} not found`);
  }

  let respondentId = '';
  if (initiatorId === escrowResult.rows[0].buyer_id) {
    respondentId = escrowResult.rows[0].seller_id || '';
  } else {
    respondentId = escrowResult.rows[0].buyer_id || '';
  }
  
  if (typeof respondentId !== 'string') {
    respondentId = '';
  }

  const id = uuidv4();
  const now = new Date();
  
  const dispute: Dispute = {
    id,
    escrowId,
    initiatorId,
    respondentId,
    reason,
    details: details || undefined,
    status: DisputeStatus.OPEN,
    createdAt: now,
    updatedAt: now
  };

  const result = await query(
    `INSERT INTO disputes (id, escrow_id, initiator_id, respondent_id, reason, details, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      dispute.id,
      dispute.escrowId,
      dispute.initiatorId,
      dispute.respondentId,
      dispute.reason,
      dispute.details,
      dispute.status,
      dispute.createdAt,
      dispute.updatedAt
    ]
  );

  return mapRowToDispute(result.rows[0]);
}

export async function findById(id: string): Promise<Dispute | null> {
  const result = await query('SELECT * FROM disputes WHERE id = $1', [id]);
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return mapRowToDispute(result.rows[0]);
}

export async function findByEscrowId(escrowId: string): Promise<Dispute | null> {
  const result = await query('SELECT * FROM disputes WHERE escrow_id = $1', [escrowId]);
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return mapRowToDispute(result.rows[0]);
}

export async function updateStatus(id: string, status: DisputeStatus): Promise<Dispute> {
  const now = new Date();
  
  const result = await query(
    `UPDATE disputes 
     SET status = $1, updated_at = $2
     WHERE id = $3
     RETURNING *`,
    [status, now, id]
  );
  
  if (result.rows.length === 0) {
    throw new NotFoundError(`Dispute with id ${id} not found`);
  }
  
  return mapRowToDispute(result.rows[0]);
}

export async function resolveDispute(id: string, resolution: string, status: DisputeStatus): Promise<Dispute> {
  const now = new Date();
  
  const resolutionStatuses = ['resolved_buyer', 'resolved_seller', 'resolved_split'];
  
  if (resolutionStatuses.includes(status)) {
    const result = await query(
      `UPDATE disputes 
       SET status = $1, resolution = $2, resolved_at = $3, updated_at = $4
       WHERE id = $5
       RETURNING *`,
      [status, resolution, now, now, id]
    );
    
    if (result.rows.length === 0) {
      throw new NotFoundError(`Dispute with id ${id} not found`);
    }
    
    return mapRowToDispute(result.rows[0]);
  } else {
    throw new Error('Invalid status for resolution');
  }
}

export async function findAll(
  limit: number = 10,
  offset: number = 0,
  status?: DisputeStatus
): Promise<{ disputes: Dispute[]; total: number }> {
  let queryText = 'SELECT * FROM disputes';
  const queryParams: any[] = [];
  
  if (status) {
    queryText += ' WHERE status = $1';
    queryParams.push(status);
  }
  
  queryText += ' ORDER BY created_at DESC LIMIT $' + (queryParams.length + 1) + ' OFFSET $' + (queryParams.length + 2);
  queryParams.push(limit, offset);
  
  const disputes = await query(queryText, queryParams);
  const countResult = await query(
    'SELECT COUNT(*) as total FROM disputes' + (status ? ' WHERE status = $1' : ''),
    status ? [status] : []
  );
  
  return { 
    disputes: disputes.rows.map(mapRowToDispute),
    total: parseInt(countResult.rows[0].total)
  };
}

function mapRowToDispute(row: any): Dispute {
  return {
    id: row.id,
    escrowId: row.escrow_id,
    initiatorId: row.initiator_id,
    respondentId: row.respondent_id || '', 
    reason: row.reason,
    details: row.details,
    status: row.status as DisputeStatus,
    resolution: row.resolution,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  } as Dispute;
}
