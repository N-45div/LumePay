import { query } from './index';
import { Listing, ListingStatus } from '../types';
import cacheService from '../services/cache.service';

export const create = async (listingData: Omit<Listing, 'id' | 'createdAt' | 'updatedAt'>): Promise<Listing> => {
  const { sellerId, title, description, price, currency, category, status, images } = listingData;
  
  const result = await query(
    `INSERT INTO listings 
     (seller_id, title, description, price, currency, category, status, images) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
     RETURNING *`,
    [sellerId, title, description, price, currency, category, status, images]
  );

  const listing = result.rows[0];
  return mapDbListingToListing(listing);
};

export const findById = async (id: string): Promise<Listing | null> => {
  const cacheKey = `listing:${id}`;
  const cachedListing = await cacheService.get<Listing>(cacheKey);
  
  if (cachedListing) {
    return cachedListing;
  }

  const result = await query(
    'SELECT * FROM listings WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const listing = mapDbListingToListing(result.rows[0]);
  await cacheService.set(cacheKey, listing, { ttl: 600 }); // Cache for 10 minutes
  
  return listing;
};

export const findAll = async (
  options: {
    limit?: number;
    offset?: number;
    status?: ListingStatus;
    sellerId?: string;
    category?: string;
  } = {}
): Promise<{ listings: Listing[]; total: number }> => {
  const { limit = 20, offset = 0, status, sellerId, category } = options;

  let whereClause = '';
  const params: any[] = [limit, offset];
  let paramIndex = 3;
  
  const conditions: string[] = [];
  
  if (status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(status);
  }
  
  if (sellerId) {
    conditions.push(`seller_id = $${paramIndex++}`);
    params.push(sellerId);
  }
  
  if (category) {
    conditions.push(`category = $${paramIndex++}`);
    params.push(category);
  }
  
  if (conditions.length > 0) {
    whereClause = 'WHERE ' + conditions.join(' AND ');
  }

  const listingsQuery = `
    SELECT * FROM listings 
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
  `;
  
  const countQuery = `
    SELECT COUNT(*) FROM listings ${whereClause}
  `;

  const [listingsResult, countResult] = await Promise.all([
    query(listingsQuery, params),
    query(countQuery, params.slice(2))
  ]);

  const listings = listingsResult.rows.map(listing => mapDbListingToListing(listing));

  return {
    listings,
    total: parseInt(countResult.rows[0].count, 10)
  };
};

export const update = async (
  id: string,
  data: Partial<Omit<Listing, 'id' | 'sellerId' | 'createdAt' | 'updatedAt'>>
): Promise<Listing | null> => {
  const { title, description, price, currency, category, status, images } = data;
  
  const updates: string[] = [];
  const values: any[] = [id];
  let paramIndex = 2;
  
  if (title !== undefined) {
    updates.push(`title = $${paramIndex++}`);
    values.push(title);
  }
  
  if (description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    values.push(description);
  }
  
  if (price !== undefined) {
    updates.push(`price = $${paramIndex++}`);
    values.push(price);
  }
  
  if (currency !== undefined) {
    updates.push(`currency = $${paramIndex++}`);
    values.push(currency);
  }
  
  if (category !== undefined) {
    updates.push(`category = $${paramIndex++}`);
    values.push(category);
  }
  
  if (status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    values.push(status);
  }
  
  if (images !== undefined) {
    updates.push(`images = $${paramIndex++}`);
    values.push(images);
  }
  
  updates.push(`updated_at = NOW()`);
  
  if (updates.length === 1) {
    return await findById(id);
  }
  
  const result = await query(
    `UPDATE listings SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
    values
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const updatedListing = mapDbListingToListing(result.rows[0]);
  
  await cacheService.del(`listing:${id}`);
  
  if (data.category) {
    await cacheService.del(`listings:category:${data.category}:*`);
  }
  
  return updatedListing;
};

export const deleteById = async (id: string): Promise<boolean> => {
  const result = await query('DELETE FROM listings WHERE id = $1 RETURNING id', [id]);
  return result.rows.length > 0;
};

/**
 * Get total count of all listings
 */
export const getTotalCount = async (): Promise<number> => {
  const result = await query(`SELECT COUNT(*) FROM listings`);
  return parseInt(result.rows[0].count, 10);
};

/**
 * Get count of listings with a specific status
 */
export const getCountByStatus = async (status: ListingStatus): Promise<number> => {
  const result = await query(
    `SELECT COUNT(*) FROM listings WHERE status = $1`,
    [status]
  );
  return parseInt(result.rows[0].count, 10);
};

/**
 * Get listings that have been flagged or reported by users
 */
export const getFlaggedListings = async (limit: number = 10, offset: number = 0): Promise<Listing[]> => {
  const result = await query(
    `SELECT l.* 
     FROM listings l
     LEFT JOIN reports r ON l.id = r.listing_id
     GROUP BY l.id
     ORDER BY COUNT(r.id) DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  
  return result.rows.map(mapDbListingToListing);
};

/**
 * Update a listing's status
 */
export const updateStatus = async (id: string, status: ListingStatus): Promise<Listing | null> => {
  const result = await query(
    `UPDATE listings 
     SET status = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, status]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const updatedListing = mapDbListingToListing(result.rows[0]);
  
  await cacheService.del(`listing:${id}`);
  
  return updatedListing;
};

function mapDbListingToListing(listing: any): Listing {
  return {
    id: listing.id,
    sellerId: listing.seller_id,
    title: listing.title,
    description: listing.description,
    price: parseFloat(listing.price),
    currency: listing.currency,
    category: listing.category,
    status: listing.status as ListingStatus,
    images: listing.images,
    condition: listing.condition || '',
    location: listing.location || '',
    createdAt: listing.created_at,
    updatedAt: listing.updated_at
  };
}
