// apps/backend/src/services/core/payment/__tests__/PaymentService.test.ts

import { PaymentService } from '../PaymentService';
import { TransactionRepository } from '../../../../db/repositories/transaction.repository';
import { WalletRepository } from '../../../../db/repositories/wallet.repository';
import { WalletBalanceRepository } from '../../../../db/repositories/wallet-balance.repository';
import { TransactionStatus } from '../../../../common/types/transaction.types';
import { 
    PaymentError, 
    InsufficientFundsError,
    InvalidAddressError 
} from '../errors/PaymentErrors';
import { Transaction } from '../../../../db/models/transaction.entity';
import { Wallet } from '../../../../db/models/wallet.entity';
import { TransactionType } from '../../../../db/models/transaction.entity';

describe('PaymentService', () => {
    let paymentService: PaymentService;
    let mockTransactionRepo: jest.Mocked<TransactionRepository>;
    let mockWalletRepo: jest.Mocked<WalletRepository>;
    let mockWalletBalanceRepo: jest.Mocked<WalletBalanceRepository>;
    let mockSolanaService: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockTransactionRepo = {
            createTransaction: jest.fn(),
            findById: jest.fn(),
            updateTransactionStatus: jest.fn(),
            updateTransaction: jest.fn()
        } as unknown as jest.Mocked<TransactionRepository>;

        mockWalletRepo = {
            findByAddress: jest.fn(),
            createWallet: jest.fn()
        } as unknown as jest.Mocked<WalletRepository>;

        mockWalletBalanceRepo = {
            recordBalanceChange: jest.fn()
        } as unknown as jest.Mocked<WalletBalanceRepository>;

        mockSolanaService = {
            getBalance: jest.fn(),
            getSwapQuote: jest.fn(),
            executeSwap: jest.fn(),
            getTransactionStatus: jest.fn()
        };

        paymentService = new PaymentService(
            mockTransactionRepo,
            mockWalletRepo,
            mockWalletBalanceRepo,
            mockSolanaService
        );
    });

    describe('processPayment', () => {
        const mockWallet: Wallet = {
            id: 'wallet-id',
            address: 'valid-from-address',
            userId: 'test-user-id',
            metadata: {},
            isActive: true,
            balance: 200,
            network: 'solana',
            createdAt: new Date(),
            updatedAt: new Date(),
            sentTransactions: [],
            receivedTransactions: []
        };

        const validRequest = {
            userId: 'test-user-id',
            fromAddress: mockWallet.address,
            toAddress: 'valid-to-address',
            amount: 100,
            currency: 'SOL'
        };

        const mockTransaction: Transaction = {
            id: 'test-tx-id',
            userId: 'test-user-id',
            fromAddress: validRequest.fromAddress,
            toAddress: validRequest.toAddress,
            amount: validRequest.amount,
            currency: validRequest.currency,
            status: TransactionStatus.PENDING,
            timestamp: new Date(),
            network: 'solana',
            metadata: {},
            fromWallet: mockWallet,
            toWallet: mockWallet,
            type: TransactionType.CRYPTO_PAYMENT,
            statusHistory: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            sourceId: 'source-1',
            destinationId: 'destination-1',
            processorName: 'mock-processor',
            processorTransactionId: 'mock-tx-id'
        };

        it('should successfully process a valid Solana payment', async () => {
            // Setup all required mocks for success path
            mockSolanaService.getBalance
                .mockResolvedValueOnce({ success: true, data: 200 })  // First call for source
                .mockResolvedValueOnce({ success: true, data: 0 });   // Second call for destination

            mockSolanaService.getSwapQuote.mockResolvedValue({ 
                success: true, 
                data: { 
                    id: 'quote-id',
                    status: 'completed'
                } 
            });

            mockSolanaService.executeSwap.mockResolvedValue({ 
                success: true, 
                data: { 
                    status: 'completed',
                    txHash: 'mock-tx-hash'
                } 
            });
            
            mockWalletRepo.findByAddress.mockResolvedValue(mockWallet);
            mockTransactionRepo.createTransaction.mockResolvedValue(mockTransaction);
            mockTransactionRepo.updateTransactionStatus.mockResolvedValue(mockTransaction);

            const result = await paymentService.processPayment(validRequest);

            expect(mockSolanaService.getBalance).toHaveBeenCalledWith(
                validRequest.fromAddress,
                validRequest.currency
            );
            expect(mockTransactionRepo.createTransaction).toHaveBeenCalled();
            expect(mockSolanaService.executeSwap).toHaveBeenCalled();
            
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.transactionId).toBeDefined();
                expect(result.data.status).toBe(TransactionStatus.PENDING);
            }
        });

        it('should handle insufficient funds error', async () => {
            mockSolanaService.getBalance
                .mockResolvedValueOnce({ success: true, data: 50 })   // First call - insufficient balance
                .mockResolvedValueOnce({ success: true, data: 0 });   // Second call

            const result = await paymentService.processPayment(validRequest);

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBeInstanceOf(PaymentError);
                expect(result.error.code).toBe('INSUFFICIENT_FUNDS');
                expect(mockTransactionRepo.createTransaction).not.toHaveBeenCalled();
            }
        });

        it('should handle invalid address error', async () => {
            mockSolanaService.getBalance.mockResolvedValue({ 
                success: false,
                error: new Error('Invalid address')
            });

            const result = await paymentService.processPayment(validRequest);

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBeInstanceOf(PaymentError);
                expect(result.error.code).toBe('INVALID_ADDRESS');
                expect(mockTransactionRepo.createTransaction).not.toHaveBeenCalled();
            }
        });
    });

    describe('validateTransaction', () => {
        const mockWallet: Wallet = {
            id: 'wallet-id',
            address: 'test-address',
            userId: 'test-user-id',
            metadata: {},
            isActive: true,
            balance: 0,
            network: 'solana',
            createdAt: new Date(),
            updatedAt: new Date(),
            sentTransactions: [],
            receivedTransactions: []
        };

        const mockTransaction: Transaction = {
            id: 'existing-tx',
            userId: 'test-user-id',
            status: TransactionStatus.COMPLETED,
            fromAddress: 'addr1',
            toAddress: 'addr2',
            amount: 50,
            currency: 'SOL',
            timestamp: new Date(),
            network: 'solana',
            metadata: {},
            fromWallet: mockWallet,
            toWallet: mockWallet,
            type: TransactionType.CRYPTO_PAYMENT,
            statusHistory: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            sourceId: 'source-2',
            destinationId: 'destination-2',
            processorName: 'mock-processor',
            processorTransactionId: 'mock-tx-id-2'
        };

        it('should return true for existing transaction', async () => {
            mockTransactionRepo.findById.mockResolvedValue(mockTransaction);
            mockSolanaService.getTransactionStatus.mockResolvedValue({ 
                success: true,
                data: { status: 'completed' }
            });

            const result = await paymentService.validateTransaction('existing-tx');
            expect(result).toBe(true);
        });

        it('should return false for non-existing transaction', async () => {
            mockTransactionRepo.findById.mockResolvedValue(null);
            const result = await paymentService.validateTransaction('non-existing-tx');
            expect(result).toBe(false);
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