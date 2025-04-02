import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { ScheduledPaymentService, CreateScheduleDto, ScheduleUpdateDto } from '../../services/core/payment/scheduled-payment.service';
import { Logger } from '../../utils/logger';
import { ScheduleType, ScheduleFrequency, ScheduleStatus } from '../../db/models/scheduled-payment.entity';
import { AuthGuard } from '../../guards/auth.guard';
@ApiTags('scheduled-payments')
@Controller('api/v1/scheduled-payments')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class ScheduledPaymentController {
  constructor(
    private readonly scheduledPaymentService: ScheduledPaymentService,
    private readonly logger: Logger
  ) {
    this.logger = new Logger('ScheduledPaymentController');
  }
  @Post()
  @ApiOperation({ summary: 'Create a new scheduled payment' })
  @ApiResponse({ status: 201, description: 'The scheduled payment has been successfully created.' })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async createSchedule(@Body() createScheduleDto: CreateScheduleDto) {
    this.logger.info(`Creating new scheduled payment for user: ${createScheduleDto.userId}`);
    return await this.scheduledPaymentService.createSchedule(createScheduleDto);
  }
  @Get()
  @ApiOperation({ summary: 'Get all scheduled payments for a user' })
  @ApiResponse({ status: 200, description: 'List of scheduled payments.' })
  @ApiQuery({ name: 'userId', required: true, type: String })
  async getUserSchedules(@Query('userId') userId: string) {
    this.logger.info(`Getting scheduled payments for user: ${userId}`);
    return await this.scheduledPaymentService.getUserSchedules(userId);
  }
  @Get(':id')
  @ApiOperation({ summary: 'Get a scheduled payment by ID' })
  @ApiResponse({ status: 200, description: 'The scheduled payment.' })
  @ApiResponse({ status: 404, description: 'Scheduled payment not found.' })
  @ApiParam({ name: 'id', type: String })
  async getScheduleById(@Param('id') id: string) {
    this.logger.info(`Getting scheduled payment with ID: ${id}`);
    return await this.scheduledPaymentService.getScheduleById(id);
  }
  @Put(':id')
  @ApiOperation({ summary: 'Update a scheduled payment' })
  @ApiResponse({ status: 200, description: 'The scheduled payment has been successfully updated.' })
  @ApiResponse({ status: 404, description: 'Scheduled payment not found.' })
  @ApiParam({ name: 'id', type: String })
  async updateSchedule(
    @Param('id') id: string,
    @Body() updateScheduleDto: ScheduleUpdateDto
  ) {
    this.logger.info(`Updating scheduled payment with ID: ${id}`);
    return await this.scheduledPaymentService.updateSchedule(id, updateScheduleDto);
  }
  @Delete(':id')
  @ApiOperation({ summary: 'Cancel a scheduled payment' })
  @ApiResponse({ status: 200, description: 'The scheduled payment has been successfully cancelled.' })
  @ApiResponse({ status: 404, description: 'Scheduled payment not found.' })
  @ApiParam({ name: 'id', type: String })
  async cancelSchedule(@Param('id') id: string) {
    this.logger.info(`Cancelling scheduled payment with ID: ${id}`);
    return await this.scheduledPaymentService.cancelSchedule(id);
  }
  @Put(':id/pause')
  @ApiOperation({ summary: 'Pause a scheduled payment' })
  @ApiResponse({ status: 200, description: 'The scheduled payment has been successfully paused.' })
  @ApiResponse({ status: 404, description: 'Scheduled payment not found.' })
  @ApiParam({ name: 'id', type: String })
  async pauseSchedule(@Param('id') id: string) {
    this.logger.info(`Pausing scheduled payment with ID: ${id}`);
    return await this.scheduledPaymentService.pauseSchedule(id);
  }
  @Put(':id/resume')
  @ApiOperation({ summary: 'Resume a paused scheduled payment' })
  @ApiResponse({ status: 200, description: 'The scheduled payment has been successfully resumed.' })
  @ApiResponse({ status: 404, description: 'Scheduled payment not found.' })
  @ApiParam({ name: 'id', type: String })
  async resumeSchedule(@Param('id') id: string) {
    this.logger.info(`Resuming scheduled payment with ID: ${id}`);
    return await this.scheduledPaymentService.resumeSchedule(id);
  }
  @Post(':id/execute-now')
  @ApiOperation({ summary: 'Execute a scheduled payment immediately' })
  @ApiResponse({ status: 200, description: 'The scheduled payment has been successfully executed.' })
  @ApiResponse({ status: 404, description: 'Scheduled payment not found.' })
  @ApiParam({ name: 'id', type: String })
  async executeNow(@Param('id') id: string) {
    this.logger.info(`Executing scheduled payment with ID: ${id} immediately`);
    return await this.scheduledPaymentService.executeNow(id);
  }
  @Get('user/:userId/stats')
  @ApiOperation({ summary: 'Get scheduled payment statistics for a user' })
  @ApiResponse({ status: 200, description: 'Scheduled payment statistics.' })
  @ApiParam({ name: 'userId', type: String })
  async getUserScheduleStats(@Param('userId') userId: string) {
    this.logger.info(`Getting scheduled payment statistics for user: ${userId}`);
    return await this.scheduledPaymentService.getUserScheduleStats(userId);
  }
  @Get('supported/frequencies')
  @ApiOperation({ summary: 'Get supported schedule frequencies' })
  @ApiResponse({ status: 200, description: 'List of supported frequencies.' })
  getSupportedFrequencies() {
    return {
      success: true,
      data: Object.values(ScheduleFrequency)
    };
  }
  @Get('supported/types')
  @ApiOperation({ summary: 'Get supported schedule types' })
  @ApiResponse({ status: 200, description: 'List of supported types.' })
  getSupportedTypes() {
    return {
      success: true,
      data: Object.values(ScheduleType)
    };
  }
}
