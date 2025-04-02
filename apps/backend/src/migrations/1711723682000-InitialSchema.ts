// apps/backend/src/migrations/1711723682000-InitialSchema.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial database schema migration
 * Creates all necessary tables for the application
 */
export class InitialSchema1711723682000 implements MigrationInterface {
  name = 'InitialSchema1711723682000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create transactions table
    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" character varying NOT NULL,
        "fromAddress" character varying,
        "toAddress" character varying,
        "amount" numeric NOT NULL,
        "currency" character varying NOT NULL,
        "status" character varying NOT NULL,
        "timestamp" TIMESTAMP NOT NULL DEFAULT now(),
        "network" character varying,
        "type" character varying NOT NULL,
        "sourceId" character varying,
        "destinationId" character varying,
        "processorName" character varying,
        "processorTransactionId" character varying,
        "metadata" jsonb,
        "statusHistory" jsonb,
        CONSTRAINT "PK_transactions" PRIMARY KEY ("id")
      )
    `);

    // Create bank_accounts table
    await queryRunner.query(`
      CREATE TABLE "bank_accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" character varying NOT NULL,
        "accountName" character varying NOT NULL,
        "accountNumber" character varying NOT NULL,
        "routingNumber" character varying NOT NULL,
        "bankName" character varying NOT NULL,
        "status" character varying NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "metadata" jsonb,
        CONSTRAINT "PK_bank_accounts" PRIMARY KEY ("id")
      )
    `);

    // Add indexes for faster queries
    await queryRunner.query(`CREATE INDEX "IDX_transactions_userId" ON "transactions" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_transactions_status" ON "transactions" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_bank_accounts_userId" ON "bank_accounts" ("userId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order
    await queryRunner.query(`DROP INDEX "IDX_bank_accounts_userId"`);
    await queryRunner.query(`DROP INDEX "IDX_transactions_status"`);
    await queryRunner.query(`DROP INDEX "IDX_transactions_userId"`);
    await queryRunner.query(`DROP TABLE "bank_accounts"`);
    await queryRunner.query(`DROP TABLE "transactions"`);
  }
}
