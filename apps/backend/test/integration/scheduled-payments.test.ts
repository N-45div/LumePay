// apps/backend/test/integration/scheduled-payments.test.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest'; 
import { TypeOrmModule } from '@nestjs/typeorm';
import { v4 as uuidv4 } from 'uuid';
import { addDays } from 'date-fns';
import { ConfigModule } from '@nestjs/config';

// Import modules and services
import { PaymentModule } from '../../src/modules/payment.module';
import { ScheduledPaymentService } from '../../src/services/core/payment/scheduled-payment.service';
import { ScheduledPaymentRepository } from '../../src/db/repositories/scheduled-payment.repository';
import { FiatBridgeService } from '../../src/services/core/payment/fiat-bridge.service';
import { ConversionService } from '../../src/services/core/conversion/conversion.service';
import { Logger } from '../../src/utils/logger';

// Import types
import { 
  ScheduleType, 
  ScheduleFrequency, 
  ScheduleStatus 
} from '../../src/db/models/scheduled-payment.entity';

// Database configuration
import getDatabaseConfig from '../../src/config/database.config';

// Test utilities
import { delay } from '../utils/test-utils';

describe('Scheduled Payments Integration Tests', () => {
  let app: INestApplication;
  let scheduledPaymentService: ScheduledPaymentService;
  let scheduledPaymentRepository: ScheduledPaymentRepository;
  let testUserId: string;
  let testScheduleId: string;

  beforeAll(async () => {
    // Create a test module with real dependencies
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432', 10),
          username: process.env.DB_USERNAME || 'postgres',
          password: process.env.DB_PASSWORD || '.Joseph23',
          database: process.env.DB_DATABASE || 'solanahack',
          autoLoadEntities: true,
          synchronize: false
        }),
        PaymentModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Get service instances
    scheduledPaymentService = moduleFixture.get<ScheduledPaymentService>(ScheduledPaymentService);
    scheduledPaymentRepository = moduleFixture.get<ScheduledPaymentRepository>(ScheduledPaymentRepository);
    
    // Create a test user ID
    testUserId = `test-user-${uuidv4()}`;
    
    // Clean up any existing test data for this user
    const existingSchedules = await scheduledPaymentRepository.findByUserId(testUserId);
    for (const schedule of existingSchedules) {
      await scheduledPaymentRepository.update(schedule.id, { status: ScheduleStatus.CANCELLED });
    }
  });

  afterAll(async () => {
    // Cleanup - mark any remaining test schedules as cancelled
    const existingSchedules = await scheduledPaymentRepository.findByUserId(testUserId);
    for (const schedule of existingSchedules) {
      await scheduledPaymentRepository.update(schedule.id, { status: ScheduleStatus.CANCELLED });
    }
    
    await app.close();
  });

  describe('API Endpoints', () => {
    it('POST /scheduled-payments - Should create a new scheduled payment', async () => {
      const createDto = {
        userId: testUserId,
        name: 'Test Monthly Payment',
        type: ScheduleType.FIAT_TO_CRYPTO,
        amount: 100,
        currency: 'USD',
        frequency: ScheduleFrequency.MONTHLY,
        nextExecutionDate: addDays(new Date(), 1).toISOString(),
        destinationId: 'SOL'
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/scheduled-payments')
        .send(createDto)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.userId).toBe(testUserId);
      expect(response.body.data.name).toBe('Test Monthly Payment');
      expect(response.body.data.status).toBe(ScheduleStatus.ACTIVE);
      
      // Save the ID for later tests
      testScheduleId = response.body.data.id;
    });

    it('GET /scheduled-payments/user/:userId - Should get all schedules for a user', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/scheduled-payments/user/${testUserId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].userId).toBe(testUserId);
    });

    it('GET /scheduled-payments/:id - Should get a specific schedule', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/scheduled-payments/${testScheduleId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.id).toBe(testScheduleId);
      expect(response.body.data.userId).toBe(testUserId);
    });

    it('PUT /scheduled-payments/:id - Should update a schedule', async () => {
      const updateDto = {
        name: 'Updated Test Payment',
        amount: 150
      };

      const response = await request(app.getHttpServer())
        .put(`/api/v1/scheduled-payments/${testScheduleId}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Updated Test Payment');
      expect(response.body.data.amount).toBe(150);
    });

    it('POST /scheduled-payments/:id/pause - Should pause a schedule', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/scheduled-payments/${testScheduleId}/pause`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe(ScheduleStatus.PAUSED);
    });

    it('POST /scheduled-payments/:id/resume - Should resume a schedule', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/scheduled-payments/${testScheduleId}/resume`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe(ScheduleStatus.ACTIVE);
    });

    it('GET /scheduled-payments/user/:userId/stats - Should get user stats', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/scheduled-payments/user/${testUserId}/stats`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.total).toBeGreaterThan(0);
      expect(response.body.data.active).toBeGreaterThan(0);
    });

    it('DELETE /scheduled-payments/:id - Should cancel a schedule', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/scheduled-payments/${testScheduleId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Service Layer', () => {
    let newScheduleId: string;
    
    it('Should create a schedule through the service', async () => {
      const result = await scheduledPaymentService.createSchedule({
        userId: testUserId,
        name: 'Service Test Payment',
        type: ScheduleType.FIAT_TO_CRYPTO,
        amount: 200,
        currency: 'USD',
        frequency: ScheduleFrequency.WEEKLY,
        nextExecutionDate: addDays(new Date(), 1),
        destinationId: 'SOL'
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data) {
        expect(result.data.userId).toBe(testUserId);
        expect(result.data.name).toBe('Service Test Payment');
        expect(result.data.status).toBe(ScheduleStatus.ACTIVE);
        
        newScheduleId = result.data.id;
      }
    });

    it('Should get user schedules through the service', async () => {
      const result = await scheduledPaymentService.getUserSchedules(testUserId);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data) {
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.data.length).toBeGreaterThan(0);
        
        // Find our test schedule
        const testSchedule = result.data.find(s => s.id === newScheduleId);
        expect(testSchedule).toBeDefined();
        if (testSchedule) {
          expect(testSchedule.name).toBe('Service Test Payment');
        }
      }
    });

    it('Should update a schedule through the service', async () => {
      const result = await scheduledPaymentService.updateSchedule(newScheduleId, {
        name: 'Updated Service Payment',
        amount: 250
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data) {
        expect(result.data.name).toBe('Updated Service Payment');
        expect(result.data.amount).toBe(250);
      }
    });

    it('Should get user stats through the service', async () => {
      const result = await scheduledPaymentService.getUserScheduleStats(testUserId);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data) {
        expect(result.data.total).toBeGreaterThan(0);
        expect(result.data.byType[ScheduleType.FIAT_TO_CRYPTO]).toBeGreaterThan(0);
      }
    });
    
    it('Should cancel a schedule through the service', async () => {
      const result = await scheduledPaymentService.cancelSchedule(newScheduleId);

      expect(result.success).toBe(true);
    });
  });

  describe('Data Access Layer', () => {
    let repoScheduleId: string;
    
    it('Should create a schedule through the repository', async () => {
      const newSchedule = await scheduledPaymentRepository.create({
        userId: testUserId,
        name: 'Repo Test Payment',
        type: ScheduleType.CRYPTO_TO_FIAT,
        amount: 300,
        currency: 'SOL',
        frequency: ScheduleFrequency.BIWEEKLY,
        nextExecutionDate: addDays(new Date(), 2),
        status: ScheduleStatus.ACTIVE,
        executionCount: 0,
        destinationId: 'USD'
      });

      expect(newSchedule).toBeDefined();
      expect(newSchedule.userId).toBe(testUserId);
      expect(newSchedule.name).toBe('Repo Test Payment');
      
      repoScheduleId = newSchedule.id;
    });

    it('Should find a schedule by ID through the repository', async () => {
      const schedule = await scheduledPaymentRepository.findById(repoScheduleId);

      expect(schedule).toBeDefined();
      if (schedule) {
        expect(schedule.id).toBe(repoScheduleId);
        expect(schedule.type).toBe(ScheduleType.CRYPTO_TO_FIAT);
      }
    });

    it('Should find schedules by user ID through the repository', async () => {
      const schedules = await scheduledPaymentRepository.findByUserId(testUserId);

      expect(Array.isArray(schedules)).toBe(true);
      expect(schedules.length).toBeGreaterThan(0);
      
      // Find our test schedule
      const testSchedule = schedules.find(s => s.id === repoScheduleId);
      expect(testSchedule).toBeDefined();
    });

    it('Should update a schedule through the repository', async () => {
      const updatedSchedule = await scheduledPaymentRepository.update(repoScheduleId, {
        name: 'Updated Repo Payment',
        amount: 350
      });

      expect(updatedSchedule).toBeDefined();
      expect(updatedSchedule.name).toBe('Updated Repo Payment');
      expect(updatedSchedule.amount).toBe(350);
    });

    it('Should mark a schedule as cancelled', async () => {
      // Use update instead of delete since the repository doesn't have a delete method
      const updateResult = await scheduledPaymentRepository.update(repoScheduleId, {
        status: ScheduleStatus.CANCELLED
      });
      
      expect(updateResult).toBeDefined();
      expect(updateResult.status).toBe(ScheduleStatus.CANCELLED);
      
      // Verify it's cancelled
      const schedule = await scheduledPaymentRepository.findById(repoScheduleId);
      expect(schedule).toBeDefined();
      if (schedule) {
        expect(schedule.status).toBe(ScheduleStatus.CANCELLED);
      }
    });
  });
});
