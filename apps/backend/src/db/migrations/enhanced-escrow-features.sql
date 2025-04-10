-- Add enhanced escrow features

-- Add multi-signature support
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS is_multi_sig BOOLEAN DEFAULT FALSE;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS multi_sig_signatures JSONB;

-- Add time-locked escrow support
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS is_time_locked BOOLEAN DEFAULT FALSE;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS unlock_time TIMESTAMP WITH TIME ZONE;

-- Add automated dispute resolution
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS auto_resolve_after_days INTEGER;
ALTER TABLE escrows ADD COLUMN IF NOT EXISTS dispute_resolution_mode VARCHAR(50);

-- Add index for finding time-locked escrows efficiently
CREATE INDEX IF NOT EXISTS idx_escrows_time_locked ON escrows(is_time_locked, unlock_time) 
WHERE is_time_locked = TRUE;

-- Add index for finding escrows with auto-resolution
CREATE INDEX IF NOT EXISTS idx_escrows_auto_resolve ON escrows(status, dispute_resolution_mode, auto_resolve_after_days) 
WHERE status = 'disputed' AND dispute_resolution_mode IS NOT NULL;

COMMENT ON COLUMN escrows.is_multi_sig IS 'Whether this escrow requires multiple signatures';
COMMENT ON COLUMN escrows.multi_sig_signatures IS 'JSON containing signature status from different parties';
COMMENT ON COLUMN escrows.is_time_locked IS 'Whether this escrow is time-locked';
COMMENT ON COLUMN escrows.unlock_time IS 'When the time-locked escrow can be released';
COMMENT ON COLUMN escrows.auto_resolve_after_days IS 'Number of days after which a dispute is automatically resolved';
COMMENT ON COLUMN escrows.dispute_resolution_mode IS 'Mode of automated dispute resolution';
