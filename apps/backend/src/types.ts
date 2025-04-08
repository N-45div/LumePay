export * from './types/index';
export interface LegacyUser {
  id: string;
  email: string;
  username?: string;
  passwordHash: string;
  role: UserRole;
  walletAddress?: string;
  verified: boolean;
  profileImage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin'
}

export enum ListingStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SOLD = 'sold',
  DELETED = 'deleted'
}

export enum EscrowStatus {
  CREATED = 'created',
  FUNDED = 'funded',
  RELEASED = 'released',
  REFUNDED = 'refunded',
  DISPUTED = 'disputed',
  CLOSED = 'closed'
}

export enum DisputeStatus {
  OPEN = 'open',
  UNDER_REVIEW = 'under_review',
  RESOLVED_BUYER = 'resolved_buyer',
  RESOLVED_SELLER = 'resolved_seller',
  CLOSED = 'closed'
}

export enum NotificationType {
  TRANSACTION = 'transaction',
  ESCROW = 'escrow',
  LISTING = 'listing',
  SYSTEM = 'system',
  DISPUTE = 'dispute'
}

export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled'
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
  transactionSignature?: string;
  releaseTime?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  condition: string;
  location: string;
  images: string[];
  sellerId: string;
  status: ListingStatus;
  createdAt: Date;
  updatedAt: Date;
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
  updatedAt: Date;
}

export interface AdminStats {
  totalUsers: number;
  totalListings: number;
  totalEscrows: number;
  totalDisputes: number;
  recentTransactions: any[];
  activeEscrows: number;
  completedEscrows: number;
  salesVolume: number;
}
