import { query } from './index';
import { Escrow, EscrowStatus, DisputeResolutionMode, MultiSigStatus } from '../types';

type CreateEscrowData = Omit<Escrow, 'id' | 'createdAt' | 'updatedAt'> & {
  isMultiSig?: boolean;
  multiSigSignatures?: MultiSigStatus;
  isTimeLocked?: boolean;
  unlockTime?: Date;
  autoResolveAfterDays?: number;
  disputeResolutionMode?: DisputeResolutionMode;
};

export const create = async (escrowData: CreateEscrowData): Promise<Escrow> => {
  const { 
    listingId, 
    buyerId, 
    sellerId, 
    amount, 
    currency, 
    status, 
    escrowAddress, 
    releaseTime, 
    transactionSignature,
    isMultiSig,
    multiSigSignatures,
    isTimeLocked,
    unlockTime,
    autoResolveAfterDays,
    disputeResolutionMode
  } = escrowData;
  
  const result = await query(
    `INSERT INTO escrows 
     (listing_id, buyer_id, seller_id, amount, currency, status, escrow_address, release_time, 
      transaction_signature, is_multi_sig, multi_sig_signatures, is_time_locked, unlock_time, 
      auto_resolve_after_days, dispute_resolution_mode) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) 
     RETURNING *`,
    [
      listingId, 
      buyerId, 
      sellerId, 
      amount, 
      currency, 
      status, 
      escrowAddress, 
      releaseTime, 
      transactionSignature,
      isMultiSig || false,
      multiSigSignatures ? JSON.stringify(multiSigSignatures) : null,
      isTimeLocked || false,
      unlockTime,
      autoResolveAfterDays,
      disputeResolutionMode
    ]
  );

  const escrow = result.rows[0];
  return mapDbEscrowToEscrow(escrow);
};

