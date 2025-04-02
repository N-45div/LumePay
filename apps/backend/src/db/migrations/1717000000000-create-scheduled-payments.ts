// apps/backend/src/db/migrations/1717000000000-create-scheduled-payments.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateScheduledPayments1717000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create enum types first
        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'schedule_frequency') THEN
                    CREATE TYPE schedule_frequency AS ENUM (
                        'ONCE', 
                        'DAILY', 
                        'WEEKLY', 
                        'BIWEEKLY', 
                        'MONTHLY', 
                        'QUARTERLY', 
                        'YEARLY'
                    );
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'schedule_status') THEN
                    CREATE TYPE schedule_status AS ENUM (
                        'ACTIVE', 
                        'PAUSED', 
                        'COMPLETED', 
                        'FAILED', 
                        'CANCELLED'
                    );
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'schedule_type') THEN
                    CREATE TYPE schedule_type AS ENUM (
                        'FIAT_DEPOSIT', 
                        'FIAT_WITHDRAWAL', 
                        'FIAT_TO_CRYPTO', 
                        'CRYPTO_TO_FIAT'
                    );
                END IF;
            END
            $$;
        `);

        // Create the scheduled_payments table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS scheduled_payments (
                id UUID PRIMARY KEY,
                "userId" VARCHAR(100) NOT NULL,
                name VARCHAR(50) NOT NULL,
                type schedule_type NOT NULL,
                amount DECIMAL(18, 6) NOT NULL,
                currency VARCHAR(10) NOT NULL,
                frequency schedule_frequency NOT NULL,
                "nextExecutionDate" TIMESTAMPTZ NOT NULL,
                status schedule_status NOT NULL DEFAULT 'ACTIVE',
                metadata JSONB,
                "processorName" VARCHAR(100),
                "processorAccountId" VARCHAR(255),
                "destinationId" VARCHAR(100),
                "executionCount" INTEGER NOT NULL DEFAULT 0,
                "maxExecutions" INTEGER,
                "lastExecutionDate" TIMESTAMPTZ,
                "endDate" TIMESTAMPTZ,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            
            -- Create indexes for performance
            CREATE INDEX IF NOT EXISTS idx_scheduled_payments_userId 
            ON scheduled_payments ("userId");
            
            CREATE INDEX IF NOT EXISTS idx_scheduled_payments_nextExecutionDate 
            ON scheduled_payments ("nextExecutionDate");
            
            CREATE INDEX IF NOT EXISTS idx_scheduled_payments_status 
            ON scheduled_payments (status);
            
            CREATE INDEX IF NOT EXISTS idx_scheduled_payments_type 
            ON scheduled_payments (type);
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop the table
        await queryRunner.query(`DROP TABLE IF EXISTS scheduled_payments;`);
        
        // Drop the enum types
        await queryRunner.query(`
            DROP TYPE IF EXISTS schedule_frequency;
            DROP TYPE IF EXISTS schedule_status;
            DROP TYPE IF EXISTS schedule_type;
        `);
    }
}
