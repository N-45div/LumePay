import { Router } from 'express';
import authenticate from '../middleware/auth';
import solanaPayController from '../controllers/solana-pay.controller';

const router = Router();

/**
 * @route POST /api/solana-pay/payment
 * @desc Create a Solana Pay payment request
 * @access Private
 */
router.post(
  '/payment',
  authenticate,
  solanaPayController.createPaymentRequest
);

/**
 * @route GET /api/solana-pay/payment/:paymentId/status
 * @desc Check the status of a payment request
 * @access Private
 */
router.get(
  '/payment/:paymentId/status',
  authenticate,
  solanaPayController.checkPaymentStatus
);

/**
 * @route POST /api/solana-pay/escrow
 * @desc Create an escrow payment using Solana Pay
 * @access Private
 */
router.post(
  '/escrow',
  authenticate,
  solanaPayController.createEscrowPayment
);

export default router;
