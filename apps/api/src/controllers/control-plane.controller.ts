import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { authorize, type Principal } from '@quantum-parks/auth';
import { z } from 'zod';
import { PlatformService } from '../services/platform.service.js';
import { ToolRegistryService } from '../services/tool-registry.service.js';
import { RequirePermission } from '../security/access.guard.js';

const IdSchema = z.uuid();
const ToolKeySchema = z.string().regex(/^[a-z0-9_]+$/);
type AuthenticatedRequest = { principal: Principal };

const DraftFromVersionSchema = z.object({ sourceVersionId: z.uuid().optional() }).strict();
const RollbackSchema = z.object({ targetVersionId: z.uuid() }).strict();
const DriftResolutionSchema = z.object({ resolution: z.string().trim().min(8).max(500) }).strict();
const ConfigurationSaveSchema = z
  .object({
    // Validated structurally by the domain contract, not here: this route only needs
    // to know a configuration object and a reason were supplied.
    configuration: z.record(z.string(), z.unknown()),
    changeReason: z.string().trim().min(8).max(500),
  })
  .strict();

const AgentDraftSchema = z
  .object({
    name: z.string().min(2),
    purpose: z.string().min(5),
    configuration: z.record(z.string(), z.unknown()),
    changeReason: z.string().min(5),
  })
  .strict();
const KnowledgeDraftSchema = z
  .object({
    title: z.string().min(2),
    category: z.string().min(2),
    language: z.string().min(2),
    riskClass: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    content: z.string().min(1),
    park: z.string().optional(),
  })
  .strict();
const CorrectionSchema = z
  .object({
    targetType: z.enum([
      'CANONICAL_TRANSCRIPT',
      'REDACTED_TRANSCRIPT',
      'SUMMARY',
      'CLASSIFICATION',
      'ENTITY',
      'CUSTOMER_LINK',
    ]),
    targetRecordId: z.uuid(),
    reason: z.string().min(8),
    proposedValue: z.record(z.string(), z.unknown()),
  })
  .strict();
const CorrectionDecisionSchema = z
  .object({ decision: z.enum(['APPROVE', 'REJECT']), reason: z.string().min(8) })
  .strict();
const ReviewDecisionSchema = z
  .object({ decision: z.enum(['APPROVE', 'REJECT']), reason: z.string().min(8) })
  .strict();
const VoiceAssignmentSchema = z
  .object({
    agentVersionId: z.uuid(),
    voiceProfileId: z.uuid(),
    language: z.string().min(2),
    environment: z.enum(['development', 'staging', 'production']),
    fallback: z.boolean().default(false),
  })
  .strict();
const TestCaseSchema = z
  .object({
    name: z.string().min(3),
    testType: z.string().min(2),
    riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    definition: z.record(z.string(), z.unknown()),
  })
  .strict();
const TestRunSchema = z
  .object({
    agentVersionId: z.uuid(),
    testVersionIds: z.array(z.uuid()).min(1),
    repeatCount: z.number().int().min(1).max(50),
  })
  .strict();
const StaffTaskSchema = z
  .object({
    conversationId: z.uuid(),
    reason: z.string().min(5),
    priority: z.enum(['NORMAL', 'URGENT']),
    dueAt: z.iso.datetime().optional(),
  })
  .strict();
const WorkItemDecisionSchema = z
  .object({
    status: z.enum([
      'OPEN',
      'ASSIGNED',
      'IN_PROGRESS',
      'COMPLETED',
      'FAILED',
      'CANCELLED',
      'EXPIRED',
    ]),
  })
  .strict();
const ReportDefinitionSchema = z
  .object({
    key: z.string().min(3),
    schedule: z.string().min(3),
    classification: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']),
    configuration: z.record(z.string(), z.unknown()),
  })
  .strict();

