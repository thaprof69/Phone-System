import { Body, Controller, Post } from '@nestjs/common';
import {
  intelligenceCapabilityKeys,
  type ExecuteCapabilityRequest,
} from '@quantum-parks/aios-contracts';
import { z } from 'zod';
import { RequirePermission } from '../security/access.guard.js';
import { AiosPlatformService } from '../services/aios-platform.service.js';

const ExecuteSchema = z
  .object({
    capabilityKey: z.enum(intelligenceCapabilityKeys),
    executionContext: z
      .object({
        environment: z.enum(['development', 'staging', 'production']),
        callerService: z.string().min(1).max(100),
        actorId: z.string().min(1).max(200),
        purpose: z.string().min(1).max(100),
        correlationId: z.string().min(1).max(200),
        causationId: z.string().min(1).max(200).optional(),
        sourceRecordId: z.string().min(1).max(200),
        sourceRevisionId: z.string().min(1).max(200),
        language: z.string().max(30).optional(),
        park: z.string().max(100).optional(),
        agentVersionId: z.string().max(200).optional(),
      })
      .strict(),
    contextSources: z
      .array(
        z
          .object({
            sourceType: z.enum([
              'TRANSCRIPT',
              'APPROVED_KNOWLEDGE',
              'TRUSTED_EVENT',
              'CUSTOMER_SNAPSHOT',
              'BOOKING_SNAPSHOT',
              'SUPPORT_SNAPSHOT',
              'RUNTIME_METADATA',
              'PRIOR_ARTIFACT',
              'AGGREGATE_FACT',
            ]),
            sourceId: z.string().min(1).max(200),
          })
          .strict(),
      )
      .min(1)
      .max(2_000),
  })
  .strict();

@Controller('internal/aios')
@RequirePermission('aios.execute', 'OPERATIONS')
export class AiosInternalController {
  constructor(private readonly aios: AiosPlatformService) {}

  @Post('execute')
  execute(@Body() body: unknown) {
    return this.aios.execute(ExecuteSchema.parse(body) as ExecuteCapabilityRequest);
  }
}
