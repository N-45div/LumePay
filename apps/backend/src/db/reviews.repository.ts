import { query } from './index';
import { Review } from '../types';

/**
 * Create a new review
 */
export const create = async (
  reviewData: Omit<Review, 'id' | 'createdAt'>
): Promise<Review> => {
  const { reviewerId, revieweeId, escrowId, rating, comment } = reviewData;
  
  const result = await query(
    `INSERT INTO reviews 
     (reviewer_id, reviewee_id, escrow_id, rating, comment) 
     VALUES ($1, $2, $3, $4, $5) 
     RETURNING *`,
    [reviewerId, revieweeId, escrowId, rating, comment]
  );

  return mapDbReviewToReview(result.rows[0]);
};

/**
 * Get reviews for a specific user (as reviewee)
 */
export const getReviewsForUser = async (
  userId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ reviews: Review[]; total: number }> => {
  const { limit = 20, offset = 0 } = options;
  
  const reviewsQuery = `
    SELECT r.*, u.username as reviewer_username, u.profile_image as reviewer_profile_image
    FROM reviews r
    JOIN users u ON r.reviewer_id = u.id
    WHERE r.reviewee_id = $1
    ORDER BY r.created_at DESC
    LIMIT $2 OFFSET $3
  `;
  
  const countQuery = `
    SELECT COUNT(*) FROM reviews WHERE reviewee_id = $1
  `;
  
  const [reviewsResult, countResult] = await Promise.all([
    query(reviewsQuery, [userId, limit, offset]),
    query(countQuery, [userId])
  ]);
  
  const reviews = reviewsResult.rows.map(mapDbReviewToReview);
  
  return {
    reviews,
    total: parseInt(countResult.rows[0].count, 10)
  };
};

/**
 * Check if a user has already reviewed an escrow
 */
export const hasReviewedEscrow = async (
  reviewerId: string,
  escrowId: string
): Promise<boolean> => {
  const result = await query(
    'SELECT EXISTS(SELECT 1 FROM reviews WHERE reviewer_id = $1 AND escrow_id = $2)',
    [reviewerId, escrowId]
  );
  
  return result.rows[0].exists;
};

/**
 * Get average rating for a user
 */
export const getAverageRating = async (userId: string): Promise<number> => {
  const result = await query(
    'SELECT AVG(rating) as average_rating FROM reviews WHERE reviewee_id = $1',
    [userId]
  );
  
  if (!result.rows[0].average_rating) {
    return 0;
  }
  
  return parseFloat(result.rows[0].average_rating);
};

/**
 * Get review count for a user
 */
export const getReviewCount = async (userId: string): Promise<number> => {
  const result = await query(
    'SELECT COUNT(*) FROM reviews WHERE reviewee_id = $1',
    [userId]
  );
  
  return parseInt(result.rows[0].count, 10);
};

/**
 * Get review by ID
 */
export const findById = async (id: string): Promise<Review | null> => {
  const result = await query('SELECT * FROM reviews WHERE id = $1', [id]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapDbReviewToReview(result.rows[0]);
};

/**
 * Get reviews for a specific escrow
 */
export const getReviewsForEscrow = async (escrowId: string): Promise<Review[]> => {
  const result = await query(
    `SELECT r.*, u.username as reviewer_username, u.profile_image as reviewer_profile_image
     FROM reviews r
     JOIN users u ON r.reviewer_id = u.id
     WHERE r.escrow_id = $1
     ORDER BY r.created_at DESC`,
    [escrowId]
  );
  
  return result.rows.map(mapDbReviewToReview);
};

/**
 * Map database review to Review type
 */
function mapDbReviewToReview(review: any): Review {
  return {
    id: review.id,
    reviewerId: review.reviewer_id,
    revieweeId: review.reviewee_id,
    escrowId: review.escrow_id || undefined,
    rating: review.rating,
    comment: review.comment || undefined,
    createdAt: review.created_at,
    reviewerUsername: review.reviewer_username,
    reviewerProfileImage: review.reviewer_profile_image
  };
}
