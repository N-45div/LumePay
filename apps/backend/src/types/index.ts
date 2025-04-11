export interface User {
  id: string;
  walletAddress: string;
  username?: string;
  profileImage?: string;
  reputationScore: number;
  trustScore?: number;
  verificationLevel?: VerificationLevel;
  isVerified?: boolean;
  createdAt: Date;
  updatedAt: Date;
  isAdmin?: boolean;
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
  isMultiSig?: boolean;
  multiSigSignatures?: MultiSigStatus;
  isTimeLocked?: boolean;
  unlockTime?: Date;
  autoResolveAfterDays?: number;
  disputeResolutionMode?: DisputeResolutionMode;
}

export interface MultiSigStatus {
  buyerSigned: boolean;
  sellerSigned: boolean;
  adminSigned?: boolean;
  requiredSignatures: number;
  completedSignatures: number;
}

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  status: TransactionStatus;
  transactionHash?: string;
  sourceId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Review {
  id: string;
  reviewerId: string;
  revieweeId: string;
  escrowId?: string;
  rating: number;
  comment?: string;
  createdAt: Date;
  reviewerUsername?: string;
  reviewerProfileImage?: string;
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

export interface ReputationRecord {
  id: string;
  userId: string;
  score: number;
  transactionCount: number;
  reviewCount: number;
  disputeResolutionRatio: number;
  verificationLevel: VerificationLevel;
  blockchainAddress?: string;
  transactionSignature?: string;
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
  CANCELED = 'canceled',
  AWAITING_SIGNATURES = 'awaiting_signatures',
  TIME_LOCKED = 'time_locked',
  AUTO_RESOLVED = 'auto_resolved'
}

export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  REFUND = 'refund',
  FEE = 'fee',
  SWAP = 'swap',
  YIELD = 'yield'
}

export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELED = 'canceled'
}

export enum DisputeStatus {
  OPEN = 'open',
  IN_REVIEW = 'in_review',
  RESOLVED_BUYER = 'resolved_buyer',
  RESOLVED_SELLER = 'resolved_seller',
  RESOLVED_SPLIT = 'resolved_split',
  CLOSED = 'closed'
}

export enum VerificationLevel {
  NONE = 'none',
  BASIC = 'basic',
  VERIFIED = 'verified',
  TRUSTED = 'trusted'
}

export enum NotificationType {
  TRANSACTION = 'transaction',
  ESCROW = 'escrow',
  LISTING = 'listing',
  SYSTEM = 'system',
  DISPUTE = 'dispute',
  REPUTATION = 'reputation'
}

export enum DisputeResolutionMode {
  MANUAL = 'manual',
  AUTO_BUYER = 'auto_buyer',
  AUTO_SELLER = 'auto_seller',
  AUTO_SPLIT = 'auto_split',
  AUTO_REPUTATION = 'auto_reputation'
}

export interface JwtPayload {
  userId: string;
  walletAddress: string;
}
