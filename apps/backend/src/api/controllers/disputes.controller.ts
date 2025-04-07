import { Request, Response, NextFunction } from 'express';
import * as disputesService from '../../services/disputes.service';
import { DisputeStatus } from '../../types';

export async function createDispute(req: Request, res: Response, next: NextFunction) {
  try {
    const { escrowId, reason } = req.body;
    const userId = req.user!.userId;
    
    const dispute = await disputesService.createDispute(escrowId, userId, reason);
    
    return res.status(201).json({
      status: 'success',
      data: { dispute }
    });
  } catch (error) {
    next(error);
  }
}

export async function getDispute(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    
    const dispute = await disputesService.getDisputeById(id, userId);
    
    return res.status(200).json({
      status: 'success',
      data: { dispute }
    });
  } catch (error) {
    next(error);
  }
}

export async function getUserDisputes(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    
    const disputes = await disputesService.getUserDisputes(userId);
    
    return res.status(200).json({
      status: 'success',
      data: { disputes }
    });
  } catch (error) {
    next(error);
  }
}

export async function resolveDispute(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { resolution, outcome } = req.body;
    const adminId = req.user!.userId;
    
    const dispute = await disputesService.resolveDispute(
      id,
      adminId,
      resolution,
      outcome as DisputeStatus
    );
    
    return res.status(200).json({
      status: 'success',
      data: { dispute }
    });
  } catch (error) {
    next(error);
  }
}

export async function updateDisputeStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const adminId = req.user!.userId;
    
    const dispute = await disputesService.updateDisputeStatus(
      id,
      status as DisputeStatus,
      adminId
    );
    
    return res.status(200).json({
      status: 'success',
      data: { dispute }
    });
  } catch (error) {
    next(error);
  }
}

export async function getAllDisputes(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as DisputeStatus | undefined;
    
    const result = await disputesService.getDisputes(limit, offset, status);
    
    return res.status(200).json({
      status: 'success',
      data: { 
        disputes: result.disputes,
        total: result.total,
        limit,
        offset
      }
    });
  } catch (error) {
    next(error);
  }
}
