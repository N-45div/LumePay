import * as escrowsRepository from '../db/escrows.repository';
import * as disputesRepository from '../db/disputes.repository';
import * as usersRepository from '../db/users.repository';
import * as listingsRepository from '../db/listings.repository';
import * as notificationsService from './notifications.service';
import { EscrowStatus, DisputeStatus, ListingStatus } from '../types';

export interface MarketplaceStats {
  totalUsers: number;
  totalListings: number;
  activeListings: number;
  totalEscrows: number;
  totalDisputes: number;
  openDisputes: number;
  totalTransactionVolume: number;
  statistics: {
    daily: {
      date: string;
      transactions: number;
      volume: number;
      newUsers: number;
      newListings: number;
    }[];
    monthly: {
      month: string;
      transactions: number;
      volume: number;
      newUsers: number;
      newListings: number;
    }[];
  };
}

export async function getMarketplaceStats(): Promise<MarketplaceStats> {
  const [
    users,
    allListings,
    activeListings,
    escrows,
    allDisputes,
    openDisputes,
    volumeResult
  ] = await Promise.all([
    usersRepository.getTotalCount(),
    listingsRepository.getTotalCount(),
    listingsRepository.getCountByStatus(ListingStatus.ACTIVE),
    escrowsRepository.getTotalCount(),
    disputesRepository.getTotalCount(),
    disputesRepository.getCountByStatus(DisputeStatus.OPEN),
    escrowsRepository.getTotalVolumeByStatus(EscrowStatus.RELEASED)
  ]);

  const dailyStats = await getDailyStats(30); // Last 30 days
  const monthlyStats = await getMonthlyStats(6); // Last 6 months

  return {
    totalUsers: users,
    totalListings: allListings,
    activeListings: activeListings,
    totalEscrows: escrows,
    totalDisputes: allDisputes,
    openDisputes: openDisputes,
    totalTransactionVolume: volumeResult,
    statistics: {
      daily: dailyStats,
      monthly: monthlyStats
    }
  };
}

export async function getPendingDisputes(limit: number = 10, offset: number = 0) {
  return disputesRepository.findAll(
    limit,
    offset,
    DisputeStatus.OPEN
  );
}

export async function getRecentTransactions(limit: number = 10, offset: number = 0) {
  return escrowsRepository.getRecentCompletedTransactions(limit, offset);
}

export async function getFlaggedListings(limit: number = 10, offset: number = 0) {
  return listingsRepository.getFlaggedListings(limit, offset);
}

export async function suspendListing(listingId: string, reason: string, adminId: string) {
  const listing = await listingsRepository.updateStatus(listingId, ListingStatus.SUSPENDED);
  
  if (listing) {
    await notificationsService.createListingNotification(
      listing.sellerId,
      `Your listing "${listing.title}" has been suspended: ${reason}`
    );
  }
  
  return listing;
}

export async function suspendUser(userId: string, reason: string, adminId: string) {
  const user = await usersRepository.suspendUser(userId, reason);
  
  if (user) {
    await notificationsService.createSystemNotification(
      userId,
      `Your account has been suspended: ${reason}. Please contact support.`
    );
  }
  
  return user;
}

export async function broadcastAnnouncement(message: string, adminId: string) {
  await notificationsService.broadcastSystemNotification(message);
  return { success: true, message: "Announcement sent to all users" };
}

export async function getSystemHealth() {
  const [
    pendingEscrowCount,
    openDisputeCount,
    activeListingCount,
    failedTransactionsCount
  ] = await Promise.all([
    escrowsRepository.getCountByStatus(EscrowStatus.FUNDED),
    disputesRepository.getCountByStatus(DisputeStatus.OPEN),
    listingsRepository.getCountByStatus(ListingStatus.ACTIVE),
    escrowsRepository.getFailedTransactionsCount()
  ]);

  const healthScore = calculateHealthScore(
    pendingEscrowCount,
    openDisputeCount,
    failedTransactionsCount
  );

  return {
    status: getHealthStatus(healthScore),
    healthScore,
    metrics: {
      pendingEscrows: pendingEscrowCount,
      openDisputes: openDisputeCount,
      activeListings: activeListingCount,
      failedTransactions: failedTransactionsCount
    }
  };
}

// Helper functions
async function getDailyStats(days: number) {
  // Implementation would query the database for daily metrics
  // This is a placeholder that would be replaced with actual DB queries
  return Array(days).fill(0).map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    return {
      date: date.toISOString().split('T')[0],
      transactions: Math.floor(Math.random() * 100),
      volume: Math.floor(Math.random() * 10000),
      newUsers: Math.floor(Math.random() * 50),
      newListings: Math.floor(Math.random() * 30)
    };
  }).reverse();
}

async function getMonthlyStats(months: number) {
  // Implementation would query the database for monthly metrics
  // This is a placeholder that would be replaced with actual DB queries
  return Array(months).fill(0).map((_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const month = date.toISOString().split('T')[0].substring(0, 7);
    return {
      month,
      transactions: Math.floor(Math.random() * 500),
      volume: Math.floor(Math.random() * 50000),
      newUsers: Math.floor(Math.random() * 200),
      newListings: Math.floor(Math.random() * 150)
    };
  }).reverse();
}

function calculateHealthScore(pendingEscrows: number, openDisputes: number, failedTransactions: number) {
  // Simple health score calculation - would be refined based on business needs
  // Higher score is better (100 is perfect)
  let score = 100;
  
  // Penalty for open disputes
  score -= Math.min(openDisputes * 5, 40);
  
  // Penalty for failed transactions
  score -= Math.min(failedTransactions * 2, 30);
  
  return Math.max(score, 0);
}

function getHealthStatus(score: number) {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 50) return 'Fair';
  if (score >= 25) return 'Poor';
  return 'Critical';
}
