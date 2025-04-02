-- Add failure tracking columns to scheduled_payments table

-- Add failure_count column with default value 0
ALTER TABLE scheduled_payments
ADD COLUMN IF NOT EXISTS "failureCount" integer NOT NULL DEFAULT 0;

-- Add last_failure_message column
ALTER TABLE scheduled_payments
ADD COLUMN IF NOT EXISTS "lastFailureMessage" varchar(255) NULL;

-- Add last_failure_date column
ALTER TABLE scheduled_payments
ADD COLUMN IF NOT EXISTS "lastFailureDate" timestamptz NULL;

-- Verify the columns exist
SELECT 
  column_name, 
  data_type, 
  is_nullable 
FROM 
  information_schema.columns 
WHERE 
  table_name = 'scheduled_payments' 
  AND table_schema = 'public'
  AND column_name IN ('failureCount', 'lastFailureMessage', 'lastFailureDate');
