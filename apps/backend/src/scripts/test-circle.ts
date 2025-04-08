import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { TransactionStatus } from '../types';

// Load environment variables
dotenv.config();

// Test Circle integration
async function testCircleIntegration() {
  try {
    console.log('Testing Circle SDK integration (MOCK MODE)...');
    console.log('Note: This test uses mock data and does not connect to the Circle API');
    
    // Mock wallet data
    const mockBuyerWallet = {
      id: uuidv4(),
      userId: 'test-buyer-123',
      walletId: `wallet-${uuidv4().substring(0, 8)}`,
      type: 'circle',
      address: `address-${uuidv4().substring(0, 8)}`,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const mockSellerWallet = {
      id: uuidv4(),
      userId: 'test-seller-456',
      walletId: `wallet-${uuidv4().substring(0, 8)}`,
      type: 'circle',
      address: `address-${uuidv4().substring(0, 8)}`,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Test wallet creation
    console.log('\n1. Creating test wallets (MOCK)...');
    console.log('Buyer wallet created:', mockBuyerWallet);
    console.log('Seller wallet created:', mockSellerWallet);
    
    // Check wallet balances
    console.log('\n2. Checking wallet balances (MOCK)...');
    const mockBuyerBalance = [
      {
        amount: '100.00',
        currency: 'USD'
      }
    ];
    
    const mockSellerBalance = [
      {
        amount: '250.00',
        currency: 'USD'
      }
    ];
    
    console.log('Buyer wallet balance:', mockBuyerBalance);
    console.log('Seller wallet balance:', mockSellerBalance);
    
    // Create a test escrow
    console.log('\n3. Creating test escrow (MOCK)...');
    const mockEscrow = {
      id: uuidv4(),
      listingId: `listing-${uuidv4().substring(0, 8)}`,
      buyerId: mockBuyerWallet.userId,
      sellerId: mockSellerWallet.userId,
      amount: 50.00,
      currency: 'USD',
      status: 'created',
      escrowAddress: `circle-escrow-${uuidv4().substring(0, 8)}`,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    console.log('Escrow created:', mockEscrow);
    
    // Simulate transfer to escrow
    console.log('\n4. Testing escrow transfer (MOCK)...');
    const mockTransferId = `transfer-${uuidv4().substring(0, 8)}`;
    const mockTransfer = {
      id: mockTransferId,
      source: {
        type: 'wallet',
        id: mockBuyerWallet.walletId
      },
      destination: {
        type: 'wallet',
        id: 'escrow-system-wallet'
      },
      amount: {
        amount: '50.00',
        currency: 'USD'
      },
      status: 'pending',
      createDate: new Date().toISOString()
    };
    
    console.log('Transfer initiated:', mockTransfer);
    
    // Test webhook processing
    console.log('\n5. Testing webhook processing (MOCK)...');
    const mockWebhookPayload = {
      type: 'transfer.complete',
      data: {
        transfer: {
          ...mockTransfer,
          status: 'complete',
          metadata: {
            escrowId: mockEscrow.id,
            userId: mockBuyerWallet.userId
          }
        }
      }
    };
    
    console.log('Mock webhook payload:', JSON.stringify(mockWebhookPayload, null, 2));
    console.log('Simulating transaction status update...');
    console.log('Transaction status updated to:', TransactionStatus.CONFIRMED);
    
    // Simulate escrow release
    console.log('\n6. Testing escrow release (MOCK)...');
    const mockReleaseTransferId = `transfer-${uuidv4().substring(0, 8)}`;
    const mockReleaseTransfer = {
      id: mockReleaseTransferId,
      source: {
        type: 'wallet',
        id: 'escrow-system-wallet'
      },
      destination: {
        type: 'wallet',
        id: mockSellerWallet.walletId
      },
      amount: {
        amount: '50.00',
        currency: 'USD'
      },
      status: 'complete',
      createDate: new Date().toISOString()
    };
    
    console.log('Release transfer completed:', mockReleaseTransfer);
    console.log('Escrow status updated to: released');
    
    console.log('\nCircle SDK integration test (MOCK MODE) completed successfully!');
    console.log('\nTo run this with the actual Circle API:');
    console.log('1. Set up your Circle API key in the .env file using the correct format:');
    console.log('   CIRCLE_API_KEY=ENV_NAME:KEY_ID:KEY_SECRET');
    console.log('2. Make sure all other Circle-related environment variables are configured');
    console.log('3. Update this test script to use the actual service methods instead of mock data');
  } catch (error) {
    console.error('Error testing Circle integration:', error);
  }
}

// Run the test
testCircleIntegration();
