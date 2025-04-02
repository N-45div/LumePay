// apps/backend/src/db/migrations/1717091000000-add-failure-tracking.ts
import { MigrationInterface, QueryRunner } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Migration to add failure tracking fields to scheduled_payments table
 */
export class AddFailureTracking1717091000000 implements MigrationInterface {
  private readonly logFile = path.join(
    __dirname,
    '../../../logs',
    `migration-1717091000000-${new Date().toISOString().replace(/:/g, '-')}.log`
  );

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    
    console.log(logMessage.trim());
    
    // Ensure logs directory exists
    const logsDir = path.dirname(this.logFile);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Append to log file
    fs.appendFileSync(this.logFile, logMessage);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    this.log('Starting migration: Add failure tracking fields to scheduled_payments');
    
    try {
      // Add failure_count column
      this.log('Adding failure_count column...');
      await queryRunner.query(`
        ALTER TABLE scheduled_payments
        ADD COLUMN IF NOT EXISTS "failureCount" integer NOT NULL DEFAULT 0
      `);
      
      // Add last_failure_message column
      this.log('Adding last_failure_message column...');
      await queryRunner.query(`
        ALTER TABLE scheduled_payments
        ADD COLUMN IF NOT EXISTS "lastFailureMessage" varchar(255) NULL
      `);
      
      // Add last_failure_date column
      this.log('Adding last_failure_date column...');
      await queryRunner.query(`
        ALTER TABLE scheduled_payments
        ADD COLUMN IF NOT EXISTS "lastFailureDate" timestamptz NULL
      `);
      
      this.log('Migration completed successfully');
    } catch (error) {
      this.log(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.stack) {
        this.log(`Stack trace: ${error.stack}`);
      }
      throw error;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    this.log('Rolling back migration: Add failure tracking fields to scheduled_payments');
    
    try {
      // Drop columns in reverse order
      this.log('Dropping last_failure_date column...');
      await queryRunner.query(`
        ALTER TABLE scheduled_payments
        DROP COLUMN IF EXISTS "lastFailureDate"
      `);
      
      this.log('Dropping last_failure_message column...');
      await queryRunner.query(`
        ALTER TABLE scheduled_payments
        DROP COLUMN IF EXISTS "lastFailureMessage"
      `);
      
      this.log('Dropping failure_count column...');
      await queryRunner.query(`
        ALTER TABLE scheduled_payments
        DROP COLUMN IF EXISTS "failureCount"
      `);
      
      this.log('Rollback completed successfully');
    } catch (error) {
      this.log(`Rollback failed: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.stack) {
        this.log(`Stack trace: ${error.stack}`);
      }
      throw error;
    }
  }
}
