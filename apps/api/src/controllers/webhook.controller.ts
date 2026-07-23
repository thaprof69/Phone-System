import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { WebhookIngestionService } from '../services/webhook-ingestion.service.js';

@Controller('webhooks/elevenlabs')
export class WebhookController {
  constructor(private readonly ingestion: WebhookIngestionService) {}
  @Post('post-call')
  @HttpCode(200)
  async postCall(
    @Req() request: RawBodyRequest<FastifyRequest>,
    @Headers('elevenlabs-signature') signature?: string,
    @Headers('x-elevenlabs-workspace-id') workspaceId?: string,
  ) {
    if (!request.rawBody) throw new BadRequestException('Untouched raw body is required');
    const result = await this.ingestion.accept(request.rawBody, signature, workspaceId);
    if (result.status !== 'ACCEPTED') {
      if (result.status === 'UNAUTHORIZED') throw new UnauthorizedException(result.message);
      if (result.status === 'REJECTED') throw new BadRequestException(result.message);
      throw new ServiceUnavailableException(result.message);
    }
    return {
      status: 'received',
      inboxId: result.inboxId,
      duplicate: result.duplicate,
      processingQueued: result.processingQueued,
    };
  }
}
