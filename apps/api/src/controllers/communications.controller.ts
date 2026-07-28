import { Body, Controller, Get, Post } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermission } from '../security/access.guard.js';
import { CommunicationsService } from '../services/communications.service.js';

const AlertDraftSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    detail: z.string().trim().min(3).max(1_000),
    severity: z.enum(['critical', 'high', 'medium']),
    affectedRecords: z.number().int().nonnegative(),
    sourceHref: z.string().startsWith('/').max(300),
    channel: z.enum(['EMAIL', 'WHATSAPP']),
  })
  .strict();

@Controller('admin/communications')
export class CommunicationsController {
  constructor(private readonly communications: CommunicationsService) {}

  @Get('readiness')
  @RequirePermission('administration.integrations.manage', 'RELEASE_MANAGEMENT')
  readiness() {
    return this.communications.readiness();
  }

  @Post('draft-alert')
  @RequirePermission('agent:write', 'OPERATIONS')
  draftAlert(@Body() body: unknown) {
    return this.communications.draftAlert(AlertDraftSchema.parse(body));
  }
}
