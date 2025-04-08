import express from 'express';
import * as paymentsController from '../controllers/payments.controller';
import authenticate from '../middleware/auth';

const router = express.Router();

// Webhook - doesn't require authentication
router.post('/webhook', paymentsController.circleWebhook);

// Protected routes - require authentication
router.use(authenticate);

// Wallet and balance
router.get('/wallet', paymentsController.getWallet);
router.get('/balance', paymentsController.getWalletBalance);

// Transactions
router.get('/transactions', paymentsController.getUserTransactions);
router.get('/transfer/:transferId', paymentsController.getTransactionStatus);

// Escrow operations
router.post('/escrow/:escrowId/fund', paymentsController.fundEscrow);
router.post('/escrow/:escrowId/release', paymentsController.releaseEscrow);
router.post('/escrow/:escrowId/refund', paymentsController.refundEscrow);

export default router;
