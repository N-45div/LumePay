import { 
  Controller, 
  Post, 
  Body, 
  Headers,
  Param,
  HttpException,
  HttpStatus,
  RawBodyRequest,
  Req
} from '@nestjs/common';
import { WebhookHandlerService, WebhookEvent } from '../../services/core/payment/webhook-handler.service';
import { Request } from 'express';
@Controller('api/webhooks')
export class WebhookController {
  constructor(private webhookHandlerService: WebhookHandlerService) {}
  @Post(':processor')
  async handleWebhook(
    @Param('processor') processor: string,
    @Body() payload: Record<string, any>,
    @Headers() headers: Record<string, string>,
    @Req() request: RawBodyRequest<Request>
  ) {
    const validProcessors = ['stripe', 'paypal', 'plaid'];
    if (!validProcessors.includes(processor.toLowerCase())) {
      throw new HttpException(
        `Invalid processor: ${processor}`,
        HttpStatus.BAD_REQUEST
      );
    }
    const rawBody = request.rawBody ? request.rawBody.toString() : JSON.stringify(payload);
    let signature: string | undefined;
    if (processor.toLowerCase() === 'stripe') {
      signature = headers['stripe-signature'];
    } else if (processor.toLowerCase() === 'paypal') {
      signature = headers['paypal-transmission-sig'];
    } else if (processor.toLowerCase() === 'plaid') {
      signature = headers['plaid-verification'];
    }
    const webhookEvent: WebhookEvent = {
      processorName: processor,
      payload: payload,
      headers: headers,
      signature: signature
    };
    const result = await this.webhookHandlerService.handleWebhook(webhookEvent);
    if (!result.success) {
      throw new HttpException(
        result.message,
        HttpStatus.BAD_REQUEST
      );
    }
    return { 
      success: true,
      message: result.message
    };
  }
}