@Controller()
export class ControlPlaneController {
  constructor(
    private readonly platform: PlatformService,
    private readonly tools: ToolRegistryService,
  ) {}
  @RequirePermission('agent:write')
  @Get('agents')
  agents() {
    return this.platform.listAgents();
  }
  @RequirePermission('agent:write')
  @Post('agents')
  createAgent(@Body() body: unknown) {
    return this.platform.createAgentDraft(AgentDraftSchema.parse(body));
  }
  @RequirePermission('agent:write')
  @Get('tool-contracts')
  toolContracts() {
    return this.tools.listToolContracts();
  }
  @RequirePermission('agent:write')
  @Post('tool-contracts/:key/test')
  testToolContract(@Param('key') key: string) {
    return this.tools.testToolContract(ToolKeySchema.parse(key));
  }
  @RequirePermission('agent:write')
  @Get('agent-versions/compare')
  compareAgentVersions(@Query('left') left: string, @Query('right') right: string) {
    return this.platform.compareAgentVersions(z.uuid().parse(left), z.uuid().parse(right));
  }
  // Declared after `compare` deliberately: a parameterised route registered first
  // would capture the literal path and fail UUID parsing.
  @RequirePermission('agent:write')
  @Get('agent-versions/:id')
  agentVersion(@Param('id') id: string) {
    return this.platform.getAgentVersion(IdSchema.parse(id));
  }
  @RequirePermission('agent:write')
  @Post('agents/:id/draft')
  createAgentVersionDraft(@Param('id') id: string, @Body() body: unknown) {
    const input = DraftFromVersionSchema.parse(body ?? {});
    return this.platform.createAgentVersionDraft(
      IdSchema.parse(id),
      ...(input.sourceVersionId === undefined ? [] : ([input.sourceVersionId] as const)),
    );
  }
  /**
   * Saves an edited configuration. The safety fragments are code-owned, so the
   * privilege to change them is checked here against the principal rather than
   * inferred from what the browser sent.
   */
  @RequirePermission('agent:write')
  @Post('agent-versions/:id/configuration')
  saveAgentConfiguration(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = ConfigurationSaveSchema.parse(body);
    return this.platform.updateAgentVersionConfiguration({
      versionId: IdSchema.parse(id),
      configuration: input.configuration,
      changeReason: input.changeReason,
      allowAdditionalFragments: authorize(request.principal, 'agent:publish', 'RELEASE_MANAGEMENT'),
    });
  }
  @RequirePermission('agent:write')
  @Post('agent-versions/:id/submit')
  submitAgentVersion(@Param('id') id: string) {
    return this.platform.submitAgentVersionForReview(IdSchema.parse(id));
  }
  @RequirePermission('agent:publish', 'RELEASE_MANAGEMENT')
  @Post('agent-releases/:id/decision')
  decideAgent(@Param('id') id: string, @Body() body: unknown) {
    const input = ReviewDecisionSchema.parse(body);
    return this.platform.decideAgentRelease(id, input.decision, input.reason);
  }
  @RequirePermission('test:write', 'RELEASE_MANAGEMENT')
  @Post('agent-releases/:id/stage-for-test')
  stageAgentForTest(@Param('id') id: string) {
    return this.platform.requestAgentTestStaging(id);
  }
  @RequirePermission('agent:publish', 'RELEASE_MANAGEMENT')
  @Post('agent-releases/:id/promote')
  promoteAgent(@Param('id') id: string) {
    return this.platform.promoteAgentRelease(id);
  }
  @RequirePermission('agent:write')
  @Get('agents/:id/release-pipeline')
  releasePipeline(@Param('id') id: string) {
    return this.platform.getReleasePipeline(IdSchema.parse(id));
  }
  /**
   * Reads the published agent back from the provider. Activation follows from the
   * comparison, not from the publish request having returned.
   */
  @RequirePermission('agent:publish', 'RELEASE_MANAGEMENT')
  @Post('agent-versions/:id/verify-read-back')
  verifyReadBack(@Param('id') id: string) {
    return this.platform.verifyDeploymentReadBack(IdSchema.parse(id));
  }
  @RequirePermission('agent:publish', 'RELEASE_MANAGEMENT')
  @Post('agents/:id/rollback')
  rollback(@Param('id') id: string, @Body() body: unknown) {
    const input = RollbackSchema.parse(body);
    return this.platform.rollbackToVersion(IdSchema.parse(id), input.targetVersionId);
  }
  @RequirePermission('agent:publish', 'RELEASE_MANAGEMENT')
  @Post('agent-drift/:id/resolve')
  resolveDrift(@Param('id') id: string, @Body() body: unknown) {
    const input = DriftResolutionSchema.parse(body);
    return this.platform.resolveDriftFinding(IdSchema.parse(id), input.resolution);
  }
  @RequirePermission('agent:publish', 'RELEASE_MANAGEMENT')
  @Post('agent-releases/:id/publish')
  publish(@Param('id') id: string) {
    return this.platform.requestPublication(id);
  }
  @RequirePermission('knowledge:write')
  @Get('knowledge')
  knowledge() {
    return this.platform.listKnowledge();
  }
  @RequirePermission('knowledge:write')
  @Post('knowledge')
  createKnowledge(@Body() body: unknown) {
    const parsed = KnowledgeDraftSchema.parse(body);
    return this.platform.createKnowledgeDraft({
      title: parsed.title,
      category: parsed.category,
      language: parsed.language,
      riskClass: parsed.riskClass,
      content: parsed.content,
      ...(parsed.park === undefined ? {} : { park: parsed.park }),
    });
  }
  @RequirePermission('knowledge:approve')
  @Post('knowledge-versions/:id/decision')
  decideKnowledge(@Param('id') id: string, @Body() body: unknown) {
    const input = ReviewDecisionSchema.parse(body);
    return this.platform.decideKnowledge(id, input.decision, input.reason);
  }
  @RequirePermission('knowledge:approve', 'RELEASE_MANAGEMENT')
  @Post('knowledge-versions/:id/publish')
  publishKnowledge(@Param('id') id: string) {
    return this.platform.requestKnowledgePublication(id);
  }
  @RequirePermission('agent:write')
  @Get('voices')
  voices() {
    return this.platform.listVoices();
  }
  @RequirePermission('agent:write')
  @Post('voices/refresh')
  refreshVoices() {
    return this.platform.refreshVoiceCatalogue();
  }
  @RequirePermission('agent:write')
  @Post('voices/:id/approve')
  approveVoice(@Param('id') id: string) {
    return this.platform.approveVoice(id);
  }
  @RequirePermission('agent:write')
  @Post('voice-assignments')
  assignVoice(@Body() body: unknown) {
    return this.platform.assignVoice(VoiceAssignmentSchema.parse(body));
  }
  @RequirePermission('calls:read', 'OPERATIONS')
  @Get('calls')
  calls(@Query('limit') limit?: string) {
    return this.platform.listCalls(Math.min(Number(limit ?? 50), 100));
  }
  @RequirePermission('calls:read', 'OPERATIONS')
  @Get('calls/:id')
  call(@Param('id') id: string) {
    return this.platform.getCall(id);
  }
  @RequirePermission('calls:read', 'QUALITY_REVIEW')
  @Get('calls/:id/corrections')
  corrections(@Param('id') id: string) {
    return this.platform.listCorrections(id);
  }
  @RequirePermission('corrections:write', 'QUALITY_REVIEW')
  @Post('calls/:id/corrections')
  proposeCorrection(@Param('id') id: string, @Body() body: unknown) {
    return this.platform.proposeCorrection(id, CorrectionSchema.parse(body));
  }
  @RequirePermission('corrections:write', 'QUALITY_REVIEW')
  @Post('corrections/:id/decision')
  decideCorrection(@Param('id') id: string, @Body() body: unknown) {
    const input = CorrectionDecisionSchema.parse(body);
    return this.platform.decideCorrection(id, input.decision, input.reason);
  }
  @RequirePermission('provider:manage')
  @Get('readiness')
  readiness() {
    return this.platform.readiness();
  }
  @RequirePermission('test:write')
  @Get('quality-reviews')
  qualityReviews() {
    return this.platform.listQualityReviews();
  }
  @RequirePermission('knowledge:write')
  @Get('knowledge-releases')
  knowledgeReleases() {
    return this.platform.listKnowledgeReleases();
  }
  @RequirePermission('knowledge:write')
  @Get('knowledge-gaps')
  knowledgeGaps() {
    return this.platform.listKnowledgeGaps();
  }
  @RequirePermission('corrections:write', 'QUALITY_REVIEW')
  @Get('corrections')
  allCorrections() {
    return this.platform.listAllCorrections();
  }
  @RequirePermission('calls:read', 'OPERATIONS')
  @Get('calls-reconciliation')
  reconciliation() {
    return this.platform.listReconciliation();
  }
  /**
   * The operator cockpit. Read-only and aggregated server-side; `calls:read` rather
   * than `provider:manage` because this is an operations view, not a provider control.
   */
  @RequirePermission('calls:read', 'OPERATIONS')
  @Get('mission-control')
  missionControl() {
    return this.platform.missionControl();
  }
  @RequirePermission('test:write')
  @Get('test-suites')
  tests() {
    return this.platform.listTestsAndRuns();
  }
  @RequirePermission('test:write')
  @Post('test-suites')
  createTest(@Body() body: unknown) {
    return this.platform.createTestCase(TestCaseSchema.parse(body));
  }
  @RequirePermission('test:write')
  @Post('test-runs')
  runTests(@Body() body: unknown) {
    return this.platform.runProviderTests(TestRunSchema.parse(body));
  }
  @RequirePermission('test:write')
  @Post('test-runs/:id/sync')
  syncTestRun(@Param('id') id: string) {
    return this.platform.syncProviderTestRun(id);
  }
  @RequirePermission('calls:read', 'OPERATIONS')
  @Get('operations')
  operations() {
    return this.platform.listOperations();
  }
  @RequirePermission('calls:read', 'OPERATIONS')
  @Post('operations/tasks')
  createStaffTask(@Body() body: unknown) {
    const input = StaffTaskSchema.parse(body);
    return this.platform.createStaffTask({
      conversationId: input.conversationId,
      reason: input.reason,
      priority: input.priority,
      ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    });
  }
  @RequirePermission('calls:read', 'OPERATIONS')
  @Post('operations/tasks/:id/status')
  updateStaffTask(@Param('id') id: string, @Body() body: unknown) {
    return this.platform.updateStaffTask(id, WorkItemDecisionSchema.parse(body).status);
  }
  @RequirePermission('reports:read', 'ANALYTICS')
  @Get('analytics/summary')
  analytics() {
    return this.platform.analyticsSummary();
  }
  @RequirePermission('reports:read', 'ANALYTICS')
  @Get('analytics/series')
  analyticsSeries(@Query('days') days?: string) {
    const parsed = Number(days ?? 30);
    return this.platform.analyticsSeries(
      Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), 90) : 30,
    );
  }
  @RequirePermission('reports:read', 'ANALYTICS')
  @Get('reports')
  reports() {
    return this.platform.listReports();
  }
  @RequirePermission('reports:read', 'ANALYTICS')
  @Post('reports')
  createReport(@Body() body: unknown) {
    return this.platform.createReportDefinition(ReportDefinitionSchema.parse(body));
  }
  @RequirePermission('audit:read', 'PRIVACY_AUDIT')
  @Get('audit')
  audit(@Query('limit') limit?: string) {
    return this.platform.listAudit(Math.min(Number(limit ?? 100), 500));
  }
  @RequirePermission('administration.integrations.manage', 'RELEASE_MANAGEMENT')
  @Get('administration/access')
  accessAdministration() {
    return this.platform.listAccessAdministration();
  }
  @RequirePermission('administration.integrations.manage', 'RELEASE_MANAGEMENT')
  @Get('administration/feature-flags')
  featureFlags() {
    return this.platform.listFeatureFlags();
  }
  @RequirePermission('administration.integrations.manage', 'RELEASE_MANAGEMENT')
  @Get('administration/system-configuration')
  systemConfiguration() {
    return this.platform.listSystemConfiguration();
  }
  @RequirePermission('retention:manage', 'PRIVACY_AUDIT')
  @Get('retention-policies')
  retention() {
    return this.platform.listRetentionPolicies();
  }
}
