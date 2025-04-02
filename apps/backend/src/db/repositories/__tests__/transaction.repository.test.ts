// apps/backend/src/db/repositories/__tests__/transaction.repository.test.ts

import { DataSource, QueryRunner, Repository, EntityManager } from 'typeorm';
import { TransactionRepository } from '../transaction.repository';
import { Transaction, TransactionType } from '../../models/transaction.entity';
import { TransactionStatus } from '../../../types';
import { Wallet } from '../../models/wallet.entity';

describe('TransactionRepository', () => {
    let transactionRepository: TransactionRepository;
    let mockQueryRunner: Partial<QueryRunner>;
    let mockRepository: Partial<Repository<Transaction>>;
    let mockManager: Partial<EntityManager>;

    beforeEach(() => {
        // Create mock manager with properly typed save function
        mockManager = {
            save: jest.fn().mockImplementation((entity) => Promise.resolve(entity))
        };

        // Create mock query runner with properly typed manager
        mockQueryRunner = {
            connect: jest.fn().mockResolvedValue(undefined),
            startTransaction: jest.fn().mockResolvedValue(undefined),
            commitTransaction: jest.fn().mockResolvedValue(undefined),
            rollbackTransaction: jest.fn().mockResolvedValue(undefined),
            release: jest.fn().mockResolvedValue(undefined),
            manager: mockManager as EntityManager
        };

        // Create mock DataSource
        const mockDataSource = {
            createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner)
        } as unknown as DataSource;

        // Create mock repository
        mockRepository = {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn()
        };

        transactionRepository = new TransactionRepository(
            mockRepository as Repository<Transaction>,
            mockDataSource
        );
    });

    describe('createTransaction', () => {
        const mockWallet: Wallet = {
            id: 'wallet-1',
            address: 'wallet-address',
            userId: null,
            metadata: {},
            isActive: true,
            balance: 0,
            network: 'solana',
            createdAt: new Date(),
            updatedAt: new Date(),
            sentTransactions: [],
            receivedTransactions: []
        };

        const validTransactionData = {
            userId: 'user-1',
            fromAddress: 'from-address',
            toAddress: 'to-address',
            amount: 100,
            currency: 'SOL',
            network: 'solana' as const,
            fromWalletId: 'wallet-1',
            toWalletId: 'wallet-2',
            type: TransactionType.CRYPTO_PAYMENT,
            sourceId: 'source-1',
            destinationId: 'destination-1',
            processorName: 'test-processor',
            processorTransactionId: 'proc-tx-123'
        };

        const mockSavedTransaction: Transaction = {
            id: 'new-tx-id',
            userId: 'user-1',
            fromAddress: validTransactionData.fromAddress,
            toAddress: validTransactionData.toAddress,
            amount: validTransactionData.amount,
            currency: validTransactionData.currency,
            status: TransactionStatus.PENDING,
            timestamp: new Date(),
            network: validTransactionData.network,
            metadata: {},
            fromWallet: mockWallet,
            toWallet: mockWallet,
            type: TransactionType.CRYPTO_PAYMENT,
            statusHistory: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            sourceId: 'source-1',
            destinationId: 'destination-1',
            processorName: 'test-processor',
            processorTransactionId: 'proc-tx-123'
        };

        it('should successfully create a transaction', async () => {
            const saveSpy = jest.spyOn(mockManager, 'save')
                .mockResolvedValueOnce(mockSavedTransaction);

            const result = await transactionRepository.createTransaction(validTransactionData);

            expect(result).toEqual(mockSavedTransaction);
            expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.release).toHaveBeenCalled();
            expect(saveSpy).toHaveBeenCalled();
        });

        it('should rollback transaction on error', async () => {
            const saveSpy = jest.spyOn(mockManager, 'save')
                .mockRejectedValueOnce(new Error('Database error'));
        
            await expect(transactionRepository.createTransaction(validTransactionData))
                .rejects
                .toMatchObject({
                    code: 'TRANSACTION_CREATION_FAILED'
                });
        
            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.release).toHaveBeenCalled();
            expect(saveSpy).toHaveBeenCalled();
        });

    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.clearAllTimers();
    });
    
    afterAll(async () => {
        jest.clearAllMocks();
        jest.clearAllTimers();
        jest.useRealTimers();
        
        // Allow any pending micro tasks to complete
        await new Promise(resolve => setImmediate(resolve));
        
        // Allow any pending timers to complete
        await new Promise(resolve => setTimeout(resolve, 0));
    });
});