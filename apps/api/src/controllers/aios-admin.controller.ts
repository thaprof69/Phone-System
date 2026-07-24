import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import type { Principal } from '@quantum-parks/auth';
import { z } from 'zod';
import { RequirePermission } from '../security/access.guard.js';
import { AiosPlatformService } from '../services/aios-platform.service.js';

const ProviderSchema = z
  .object({
    providerKey: z.literal('OPENAI'),
    apiKey: z.string().min(20).max(512),
    connectionLabel: z.string().trim().min(2).max(100),
    environment: z.enum(['development', 'staging', 'production']),
    region: z.string().trim().min(2).max(100).optional(),
    approvedDataRegion: z.string().trim().min(2).max(100).optional(),
    organizationReference: z.string().trim().min(2).max(200).optional(),
  })
  .strict();
const ConnectSchema = ProviderSchema.extend({
  validationProof: z.string().min(20).max(2_000),
}).strict();
const IdSchema = z.string().uuid();
type AuthenticatedRequest = { principal: Principal };

@Controller('admin/ai')
@RequirePermission('administration.ai.view', 'RELEASE_MANAGEMENT')
export class AiosAdminController {
  constructor(private readonly aios: AiosPlatformService) {}

  @Get('overview')
  overview() {
    return this.aios.overview();
  }

  @Get('catalogue')
  catalogue() {
    return this.aios.catalogue();
  }

  @Get('workspace')
  workspace() {
    return this.aios.workspaceView();
  }

  @Post('readiness/evaluate')
  @RequirePermission('administration.ai.health.manage', 'RELEASE_MANAGEMENT')
  readiness() {
    return this.aios.evaluateReadiness();
  }

  @Post('providers/test')
  @RequirePermission('administration.ai.providers.manage', 'RELEASE_MANAGEMENT')
  test(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.aios.testProvider(ProviderSchema.parse(body), request.principal);
  }

  @Post('providers/connect')
  @RequirePermission('administration.ai.providers.manage', 'RELEASE_MANAGEMENT')
  connect(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.aios.connectProvider(ConnectSchema.parse(body), request.principal);
  }

  @Post('providers/:id/discover-models')
  @RequirePermission('administration.ai.models.approve', 'RELEASE_MANAGEMENT')
  discover(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.aios.discoverModels(IdSchema.parse(id), request.principal);
  }

  @Delete('providers/:id')
  @RequirePermission('administration.ai.providers.manage', 'RELEASE_MANAGEMENT')
  disconnect(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.aios.disconnectProvider(IdSchema.parse(id), request.principal);
  }
}
