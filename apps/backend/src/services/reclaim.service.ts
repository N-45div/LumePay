import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import config from '../config';
import { BadRequestError } from '../utils/errors';
import { VerificationLevel } from '../types';
import cacheService from './cache.service';

const loadModule = (path: string) => {
  try {
    return require(path);
  } catch (error) {
    logger.warn(`Failed to load module: ${path}`, error);
    return null;
  }
};

export interface ReclaimVerificationRequest {
  userId: string;
  reclaimProof: string;
  proofType: string;
  metadata?: Record<string, any>;
}

export interface VerificationResult {
  success: boolean;
  userId: string;
  proofType: string;
  verificationId: string;
  credentialType?: string;
  issuanceDate?: Date;
  expirationDate?: Date;
  issuer?: string;
  score?: number;
  verificationLevel?: VerificationLevel;
}

export interface ReclaimCredential {
  id: string;
  userId: string;
  credentialType: string;
  issuer: string;
  issuanceDate: Date;
  expirationDate?: Date;
  revoked: boolean;
  metadata: Record<string, any>;
  proofType: string;
  proofId: string;
  verificationDate: Date;
}

class ReclaimService {
  private apiKey: string;
  private apiUrl: string;
  private cacheKeyPrefix: string;
  private credentialCacheTTL: number;
  private credentialsRepo: any;
  private reputationRepo: any;
  private usersRepo: any;

  constructor() {
    this.apiKey = config.reclaim.apiKey || 'test_api_key';
    this.apiUrl = config.reclaim.apiUrl || 'https://api.reclaimprotocol.org/v1';
    this.cacheKeyPrefix = 'reclaim:';
    this.credentialCacheTTL = 3600;
    
    this.credentialsRepo = loadModule('../db/credentials.repository');
    this.reputationRepo = loadModule('../db/reputation.repository');
    this.usersRepo = loadModule('../db/users.repository');
  }

