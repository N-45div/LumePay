-- Add verification level enum type
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_level') THEN
    CREATE TYPE verification_level AS ENUM ('none', 'basic', 'verified', 'trusted');
  END IF;
END $$;

-- Add reputation verification fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS trust_score DECIMAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS verification_level verification_level DEFAULT 'none',
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;

-- Create reputation records table for on-chain records
CREATE TABLE IF NOT EXISTS reputation_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score DECIMAL NOT NULL,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  dispute_resolution_ratio DECIMAL NOT NULL DEFAULT 1.0,
  verification_level verification_level NOT NULL DEFAULT 'none',
  blockchain_address VARCHAR(255),
  transaction_signature VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indices for performance
CREATE INDEX IF NOT EXISTS idx_reputation_records_user_id ON reputation_records(user_id);
CREATE INDEX IF NOT EXISTS idx_users_verification_level ON users(verification_level);
CREATE INDEX IF NOT EXISTS idx_users_trust_score ON users(trust_score);
