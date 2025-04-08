import { Request, Response, NextFunction } from 'express';
import * as listingsService from '../../services/listings.service';
import { BadRequestError } from '../../utils/errors';
import { ListingStatus } from '../../types';

export const createListing = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sellerId = req.user!.userId;
    const { title, description, price, currency, category, images, condition, location } = req.body;
    
    if (!title || !price || !currency) {
      throw new BadRequestError('Title, price, and currency are required');
    }
    
    const listing = await listingsService.createListing(sellerId, {
      title,
      description,
      price: parseFloat(price),
      currency,
      category,
      images,
      condition,
      location
    });
    
    res.status(201).json({
      status: 'success',
      data: { listing }
    });
  } catch (error) {
    next(error);
  }
};

export const getListings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, offset, status, sellerId, category } = req.query;
    
    const result = await listingsService.getListings({
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
      status: status as ListingStatus,
      sellerId: sellerId as string,
      category: category as string
    });
    
    res.status(200).json({
      status: 'success',
      data: { 
        listings: result.listings,
        total: result.total,
        limit: limit ? parseInt(limit as string, 10) : 20,
        offset: offset ? parseInt(offset as string, 10) : 0
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getListingById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const listing = await listingsService.getListingById(id);
    
    res.status(200).json({
      status: 'success',
      data: { listing }
    });
  } catch (error) {
    next(error);
  }
};

export const updateListing = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const sellerId = req.user!.userId;
    const { title, description, price, currency, category, images } = req.body;
    
    const listing = await listingsService.updateListing(id, sellerId, {
      title,
      description,
      price: price ? parseFloat(price) : undefined,
      currency,
      category,
      images
    });
    
    res.status(200).json({
      status: 'success',
      data: { listing }
    });
  } catch (error) {
    next(error);
  }
};

export const deleteListing = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const sellerId = req.user!.userId;
    
    await listingsService.deleteListing(id, sellerId);
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const markListingAsSold = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const sellerId = req.user!.userId;
    
    const listing = await listingsService.markListingAsSold(id, sellerId);
    
    res.status(200).json({
      status: 'success',
      data: { listing }
    });
  } catch (error) {
    next(error);
  }
};
