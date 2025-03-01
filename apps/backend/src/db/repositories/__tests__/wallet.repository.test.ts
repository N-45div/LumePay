// apps/backend/src/db/repositories/__tests__/wallet.repository.test.ts

import { DataSource, QueryRunner, Repository, EntityManager } from 'typeorm';
import { WalletRepository } from '../wallet.repository';
import { Wallet } from '../../models/wallet.entity';

describe('WalletRepository', () => {
    let walletRepository: WalletRepository;
    let mockQueryRunner: Partial<QueryRunner>;
    let mockRepository: Partial<Repository<Wallet>>;
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

        walletRepository = new WalletRepository(
            mockRepository as Repository<Wallet>,
            mockDataSource
        );
    });

    describe('createWallet', () => {
        const mockWallet: Wallet = {
            id: 'new-wallet-id',
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

        it('should successfully create a wallet', async () => {
            const saveSpy = jest.spyOn(mockManager, 'save')
                .mockResolvedValueOnce(mockWallet);

            const result = await walletRepository.createWallet(
                mockWallet.address,
                undefined,
                mockWallet.network
            );

            expect(result).toEqual(mockWallet);
            expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
            expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
            expect(saveSpy).toHaveBeenCalled();
        });

        it('should handle duplicate address error', async () => {
            const saveSpy = jest.spyOn(mockManager, 'save')
                .mockRejectedValueOnce(new Error('Duplicate address'));

            await expect(walletRepository.createWallet(
                'existing-address',
                undefined,
                'solana'
            )).rejects.toThrow();

            expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
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