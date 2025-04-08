import { Request, Response, NextFunction } from 'express';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import * as circleService from '../../services/circle.service';
import * as escrowsService from '../../services/escrows.service';
import * as notificationsService from '../../services/notifications.service';

export async function getWallet(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.user!;
    const wallet = await circleService.getUserWallet(userId);
    res.status(200).json({ status: 'success', data: { wallet } });
  } catch (error) {
    next(error);
  }
}

export async function getWalletBalance(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.user!;
    const wallet = await circleService.getUserWallet(userId);
    const balance = await circleService.getWalletBalance(wallet.walletId);
    res.status(200).json({ status: 'success', data: { balance } });
  } catch (error) {
    next(error);
  }
}

export async function getUserTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.user!;
    const { limit = 20, offset = 0 } = req.query;
    const transactions = await circleService.getUserTransactions(userId, Number(limit), Number(offset));
    res.status(200).json({ status: 'success', data: transactions });
  } catch (error) {
    next(error);
  }
}

export async function getTransactionStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { transferId } = req.params;
    const transferStatus = await circleService.getTransferStatus(transferId);
    res.status(200).json({ status: 'success', data: { status: transferStatus.status } });
  } catch (error) {
    next(error);
  }
}

export async function fundEscrow(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.user!;
    const { escrowId } = req.params;
    const result = await escrowsService.fundEscrow(escrowId, userId);
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
}

export async function releaseEscrow(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.user!;
    const { escrowId } = req.params;
    const result = await escrowsService.releaseEscrow(escrowId, userId);
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
}

export async function refundEscrow(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.user!;
    const { escrowId } = req.params;
    const result = await escrowsService.refundEscrow(escrowId, userId);
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
}

export async function circleWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const signature = req.headers['circle-signature'] as string;
    if (!signature) {
      throw new BadRequestError('Missing Circle signature header');
    }
    const result = await circleService.processCircleWebhook(req.body, signature);
    if (req.body.type === 'transfer.complete' && req.body.data?.transfer?.metadata?.escrowId) {
      const { escrowId, userId } = req.body.data.transfer.metadata;
      await notificationsService.createTransactionNotification(userId, 'Your USDC transfer has been confirmed');
    }
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
}
