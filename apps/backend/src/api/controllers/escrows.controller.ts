import { Request, Response, NextFunction } from 'express';
import * as escrowsService from '../../services/escrows.service';
import { BadRequestError } from '../../utils/errors';
import { EscrowStatus } from '../../types';

export const createEscrow = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const buyerId = req.user!.userId;
    const { listingId } = req.body;
    
    if (!listingId) {
      throw new BadRequestError('Listing ID is required');
    }
    
    const escrow = await escrowsService.createEscrow(buyerId, listingId);
    
    res.status(201).json({
      status: 'success',
      data: { escrow }
    });
  } catch (error) {
    next(error);
  }
};

export const getEscrowById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    
    const escrow = await escrowsService.getEscrowById(id, userId);
    
    res.status(200).json({
      status: 'success',
      data: { escrow }
    });
  } catch (error) {
    next(error);
  }
};

export const getUserEscrows = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { role, status, limit, offset } = req.query;
    
    const result = await escrowsService.getUserEscrows(userId, {
      role: role as 'buyer' | 'seller',
      status: status as EscrowStatus,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined
    });
    
    res.status(200).json({
      status: 'success',
      data: { 
        escrows: result.escrows,
        total: result.total,
        limit: limit ? parseInt(limit as string, 10) : 20,
        offset: offset ? parseInt(offset as string, 10) : 0
      }
    });
  } catch (error) {
    next(error);
  }
};

export const fundEscrow = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const buyerId = req.user!.userId;
    const { privateKey } = req.body;
    
    if (!privateKey) {
      throw new BadRequestError('Private key is required to fund escrow');
    }
    
    const escrow = await escrowsService.fundEscrow(id, buyerId);
    
    res.status(200).json({
      status: 'success',
      data: { escrow }
    });
  } catch (error) {
    next(error);
  }
};

export const releaseEscrow = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const sellerId = req.user!.userId;
    
    const escrow = await escrowsService.releaseEscrow(id, sellerId);
    
    res.status(200).json({
      status: 'success',
      data: { escrow }
    });
  } catch (error) {
    next(error);
  }
};

export const refundEscrow = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const sellerId = req.user!.userId;
    
    const escrow = await escrowsService.refundEscrow(id, sellerId);
    
    res.status(200).json({
      status: 'success',
      data: { escrow }
    });
  } catch (error) {
    next(error);
  }
};
