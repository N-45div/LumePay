export interface User {
  id: string;
  walletAddress: string;
  username?: string;
  profileImage?: string;
  reputationScore: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Listing {
  id: string;
  sellerId: string;
  title: string;
  description?: string;
  price: number;
  currency: string;
  category?: string;
  status: ListingStatus;
  images?: string[];
  condition?: string;
  location?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Escrow {
  id: string;
  listingId?: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  currency: string;
  status: EscrowStatus;
  escrowAddress?: string;
  releaseTime?: Date;
  transactionSignature?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Transaction {
  id: string;
  escrowId?: string;
  transactionType: TransactionType;
  amount: number;
  signature?: string;
  status: TransactionStatus;
  createdAt: Date;
}

export interface Review {
  id: string;
  reviewerId: string;
  revieweeId: string;
  escrowId?: string;
  rating: number;
  comment?: string;
  createdAt: Date;
}

export interface Dispute {
  id: string;
  escrowId: string;
  initiatorId: string;
  respondentId: string;
  reason: string;
  details?: string;
  status: DisputeStatus;
  resolution?: string;
  adminComments?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  message: string;
  isRead: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export enum ListingStatus {
  ACTIVE = 'active',
  SOLD = 'sold',
  DELETED = 'deleted',
  SUSPENDED = 'suspended'
}

export enum EscrowStatus {
  CREATED = 'created',
  FUNDED = 'funded',
  RELEASED = 'released',
  REFUNDED = 'refunded',
  DISPUTED = 'disputed',
  EXPIRED = 'expired',
  CANCELED = 'canceled'
}

export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  REFUND = 'refund',
  FEE = 'fee'
}

export enum TransactionStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed'
}

export enum DisputeStatus {
  OPEN = 'open',
  IN_REVIEW = 'in_review',
  RESOLVED_BUYER = 'resolved_buyer',
  RESOLVED_SELLER = 'resolved_seller',
  RESOLVED_SPLIT = 'resolved_split',
  CLOSED = 'closed'
}

export enum NotificationType {
  TRANSACTION = 'transaction',
  ESCROW = 'escrow',
  LISTING = 'listing',
  SYSTEM = 'system',
  DISPUTE = 'dispute'
}

export interface JwtPayload {
  userId: string;
  walletAddress: string;
}
