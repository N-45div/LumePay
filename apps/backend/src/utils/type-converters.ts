// apps/backend/src/utils/type-converters.ts
import { Transaction as DomainTransaction } from '../types';
import { Transaction as EntityTransaction } from '../db/models/transaction.entity';

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
        timestamp: entityTx.timestamp,
        network: entityTx.network,
        metadata: entityTx.metadata
    };
}