// apps/backend/src/utils/type-converters.ts
import { Transaction as EntityTransaction } from '../db/models/transaction.entity';
import { TransactionStatus } from '../common/types/transaction.types';

// Since we don't have a separate domain Transaction type anymore,
// we'll create interfaces for the conversion functions
interface DomainTransaction {
    id: string;
    fromAddress: string;
    toAddress: string;
    amount: number;
    currency: string;
    status: TransactionStatus;
    timestamp: Date;
    network?: 'solana' | 'traditional';
    metadata?: Record<string, any>;
}

export function toEntityTransaction(domainTx: DomainTransaction): Partial<EntityTransaction> {
    return {
        id: domainTx.id,
        fromAddress: domainTx.fromAddress,
        toAddress: domainTx.toAddress,
        amount: domainTx.amount,
        currency: domainTx.currency,
        status: domainTx.status,
        timestamp: domainTx.timestamp,
        network: domainTx.network,
        metadata: domainTx.metadata
    };
}

export function toDomainTransaction(entityTx: EntityTransaction): DomainTransaction {
    return {
        id: entityTx.id,
        fromAddress: entityTx.fromAddress,
        toAddress: entityTx.toAddress,
        amount: entityTx.amount,
        currency: entityTx.currency,
        status: entityTx.status,
        timestamp: entityTx.timestamp || new Date(),
        network: entityTx.network,
        metadata: entityTx.metadata
    };
}