  async verifyProof(request: ReclaimVerificationRequest): Promise<VerificationResult> {
    try {
      if (!request.userId || !request.reclaimProof || !request.proofType) {
        throw new BadRequestError('Invalid verification request. Missing required fields.');
      }

      let verificationResult: VerificationResult;
      
      if (config.reclaim.apiKey && process.env.NODE_ENV === 'production') {
        const response = await axios.post(
          `${this.apiUrl}/verify`,
          {
            proof: request.reclaimProof,
            proofType: request.proofType,
            metadata: request.metadata
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        verificationResult = response.data as VerificationResult;
      } else {
        verificationResult = this.simulateVerification(request);
      }

      if (verificationResult.success) {
        await this.storeCredential(verificationResult, request);
        await this.updateUserVerificationLevel(request.userId);
        await this.updateReputationScore(request.userId, verificationResult.score || 0);
      }

      return verificationResult;
    } catch (error) {
      logger.error('Error verifying Reclaim proof:', error);
      throw error;
    }
  }

  async getUserCredentials(userId: string): Promise<ReclaimCredential[]> {
    try {
      const cacheKey = `${this.cacheKeyPrefix}credentials:${userId}`;
      
      const cachedCredentials = await cacheService.get<ReclaimCredential[]>(cacheKey);
      if (cachedCredentials) {
        return cachedCredentials;
      }
      
      let credentials: ReclaimCredential[] = [];
      if (this.credentialsRepo && typeof this.credentialsRepo.findByUserId === 'function') {
        credentials = await this.credentialsRepo.findByUserId(userId);
      }
      
      if (credentials && credentials.length > 0) {
        await cacheService.set(cacheKey, credentials, { ttl: this.credentialCacheTTL });
      }
      
      return credentials || [];
    } catch (error) {
      logger.error(`Error fetching credentials for user ${userId}:`, error);
      return [];
    }
  }

  async getVerificationStatus(userId: string): Promise<{
    level: VerificationLevel;
    credentials: ReclaimCredential[];
    score: number;
  }> {
    try {
      let user = null;
      if (this.usersRepo && typeof this.usersRepo.findById === 'function') {
        user = await this.usersRepo.findById(userId);
      }
      
      if (!user) {
        throw new BadRequestError('User not found');
      }
      
      const credentials = await this.getUserCredentials(userId);
      
      let reputationRecord = null;
      if (this.reputationRepo && typeof this.reputationRepo.findByUserId === 'function') {
        reputationRecord = await this.reputationRepo.findByUserId(userId);
      }
      
      return {
        level: user.verificationLevel || VerificationLevel.NONE,
        credentials,
        score: reputationRecord?.score || 0
      };
    } catch (error) {
      logger.error(`Error getting verification status for user ${userId}:`, error);
      throw error;
    }
  }

  private async storeCredential(
    result: VerificationResult,
    request: ReclaimVerificationRequest
  ): Promise<void> {
    try {
      const credential: ReclaimCredential = {
        id: uuidv4(),
        userId: request.userId,
        credentialType: result.credentialType || request.proofType,
        issuer: result.issuer || 'reclaim-protocol',
        issuanceDate: result.issuanceDate || new Date(),
        expirationDate: result.expirationDate,
        revoked: false,
        metadata: request.metadata || {},
        proofType: request.proofType,
        proofId: result.verificationId,
        verificationDate: new Date()
      };
      
      if (this.credentialsRepo && typeof this.credentialsRepo.create === 'function') {
        await this.credentialsRepo.create(credential);
      }
      
      const cacheKey = `${this.cacheKeyPrefix}credentials:${request.userId}`;
      await cacheService.del(cacheKey);
    } catch (error) {
      logger.error('Error storing credential:', error);
      throw error;
    }
  }

  private async updateUserVerificationLevel(userId: string): Promise<void> {
    try {
      const credentials = await this.getUserCredentials(userId);
      
      let newLevel = VerificationLevel.NONE;
      
      if (credentials.length >= 5) {
        newLevel = VerificationLevel.TRUSTED;
      } else if (credentials.length >= 2) {
        newLevel = VerificationLevel.VERIFIED;
      } else if (credentials.length >= 1) {
        newLevel = VerificationLevel.BASIC;
      }
      
      if (this.usersRepo && typeof this.usersRepo.findById === 'function') {
        const user = await this.usersRepo.findById(userId);
        if (user && typeof this.usersRepo.update === 'function') {
          await this.usersRepo.update(userId, { verificationLevel: newLevel });
        }
      }
    } catch (error) {
      logger.error(`Error updating verification level for user ${userId}:`, error);
    }
  }

  private async updateReputationScore(userId: string, credentialScore: number): Promise<void> {
    try {
      const reputationServiceModule = loadModule('./reputation.service');
      const reputationService = reputationServiceModule?.default;
      
      if (reputationService && typeof reputationService.recalculateReputationScore === 'function') {
        await reputationService.recalculateReputationScore(userId);
      }
      
      if (credentialScore > 0 && this.reputationRepo) {
        if (typeof this.reputationRepo.findByUserId === 'function') {
          const record = await this.reputationRepo.findByUserId(userId);
          
          if (record && typeof this.reputationRepo.update === 'function') {
            await this.reputationRepo.update(record.id, {
              score: Math.min(100, record.score + (credentialScore * 0.1))
            });
          } else if (typeof this.reputationRepo.create === 'function') {
            await this.reputationRepo.create({
              userId,
              score: Math.min(50, credentialScore),
              transactionCount: 0,
              reviewCount: 0,
              disputeResolutionRatio: 0,
              verificationLevel: VerificationLevel.BASIC
            });
          }
        }
      }
    } catch (error) {
      logger.error(`Error updating reputation score for user ${userId}:`, error);
    }
  }

  private simulateVerification(request: ReclaimVerificationRequest): VerificationResult {
    const credentialTypes = {
      'github': 'GitHub Developer Account',
      'linkedin': 'LinkedIn Professional Profile',
      'google': 'Google Account',
      'twitter': 'Twitter/X Profile',
      'facebook': 'Facebook Account',
      'email': 'Email Verification'
    };
    
    const issuers = {
      'github': 'GitHub, Inc.',
      'linkedin': 'LinkedIn Corporation',
      'google': 'Google LLC',
      'twitter': 'X Corp.',
      'facebook': 'Meta Platforms, Inc.',
      'email': 'Email Provider'
    };
    
    const success = Math.random() > 0.1;
    const credentialType = request.proofType in credentialTypes 
      ? credentialTypes[request.proofType as keyof typeof credentialTypes] 
      : request.proofType;
    
    const issuer = request.proofType in issuers 
      ? issuers[request.proofType as keyof typeof issuers] 
      : 'Unknown Issuer';

    return {
      success,
      userId: request.userId,
      proofType: request.proofType,
      verificationId: uuidv4(),
      credentialType,
      issuanceDate: new Date(),
      expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      issuer,
      score: success ? Math.floor(Math.random() * 25) + 5 : 0,
      verificationLevel: success ? VerificationLevel.BASIC : VerificationLevel.NONE
    };
  }
}

const reclaimService = new ReclaimService();
export default reclaimService;
