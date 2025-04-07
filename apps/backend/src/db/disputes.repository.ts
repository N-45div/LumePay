import { v4 as uuidv4 } from 'uuid';
import { query } from './index';
import { Dispute, DisputeStatus } from '../types';

export async function create(
  escrowId: string,
  initiatorId: string,
  reason: string
): Promise<Dispute> {
  const dispute: Dispute = {
    id: uuidv4(),
    escrowId,
    initiatorId,
    reason,
    status: DisputeStatus.OPEN,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const result = await query(
    `INSERT INTO disputes (id, escrow_id, initiator_id, reason, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      dispute.id,
      dispute.escrowId,
      dispute.initiatorId,
      dispute.reason,
      dispute.status,
      dispute.createdAt,
      dispute.updatedAt
    ]
  );

  return mapRowToDispute(result.rows[0]);
}

export async function findById(id: string): Promise<Dispute | null> {
  const result = await query(
    `SELECT * FROM disputes WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToDispute(result.rows[0]);
}

export async function findByEscrowId(escrowId: string): Promise<Dispute | null> {
  const result = await query(
    `SELECT * FROM disputes WHERE escrow_id = $1`,
    [escrowId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToDispute(result.rows[0]);
}

export async function findByUser(userId: string): Promise<Dispute[]> {
  const result = await query(
    `SELECT d.* FROM disputes d
     JOIN escrows e ON d.escrow_id = e.id
     WHERE e.buyer_id = $1 OR e.seller_id = $1
     ORDER BY d.created_at DESC`,
    [userId]
  );

  return result.rows.map(mapRowToDispute);
}

export async function updateStatus(
  id: string,
  status: DisputeStatus,
  resolution?: string
): Promise<Dispute | null> {
  let queryText = `
    UPDATE disputes 
    SET status = $1, updated_at = $2`;
  
  const params: any[] = [status, new Date()];
  
  if (resolution) {
    queryText += `, resolution = $3`;
    params.push(resolution);
    
    if ([DisputeStatus.RESOLVED_BUYER, DisputeStatus.RESOLVED_SELLER, DisputeStatus.RESOLVED_SPLIT].includes(status)) {
      queryText += `, resolved_at = $4`;
      params.push(new Date());
    }
  }
  
  queryText += ` WHERE id = $${params.length + 1} RETURNING *`;
  params.push(id);
  
  const result = await query(queryText, params);
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return mapRowToDispute(result.rows[0]);
}

export async function findAll(
  limit: number = 10,
  offset: number = 0,
  status?: DisputeStatus
): Promise<{ disputes: Dispute[], total: number }> {
  let queryText = `SELECT * FROM disputes`;
  const countQuery = `SELECT COUNT(*) FROM disputes`;
  const params: any[] = [];
  
  if (status) {
    queryText += ` WHERE status = $1`;
    params.push(status);
  }
  
  queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  
  const [result, countResult] = await Promise.all([
    query(queryText, params),
    query(countQuery)
  ]);
  
  return {
    disputes: result.rows.map(mapRowToDispute),
    total: parseInt(countResult.rows[0].count, 10)
  };
}

function mapRowToDispute(row: any): Dispute {
  return {
    id: row.id,
    escrowId: row.escrow_id,
    initiatorId: row.initiator_id,
    reason: row.reason,
    status: row.status as DisputeStatus,
    resolution: row.resolution || undefined,
    resolvedAt: row.resolved_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
