// apps/backend/src/services/core/payment/TransactionHandler.ts

import { TransactionStatus } from '../../../types';
import { Result, createSuccess, createError } from '../../../utils/result';
import { Logger } from '../../../utils/logger';
import { PaymentError } from './errors/PaymentErrors';
import { convertToPaymentError } from '../../../utils/error-utils';

export interface TransactionState {
    id: string;
    status: TransactionStatus;
    currentAttempt: number;
    maxAttempts: number;
    lastError?: PaymentError;
    blockchainTxId?: string;
    confirmations: number;
    requiredConfirmations: number;
    lastUpdate?: Date;
}

export class TransactionHandler {
    private states: Map<string, TransactionState> = new Map();
    private logger: Logger;

    constructor() {
        this.logger = new Logger('TransactionHandler');
    }

    async initializeTransaction(
        txId: string,
        options: {
            maxAttempts?: number;
            requiredConfirmations?: number;
        } = {}
    ): Promise<Result<TransactionState, PaymentError>> {
        try {
            const state: TransactionState = {
                id: txId,
                status: TransactionStatus.PENDING,
                currentAttempt: 0,
                maxAttempts: options.maxAttempts || 3,
                confirmations: 0,
                requiredConfirmations: options.requiredConfirmations || 1
            };

            this.states.set(txId, state);
            return createSuccess(state);
        } catch (error) {
            return createError(convertToPaymentError(error));
        }
    }

    async updateTransactionState(
        txId: string,
        updates: Partial<TransactionState>
    ): Promise<Result<TransactionState, PaymentError>> {
        try {
            const currentState = this.states.get(txId);
            if (!currentState) {
                throw new PaymentError(
                    `Transaction ${txId} not found`,
                    'TRANSACTION_NOT_FOUND'
                );
            }

            const newState = {
                ...currentState,
                ...updates,
                lastUpdate: new Date()
            };

            this.states.set(txId, newState);
            this.logger.info('Transaction state updated', { 
                txId, 
                oldState: currentState, 
                newState 
            });

            return createSuccess(newState);
        } catch (error) {
            return createError(convertToPaymentError(error));
        }
    }

    async handleFailedAttempt(
        txId: string,
        error: Error | PaymentError
    ): Promise<Result<TransactionState, PaymentError>> {
        try {
            const state = this.states.get(txId);
            if (!state) {
                throw new PaymentError(
                    `Transaction ${txId} not found`,
                    'TRANSACTION_NOT_FOUND'
                );
            }

            const newState = {
                ...state,
                currentAttempt: state.currentAttempt + 1,
                lastError: convertToPaymentError(error),
                status: state.currentAttempt + 1 >= state.maxAttempts 
                    ? TransactionStatus.FAILED 
                    : TransactionStatus.PENDING,
                lastUpdate: new Date()
            };

            this.states.set(txId, newState);
            
            if (newState.status === TransactionStatus.FAILED) {
                this.logger.error('Transaction failed after max attempts', {
                    txId,
                    attempts: newState.currentAttempt,
                    lastError: error
                });
            }

            return createSuccess(newState);
        } catch (error) {
            return createError(convertToPaymentError(error));
        }
    }

    async confirmTransaction(
        txId: string,
        confirmations: number
    ): Promise<Result<TransactionState, PaymentError>> {
        try {
            const state = this.states.get(txId);
            if (!state) {
                throw new PaymentError(
                    `Transaction ${txId} not found`,
                    'TRANSACTION_NOT_FOUND'
                );
            }

            const newState = {
                ...state,
                confirmations,
                status: confirmations >= state.requiredConfirmations 
                    ? TransactionStatus.COMPLETED 
                    : TransactionStatus.PROCESSING,
                lastUpdate: new Date()
            };

            this.states.set(txId, newState);

            if (newState.status === TransactionStatus.COMPLETED) {
                this.logger.info('Transaction confirmed', {
                    txId,
                    confirmations,
                    requiredConfirmations: state.requiredConfirmations
                });
            }

            return createSuccess(newState);
        } catch (error) {
            return createError(convertToPaymentError(error));
        }
    }

    getTransactionState(txId: string): TransactionState | undefined {
        return this.states.get(txId);
    }

    shouldRetry(txId: string): boolean {
        const state = this.states.get(txId);
        if (!state) return false;
        return state.currentAttempt < state.maxAttempts;
    }

    isCompleted(txId: string): boolean {
        const state = this.states.get(txId);
        return state?.status === TransactionStatus.COMPLETED;
    }

    isFailed(txId: string): boolean {
        const state = this.states.get(txId);
        return state?.status === TransactionStatus.FAILED;
    }
}