export const findById = async (id: string): Promise<Escrow | null> => {
  const result = await query('SELECT * FROM escrows WHERE id = $1', [id]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapDbEscrowToEscrow(result.rows[0]);
};

export const findByAddress = async (escrowAddress: string): Promise<Escrow | null> => {
  const result = await query('SELECT * FROM escrows WHERE escrow_address = $1', [escrowAddress]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapDbEscrowToEscrow(result.rows[0]);
};

export const findByUserId = async (
  userId: string,
  options: { role?: 'buyer' | 'seller'; status?: EscrowStatus; limit?: number; offset?: number } = {}
): Promise<{ escrows: Escrow[]; total: number }> => {
  const { role, status, limit = 20, offset = 0 } = options;
  
  let whereClause = '';
  const params: any[] = [userId, limit, offset];
  let paramIndex = 4;
  
  if (role === 'buyer') {
    whereClause = 'WHERE buyer_id = $1';
  } else if (role === 'seller') {
    whereClause = 'WHERE seller_id = $1';
  } else {
    whereClause = 'WHERE buyer_id = $1 OR seller_id = $1';
  }
  
  if (status) {
    whereClause += ` AND status = $${paramIndex++}`;
    params.push(status);
  }
  
  const escrowsQuery = `
    SELECT * FROM escrows 
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `;
  
  const countQuery = `
    SELECT COUNT(*) FROM escrows ${whereClause}
  `;
  
  const [escrowsResult, countResult] = await Promise.all([
    query(escrowsQuery, params),
    query(countQuery, [userId, ...(status ? [status] : [])])
  ]);
  
  const escrows = escrowsResult.rows.map(escrow => mapDbEscrowToEscrow(escrow));
  
  return {
    escrows,
    total: parseInt(countResult.rows[0].count, 10)
  };
};

export const updateStatus = async (
  id: string,
  status: EscrowStatus,
  transactionSignature?: string
): Promise<Escrow | null> => {
  const result = await query(
    `UPDATE escrows 
     SET status = $2, 
         transaction_signature = COALESCE($3, transaction_signature),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, status, transactionSignature]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return mapDbEscrowToEscrow(result.rows[0]);
};

export const updateMultiSigStatus = async (
  id: string,
  multiSigData: {
    buyerSigned?: boolean,
    sellerSigned?: boolean,
    adminSigned?: boolean
  }
): Promise<Escrow | null> => {
  // First get the current state
  const current = await findById(id);
  if (!current) {
    return null;
  }

  const extendedEscrow = current as (Escrow & {
    isMultiSig?: boolean;
    multiSigSignatures?: MultiSigStatus;
    isTimeLocked?: boolean;
    unlockTime?: Date;
    autoResolveAfterDays?: number;
    disputeResolutionMode?: DisputeResolutionMode;
  });

  const signatures = extendedEscrow.multiSigSignatures || {
    buyerSigned: false,
    sellerSigned: false,
    adminSigned: false,
    requiredSignatures: 2,
    completedSignatures: 0
  };

  if (multiSigData.buyerSigned !== undefined && !signatures.buyerSigned && multiSigData.buyerSigned) {
    signatures.buyerSigned = true;
    signatures.completedSignatures += 1;
  }
  
  if (multiSigData.sellerSigned !== undefined && !signatures.sellerSigned && multiSigData.sellerSigned) {
    signatures.sellerSigned = true;
    signatures.completedSignatures += 1;
  }
  
  if (multiSigData.adminSigned !== undefined && !signatures.adminSigned && multiSigData.adminSigned) {
    signatures.adminSigned = true;
    signatures.completedSignatures += 1;
  }

  let newStatus = current.status;
  if (signatures.completedSignatures >= signatures.requiredSignatures) {
    if (current.status === 'awaiting_signatures' as EscrowStatus) {
      newStatus = 'funded' as EscrowStatus;
    }
  }
  
  const result = await query(
    `UPDATE escrows 
     SET multi_sig_signatures = $2,
         status = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, JSON.stringify(signatures), newStatus]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return mapDbEscrowToEscrow(result.rows[0]);
};

export const updateTimeLockedEscrow = async (
  id: string,
  unlockTime: Date
): Promise<Escrow | null> => {
  const result = await query(
    `UPDATE escrows 
     SET is_time_locked = TRUE,
         unlock_time = $2,
         status = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, unlockTime, 'time_locked' as EscrowStatus]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return mapDbEscrowToEscrow(result.rows[0]);
};

export const updateDisputeResolutionMode = async (
  id: string,
  disputeResolutionMode: DisputeResolutionMode,
  autoResolveAfterDays?: number
): Promise<Escrow | null> => {
  const result = await query(
    `UPDATE escrows 
     SET dispute_resolution_mode = $2,
         auto_resolve_after_days = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, disputeResolutionMode, autoResolveAfterDays]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return mapDbEscrowToEscrow(result.rows[0]);
};

/**
 * Get total count of all escrows
 */
export const getTotalCount = async (): Promise<number> => {
  const result = await query(`SELECT COUNT(*) FROM escrows`);
  return parseInt(result.rows[0].count, 10);
};

/**
 * Get count of escrows with a specific status
 */
export const getCountByStatus = async (status: EscrowStatus): Promise<number> => {
  const result = await query(
    `SELECT COUNT(*) FROM escrows WHERE status = $1`,
    [status]
  );
  return parseInt(result.rows[0].count, 10);
};

/**
 * Get total transaction volume of escrows with a specific status
 */
export const getTotalVolumeByStatus = async (status: EscrowStatus): Promise<number> => {
  const result = await query(
    `SELECT SUM(amount::numeric) as total_volume 
     FROM escrows 
     WHERE status = $1`,
    [status]
  );
  
  if (!result.rows[0].total_volume) {
    return 0;
  }
  
  return parseFloat(result.rows[0].total_volume);
};

/**
 * Get recent completed transactions (released escrows)
 */
export const getRecentCompletedTransactions = async (limit: number = 10, offset: number = 0): Promise<Escrow[]> => {
  const result = await query(
    `SELECT e.* 
     FROM escrows e
     WHERE e.status = $1
     ORDER BY e.updated_at DESC
     LIMIT $2 OFFSET $3`,
    ['released', limit, offset]
  );
  
  return result.rows.map(mapDbEscrowToEscrow);
};

/**
 * Get count of failed transactions (canceled or expired escrows)
 */
export const getFailedTransactionsCount = async (): Promise<number> => {
  const result = await query(
    `SELECT COUNT(*) 
     FROM escrows 
     WHERE status IN ($1, $2)`,
    ['canceled', 'expired']
  );
  
  return parseInt(result.rows[0].count, 10);
};

export async function findExpiredEscrows(): Promise<Escrow[]> {
  const now = new Date();
  
  const result = await query(
    `SELECT * FROM escrows
     WHERE status = $1
     AND release_time IS NOT NULL
     AND release_time < $2`,
    ['created', now]
  );
  
  return result.rows.map(mapDbEscrowToEscrow);
}

export async function expireEscrow(id: string): Promise<Escrow> {
  const now = new Date();
  
  const result = await query(
    `UPDATE escrows
     SET status = $1, updated_at = $2
     WHERE id = $3
     RETURNING *`,
    ['expired', now, id]
  );
  
  if (result.rows.length === 0) {
    throw new Error(`Escrow with id ${id} not found`);
  }
  
  return mapDbEscrowToEscrow(result.rows[0]);
}

export async function cancelEscrow(id: string): Promise<Escrow> {
  const now = new Date();
  
  const result = await query(
    `UPDATE escrows
     SET status = $1, updated_at = $2
     WHERE id = $3
     RETURNING *`,
    ['canceled', now, id]
  );
  
  if (result.rows.length === 0) {
    throw new Error(`Escrow with id ${id} not found`);
  }
  
  return mapDbEscrowToEscrow(result.rows[0]);
}

export async function getInactiveEscrows(userId: string): Promise<Escrow[]> {
  const result = await query(
    `SELECT * FROM escrows
     WHERE (buyer_id = $1 OR seller_id = $1)
     AND status IN ($2, $3)
     ORDER BY updated_at DESC`,
    [userId, 'canceled', 'expired']
  );
  
  return result.rows.map(mapDbEscrowToEscrow);
}

export const findEscrowsEligibleForAutoRelease = async (): Promise<Escrow[]> => {
  const now = new Date();
  
  // Find time-locked escrows that have reached their unlock time
  const result = await query(
    `SELECT * FROM escrows
     WHERE status = $1
     AND is_time_locked = TRUE
     AND unlock_time IS NOT NULL
     AND unlock_time <= $2`,
    ['time_locked' as EscrowStatus, now]
  );
  
  return result.rows.map(mapDbEscrowToEscrow);
};

export const findEscrowsEligibleForAutoResolve = async (): Promise<Escrow[]> => {
  const now = new Date();
  const result = await query(
    `SELECT * FROM escrows
     WHERE status = $1
     AND dispute_resolution_mode IS NOT NULL
     AND dispute_resolution_mode != $2
     AND auto_resolve_after_days IS NOT NULL
     AND updated_at <= $3 - (auto_resolve_after_days * INTERVAL '1 day')`,
    ['disputed' as EscrowStatus, DisputeResolutionMode.MANUAL, now]
  );
  
  return result.rows.map(mapDbEscrowToEscrow);
};

const mapDbEscrowToEscrow = (escrow: any): Escrow & {
  isMultiSig?: boolean;
  multiSigSignatures?: MultiSigStatus;
  isTimeLocked?: boolean;
  unlockTime?: Date;
  autoResolveAfterDays?: number;
  disputeResolutionMode?: DisputeResolutionMode;
} => {
  const result: Escrow & {
    isMultiSig?: boolean;
    multiSigSignatures?: MultiSigStatus;
    isTimeLocked?: boolean;
    unlockTime?: Date;
    autoResolveAfterDays?: number;
    disputeResolutionMode?: DisputeResolutionMode;
  } = {
    id: escrow.id,
    listingId: escrow.listing_id,
    buyerId: escrow.buyer_id,
    sellerId: escrow.seller_id,
    amount: parseFloat(escrow.amount),
    currency: escrow.currency,
    status: escrow.status as EscrowStatus,
    escrowAddress: escrow.escrow_address,
    releaseTime: escrow.release_time,
    transactionSignature: escrow.transaction_signature,
    createdAt: escrow.created_at,
    updatedAt: escrow.updated_at,
    isMultiSig: escrow.is_multi_sig,
    multiSigSignatures: escrow.multi_sig_signatures ? JSON.parse(escrow.multi_sig_signatures) : undefined,
    isTimeLocked: escrow.is_time_locked,
    unlockTime: escrow.unlock_time,
    autoResolveAfterDays: escrow.auto_resolve_after_days,
    disputeResolutionMode: escrow.dispute_resolution_mode
  };

  return result;
};
