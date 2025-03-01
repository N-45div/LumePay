// apps/backend/src/db/repositories/wallet.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Wallet } from '../models/wallet.entity';
import { BaseRepository } from './base.repository';


export class WalletOperationError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly details?: Record<string, any>
    ) {
        super(message);
        this.name = 'WalletOperationError';
    }
}

@Injectable()
export class WalletRepository extends BaseRepository<Wallet> {
    constructor(
        @InjectRepository(Wallet)
        private walletRepository: Repository<Wallet>,
        private dataSource: DataSource
    ) {
        super(walletRepository);
    }
    async findByAddress(address: string): Promise<Wallet | null> {
        return this.repository.findOne({ where: { address } });
    }

    async createWallet(
        address: string,
        userId: string | undefined,
        network: 'solana' | 'traditional'
    ): Promise<Wallet> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
    
        try {
            const wallet = this.walletRepository.create({
                address,
                userId: userId || null, // Convert undefined to null
                network,
                balance: 0,
                isActive: true,
                metadata: {
                    createdAt: new Date(),
                    lastUpdated: new Date()
                }
            });
    

            const savedWallet = await queryRunner.manager.save(wallet);

            await queryRunner.commitTransaction();
            return savedWallet;

        } catch (error: unknown) { // Explicitly type the error as unknown
            await queryRunner.rollbackTransaction();

            // First, check if it's our custom error
            if (error instanceof WalletOperationError) {
                throw error;
            }

            // Then check if it's a standard Error
            if (error instanceof Error) {
                throw new WalletOperationError(
                    'Failed to create wallet',
                    'WALLET_CREATION_FAILED',
                    { 
                        originalError: error.message,
                        stack: error.stack
                    }
                );
            }

            // If it's neither, handle it as a generic error
            throw new WalletOperationError(
                'Failed to create wallet',
                'WALLET_CREATION_FAILED',
                { 
                    originalError: String(error)
                }
            );

        } finally {
            await queryRunner.release();
        }
    }

    async getWalletBalance(walletId: string): Promise<{
        currentBalance: number;
        lastUpdated: Date;
    }> {
        try {
            const wallet = await this.walletRepository.findOne({
                where: { id: walletId }
            });

            if (!wallet) {
                throw new WalletOperationError(
                    'Wallet not found',
                    'WALLET_NOT_FOUND',
                    { walletId }
                );
            }

            return {
                currentBalance: Number(wallet.balance),
                lastUpdated: wallet.updatedAt
            };

        } catch (error: unknown) { // Explicitly type as unknown
            if (error instanceof WalletOperationError) {
                throw error;
            }

            if (error instanceof Error) {
                throw new WalletOperationError(
                    'Failed to get wallet balance',
                    'BALANCE_FETCH_FAILED',
                    { 
                        walletId, 
                        originalError: error.message,
                        stack: error.stack
                    }
                );
            }

            throw new WalletOperationError(
                'Failed to get wallet balance',
                'BALANCE_FETCH_FAILED',
                { 
                    walletId, 
                    originalError: String(error)
                }
            );
        }
    }
}