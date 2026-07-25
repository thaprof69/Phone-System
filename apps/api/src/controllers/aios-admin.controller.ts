import { Body, Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Principal } from '@quantum-parks/auth';
import { z } from 'zod';
import { RequirePermission } from '../security/access.guard.js';
import { PROVIDER_DEFINITIONS } from '../services/provider-registry.js';
import { AiosPlatformService } from '../services/aios-platform.service.js';

// Any known provider key is accepted at the schema boundary so the service can answer
// with an explicit, readable refusal ("Adapter not installed") rather than a schema
// rejection surfacing as an internal error. The registry guard is the real gate.
const ConnectableProviderSchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9_]+$/, 'Provider keys are uppercase identifiers');

const ProviderSchema = z
  .object({
    providerKey: ConnectableProviderSchema,
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
const ArtefactKindSchema = z.enum(['prompt', 'schema', 'taxonomy']);
const EnvironmentSchema = z.enum(['development', 'staging', 'production']);
const ModelApprovalSchema = z
  .object({
    environment: EnvironmentSchema,
    approved: z.boolean(),
    reason: z.string().trim().min(8).max(500),
  })
  .strict();
const ModelAvailabilitySchema = z.object({ available: z.boolean() }).strict();
const RouteVersionSchema = z
  .object({
    environment: EnvironmentSchema,
    providerConnectionId: z.uuid(),
    modelId: z.uuid(),
    fallbackProviderConnectionId: z.uuid().optional(),
    fallbackModelId: z.uuid().optional(),
    timeoutMs: z.number().int().min(500).max(120_000),
    maximumRetries: z.number().int().min(0).max(5),
    confidenceThreshold: z.number().min(0).max(1),
    maximumCostMicros: z.number().int().min(0).optional(),
  })
  .strict();
const ArtefactTransitionSchema = z
  .object({
    action: z.enum(['SUBMIT', 'APPROVE', 'REJECT', 'ACTIVATE', 'ROLLBACK']),
    reason: z.string().trim().min(8).max(500),
  })
  .strict();
const BudgetSchema = z
  .object({
    key: z.string().trim().min(3).max(80),
    environment: EnvironmentSchema,
    scopeType: z.enum(['PROVIDER', 'MODEL', 'CAPABILITY', 'ENVIRONMENT']),
    scopeId: z.string().trim().min(1).max(120).optional(),
    perRequestLimitMicros: z.number().int().min(0).optional(),
    dailyLimitMicros: z.number().int().min(0).optional(),
    monthlyLimitMicros: z.number().int().min(0).optional(),
    currency: z.string().trim().length(3),
    active: z.boolean(),
  })
  .strict();
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

  /** The code-owned provider registry the connection forms are generated from. */
  @Get('providers/registry')
  providerRegistry() {
    return { items: PROVIDER_DEFINITIONS };
  }

  @Get('models')
  models() {
    return this.aios.modelRegistry();
  }

  @Post('models/:id/approval')
  @RequirePermission('administration.ai.models.approve', 'RELEASE_MANAGEMENT')
  decideModel(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = ModelApprovalSchema.parse(body);
    return this.aios.decideModelApproval({
      modelId: IdSchema.parse(id),
      environment: input.environment,
      approved: input.approved,
      reason: input.reason,
      principal: request.principal,
    });
  }

  @Post('models/:id/availability')
  @RequirePermission('administration.ai.models.approve', 'RELEASE_MANAGEMENT')
  setModelAvailability(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = ModelAvailabilitySchema.parse(body);
    return this.aios.setModelAvailability(IdSchema.parse(id), input.available, request.principal);
  }

  @Get('routes')
  routes() {
    return this.aios.routeRegistry();
  }

  @Post('routes/:id/versions')
  @RequirePermission('administration.ai.routing.manage', 'RELEASE_MANAGEMENT')
  createRouteVersion(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = RouteVersionSchema.parse(body);
    return this.aios.createRouteVersion({
      routeId: IdSchema.parse(id),
      environment: input.environment,
      providerConnectionId: input.providerConnectionId,
      modelId: input.modelId,
      fallbackProviderConnectionId: input.fallbackProviderConnectionId,
      fallbackModelId: input.fallbackModelId,
      timeoutMs: input.timeoutMs,
      maximumRetries: input.maximumRetries,
      confidenceThreshold: input.confidenceThreshold,
      maximumCostMicros: input.maximumCostMicros,
      principal: request.principal,
    });
  }

  @Get('route-versions/:id/validate')
  validateRoute(@Param('id') id: string) {
    return this.aios.validateRouteVersion(IdSchema.parse(id));
  }

  /** Revalidates before activating; the interface cannot bypass this. */
  @Post('route-versions/:id/activate')
  @RequirePermission('administration.ai.routing.manage', 'RELEASE_MANAGEMENT')
  activateRoute(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.aios.activateRouteVersion(IdSchema.parse(id), request.principal);
  }

  @Post('route-versions/:id/disable')
  @RequirePermission('administration.ai.routing.manage', 'RELEASE_MANAGEMENT')
  disableRoute(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.aios.disableRouteVersion(IdSchema.parse(id), request.principal);
  }

  @Get('artefacts/:kind')
  artefacts(@Param('kind') kind: string) {
    return this.aios.governedArtefacts(ArtefactKindSchema.parse(kind));
  }

  @Post('artefacts/:kind/:id/transition')
  @RequirePermission('administration.ai.prompts.approve', 'RELEASE_MANAGEMENT')
  transitionArtefact(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = ArtefactTransitionSchema.parse(body);
    return this.aios.transitionGovernedArtefact({
      kind: ArtefactKindSchema.parse(kind),
      versionId: IdSchema.parse(id),
      action: input.action,
      reason: input.reason,
      principal: request.principal,
    });
  }

  @Get('budgets')
  budgets() {
    return this.aios.budgetStatus();
  }

  @Post('budgets')
  @RequirePermission('administration.ai.routing.manage', 'RELEASE_MANAGEMENT')
  setBudget(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = BudgetSchema.parse(body);
    return this.aios.upsertBudgetPolicy({ ...input, principal: request.principal });
  }

  @Get('execution')
  execution(@Query('limit') limit?: string) {
    const parsed = Number(limit ?? 50);
    return this.aios.executionHistory(
      Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), 200) : 50,
    );
  }

  @Get('monitoring')
  monitoring() {
    return this.aios.monitoringSummary();
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
