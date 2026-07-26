import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { authorize, type Principal } from '@quantum-parks/auth';
import { z } from 'zod';
import { PlatformService } from '../services/platform.service.js';
import { ToolRegistryService } from '../services/tool-registry.service.js';
import { AiosPlatformService } from '../services/aios-platform.service.js';
import { ReceptionistSessionService } from '../services/receptionist-session.service.js';
import { RequirePermission } from '../security/access.guard.js';

const IdSchema = z.uuid();
const ToolKeySchema = z.string().regex(/^[a-z0-9_]+$/);
type AuthenticatedRequest = { principal: Principal };

const DraftFromVersionSchema = z.object({ sourceVersionId: z.uuid().optional() }).strict();
const RollbackSchema = z.object({ targetVersionId: z.uuid() }).strict();
const WorkItemTransitionSchema = z
  .object({
    action: z.enum([
      'ASSIGN',
      'START',
      'COMPLETE',
      'CANCEL',
      'REOPEN',
      'RESCHEDULE',
      'REPRIORITISE',
    ]),
    ownerId: z.uuid().optional(),
    dueAt: z.iso.datetime().optional(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
    note: z.string().trim().min(4).max(500).optional(),
  })
  .strict();
const HandoffTransitionSchema = z
  .object({
    action: z.enum(['COMPLETE', 'FAIL']),
    note: z.string().trim().min(4).max(500).optional(),
  })
  .strict();
const MessageTransitionSchema = z
  .object({
    action: z.enum(['RETRY', 'CANCEL']),
    channel: z.enum(['WHATSAPP', 'SMS', 'EMAIL']).optional(),
  })
  .strict();
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
const UuidSchema = z.uuid();
const KnowledgeEditSchema = z
  .object({
    content: z.string().min(1).max(200_000),
    // Mandatory, and long enough to be a sentence. A version whose reason is "update"
    // is unreviewable six months later.
    changeReason: z.string().trim().min(8).max(500),
    effectiveAt: z.iso.datetime().optional(),
    expiresAt: z.iso.datetime().optional(),
  })
  .strict();
const KnowledgeAssignmentSchema = z
  .object({
    agentVersionId: z.uuid(),
    language: z.string().trim().min(2).max(20),
    park: z.string().trim().min(2).max(100).optional(),
    active: z.boolean(),
  })
  .strict();
const FeatureFlagUpdateSchema = z
  .object({
    enabled: z.boolean(),
    reason: z.string().trim().min(8).max(500),
  })
  .strict();
const RetentionActiveSchema = z
  .object({
    active: z.boolean(),
    reason: z.string().trim().min(8).max(500),
  })
  .strict();
const RetentionApprovalSchema = z
  .object({
    reason: z.string().trim().min(8).max(500),
  })
  .strict();
const LegalHoldCreateSchema = z
  .object({
    scopeType: z.string().trim().min(2).max(50),
    scopeId: z.uuid(),
    reason: z.string().trim().min(8).max(500),
  })
  .strict();
const LegalHoldReleaseSchema = z
  .object({
    reason: z.string().trim().min(8).max(500),
  })
  .strict();
const RoleAssignmentSchema = z
  .object({
    userId: z.uuid(),
    roleId: z.uuid(),
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
const StartVoiceSessionSchema = z.object({ agentVersionId: z.uuid() }).strict();
const AttachVoiceSessionSchema = z
  .object({ providerConversationId: z.string().min(1).max(200) })
  .strict();
const EndVoiceSessionSchema = z
  .object({
    reason: z.string().min(1).max(200),
    errorCode: z.string().min(1).max(100).optional(),
  })
  .strict();
const StartReceptionistSessionSchema = z
  .object({
    agentVersionId: z.uuid(),
    mode: z.enum(['VOICE', 'TEXT']),
    source: z.enum(['SCENARIO', 'MANUAL', 'LIVE']),
    purpose: z.enum(['TEST', 'TRAINING', 'DEBUG', 'VALIDATION']).optional(),
  })
  .strict();
const AttachReceptionistSessionSchema = z
  .object({ providerConversationId: z.string().min(1).max(200) })
  .strict();
const RecordReceptionistTurnSchema = z
  .object({
    role: z.enum(['user', 'agent']),
    text: z.string().min(1).max(4_000),
  })
  .strict();
const SendReceptionistScenarioSchema = z
  .object({
    scenarioKey: z.enum([
      'booking_enquiry',
      'pricing_question',
      'complaint',
      'refund_request',
      'safety_concern',
      'late_arrival',
      'availability_check',
      'human_callback_request',
    ]),
  })
  .strict();
const EndReceptionistSessionSchema = z.object({ reason: z.string().min(1).max(200) }).strict();
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
const ReportScheduleSchema = z.object({ active: z.boolean() }).strict();

@Controller()
export class ControlPlaneController {
  constructor(
    private readonly platform: PlatformService,
    private readonly tools: ToolRegistryService,
    private readonly aios: AiosPlatformService,
    private readonly receptionistSessions: ReceptionistSessionService,
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
  createKnowledge(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = KnowledgeDraftSchema.parse(body);
    return this.platform.createKnowledgeDraft({
      title: parsed.title,
      category: parsed.category,
      language: parsed.language,
      riskClass: parsed.riskClass,
      content: parsed.content,
      principal: request.principal,
      ...(parsed.park === undefined ? {} : { park: parsed.park }),
    });
  }
  // Registered before `knowledge/:id` so the literal path is not swallowed by it.
  @RequirePermission('knowledge:write')
  @Get('knowledge-gaps')
  knowledgeGapsList() {
    return this.platform.listKnowledgeGaps();
  }
  @RequirePermission('knowledge:write')
  @Get('knowledge/:id')
  knowledgeDetail(@Param('id') id: string) {
    return this.platform.knowledgeAsset(UuidSchema.parse(id));
  }
  @RequirePermission('knowledge:write')
  @Post('knowledge/:id/versions')
  editKnowledge(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = KnowledgeEditSchema.parse(body);
    return this.platform.editKnowledgeAsset({
      assetId: UuidSchema.parse(id),
      content: input.content,
      changeReason: input.changeReason,
      principal: request.principal,
      ...(input.effectiveAt === undefined ? {} : { effectiveAt: input.effectiveAt }),
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
    });
  }
  @RequirePermission('knowledge:write')
  @Post('knowledge-versions/:id/submit')
  submitKnowledge(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.platform.submitKnowledgeForReview(UuidSchema.parse(id), request.principal);
  }
  @RequirePermission('knowledge:approve')
  @Post('knowledge-versions/:id/decision')
  decideKnowledge(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = ReviewDecisionSchema.parse(body);
    return this.platform.decideKnowledge(
      UuidSchema.parse(id),
      input.decision,
      input.reason,
      request.principal,
    );
  }
  @RequirePermission('knowledge:write')
  @Post('knowledge-versions/:id/assignments')
  assignKnowledge(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = KnowledgeAssignmentSchema.parse(body);
    return this.platform.assignKnowledge({
      versionId: UuidSchema.parse(id),
      agentVersionId: input.agentVersionId,
      language: input.language,
      active: input.active,
      principal: request.principal,
      ...(input.park === undefined ? {} : { park: input.park }),
    });
  }
  @RequirePermission('knowledge:approve', 'RELEASE_MANAGEMENT')
  @Post('knowledge-syncs/:id/retry')
  retryKnowledgeSync(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.platform.retryKnowledgeSync(UuidSchema.parse(id), request.principal);
  }
  @RequirePermission('knowledge:write')
  @Post('knowledge-gaps/:id/convert')
  convertKnowledgeGap(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.platform.convertGapToDraft(UuidSchema.parse(id), request.principal);
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
  approveVoice(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.platform.approveVoice(UuidSchema.parse(id), request.principal);
  }
  @RequirePermission('agent:write')
  @Post('voice-assignments')
  assignVoice(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = VoiceAssignmentSchema.parse(body);
    return this.platform.assignVoice({ ...input, principal: request.principal });
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
  proposeCorrection(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = CorrectionSchema.parse(body);
    return this.platform.proposeCorrection(id, { ...input, principal: request.principal });
  }
  @RequirePermission('corrections:write', 'QUALITY_REVIEW')
  @Post('corrections/:id/decision')
  decideCorrection(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = CorrectionDecisionSchema.parse(body);
    return this.platform.decideCorrection(id, input.decision, input.reason, request.principal);
  }
  @RequirePermission('calls:read', 'OPERATIONS')
  @Post('calls-reconciliation/run')
  runReconciliation() {
    return this.platform.requestReconciliation();
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
  createTest(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = TestCaseSchema.parse(body);
    return this.platform.createTestCase({ ...input, principal: request.principal });
  }
  @RequirePermission('test:write')
  @Post('test-runs')
  runTests(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = TestRunSchema.parse(body);
    return this.platform.runProviderTests({ ...input, principal: request.principal });
  }
  @RequirePermission('test:write')
  @Post('test-runs/:id/sync')
  syncTestRun(@Param('id') id: string) {
    return this.platform.syncProviderTestRun(id);
  }
  /**
   * Live ElevenLabs Conversational AI session, not a test run — the signed URL is a
   * 15-minute, provider-issued, single-use credential handed to the browser. The
   * permanent API key stays server-side; `voice:live` is distinct from `test:write`
   * because starting a live call is a runtime action, not release authoring.
   */
  @RequirePermission('voice:live')
  @Post('voice-sessions')
  startVoiceSession(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = StartVoiceSessionSchema.parse(body);
    return this.platform.startVoiceSession({ ...input, principal: request.principal });
  }
  @RequirePermission('voice:live')
  @Get('voice-sessions')
  listVoiceSessions(@Query('agentVersionId') agentVersionId?: string) {
    return this.platform.listVoiceSessions(agentVersionId);
  }
  @RequirePermission('voice:live')
  @Get('voice-sessions/:id')
  getVoiceSession(@Param('id') id: string) {
    return this.platform.getVoiceSession(id);
  }
  @RequirePermission('voice:live')
  @Post('voice-sessions/:id/attach')
  attachVoiceSession(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = AttachVoiceSessionSchema.parse(body);
    return this.platform.attachVoiceSessionConversation(id, input, request.principal);
  }
  @RequirePermission('voice:live')
  @Post('voice-sessions/:id/end')
  endVoiceSession(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = EndVoiceSessionSchema.parse(body);
    return this.platform.endVoiceSession(id, input, request.principal);
  }
  /**
   * The Live Receptionist Test workflow — a first-class, reusable operator conversation
   * wrapping a real ElevenLabs voice or text-only session (reusing `startVoiceSession`, never
   * a parallel pipeline). Every customer turn triggers real, governed AIOS evaluation; nothing
   * here is a keyword-matched or fabricated result.
   */
  @RequirePermission('voice:live')
  @Post('receptionist-sessions')
  startReceptionistSession(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = StartReceptionistSessionSchema.parse(body);
    return this.receptionistSessions.startSession({ ...input, principal: request.principal });
  }
  @RequirePermission('voice:live')
  @Get('receptionist-sessions')
  listReceptionistSessions() {
    return this.receptionistSessions.listSessions();
  }
  @RequirePermission('voice:live')
  @Get('receptionist-sessions/recent')
  listRecentReceptionistSessions(@Query('limit') limit?: string) {
    return this.receptionistSessions.listRecentSessions(limit ? Number(limit) : undefined);
  }
  @RequirePermission('voice:live')
  @Get('receptionist-sessions/:id')
  getReceptionistSession(@Param('id') id: string) {
    return this.receptionistSessions.getSession(id);
  }
  @RequirePermission('voice:live')
  @Post('receptionist-sessions/:id/attach')
  attachReceptionistSession(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = AttachReceptionistSessionSchema.parse(body);
    return this.receptionistSessions.attachConversation(id, input, request.principal);
  }
  @RequirePermission('voice:live')
  @Post('receptionist-sessions/:id/turn')
  recordReceptionistTurn(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = RecordReceptionistTurnSchema.parse(body);
    return this.receptionistSessions.recordTurn(id, input, request.principal);
  }
  @RequirePermission('voice:live')
  @Post('receptionist-sessions/:id/preset')
  sendReceptionistScenario(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = SendReceptionistScenarioSchema.parse(body);
    return this.receptionistSessions.sendPresetScenario(id, input.scenarioKey, request.principal);
  }
  @RequirePermission('voice:live')
  @Post('receptionist-sessions/:id/end')
  endReceptionistSession(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = EndReceptionistSessionSchema.parse(body);
    return this.receptionistSessions.endSession(id, input, request.principal);
  }
  @RequirePermission('voice:live')
  @Get('agent-versions/:id/instructions')
  getAgentInstructions(@Param('id') id: string) {
    return this.receptionistSessions.buildAgentInstructionsSnapshot(id);
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
  @RequirePermission('calls:read', 'OPERATIONS')
  @Post('operations/callbacks/:id/transition')
  transitionCallback(@Param('id') id: string, @Body() body: unknown) {
    return this.platform.transitionWorkItem({
      kind: 'callback',
      id: IdSchema.parse(id),
      ...WorkItemTransitionSchema.parse(body),
    });
  }
  @RequirePermission('calls:read', 'OPERATIONS')
  @Post('operations/tasks/:id/transition')
  transitionTask(@Param('id') id: string, @Body() body: unknown) {
    return this.platform.transitionWorkItem({
      kind: 'task',
      id: IdSchema.parse(id),
      ...WorkItemTransitionSchema.parse(body),
    });
  }
  @RequirePermission('calls:read', 'OPERATIONS')
  @Post('operations/handoffs/:id/transition')
  transitionHandoff(@Param('id') id: string, @Body() body: unknown) {
    return this.platform.transitionHandoff({
      id: IdSchema.parse(id),
      ...HandoffTransitionSchema.parse(body),
    });
  }
  @RequirePermission('calls:read', 'OPERATIONS')
  @Post('operations/messages/:id/transition')
  transitionMessage(@Param('id') id: string, @Body() body: unknown) {
    return this.platform.transitionMessage({
      id: IdSchema.parse(id),
      ...MessageTransitionSchema.parse(body),
    });
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
  @Get('analytics/agent-performance')
  analyticsAgentPerformance() {
    return this.platform.analyticsAgentPerformance();
  }
  @RequirePermission('reports:read', 'ANALYTICS')
  @Get('analytics/provider-performance')
  analyticsProviderPerformance() {
    return this.aios.performanceBreakdown();
  }
  @RequirePermission('reports:read', 'ANALYTICS')
  @Get('analytics/costs')
  analyticsCosts() {
    return this.aios.costBreakdown();
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
  @RequirePermission('reports:read', 'ANALYTICS')
  @Post('reports/:id/schedule')
  setReportSchedule(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = ReportScheduleSchema.parse(body);
    return this.platform.setReportDefinitionActive(id, input.active, request.principal);
  }
  @RequirePermission('reports:read', 'ANALYTICS')
  @Post('reports/:id/run')
  runReport(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.platform.runReportNow(id, request.principal);
  }
  @RequirePermission('reports:read', 'ANALYTICS')
  @Post('report-runs/:id/retry')
  retryReportRun(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.platform.retryReportRun(id, request.principal);
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
  @RequirePermission('administration.integrations.manage', 'RELEASE_MANAGEMENT')
  @Post('administration/feature-flags/:id')
  setFeatureFlag(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = FeatureFlagUpdateSchema.parse(body);
    return this.platform.setFeatureFlag(id, input.enabled, input.reason, request.principal);
  }
  @RequirePermission('retention:manage', 'PRIVACY_AUDIT')
  @Post('retention-policies/:id/approve')
  approveRetentionPolicy(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = RetentionApprovalSchema.parse(body);
    return this.platform.approveRetentionPolicy(id, input.reason, request.principal);
  }
  @RequirePermission('retention:manage', 'PRIVACY_AUDIT')
  @Post('retention-policies/:id/active')
  setRetentionPolicyActive(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = RetentionActiveSchema.parse(body);
    return this.platform.setRetentionPolicyActive(
      id,
      input.active,
      input.reason,
      request.principal,
    );
  }
  @RequirePermission('retention:manage', 'PRIVACY_AUDIT')
  @Get('legal-holds')
  legalHolds() {
    return this.platform.listLegalHolds();
  }
  @RequirePermission('retention:manage', 'PRIVACY_AUDIT')
  @Post('legal-holds')
  placeLegalHold(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = LegalHoldCreateSchema.parse(body);
    return this.platform.placeLegalHold(input, request.principal);
  }
  @RequirePermission('retention:manage', 'PRIVACY_AUDIT')
  @Post('legal-holds/:id/release')
  releaseLegalHold(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = LegalHoldReleaseSchema.parse(body);
    return this.platform.releaseLegalHold(id, input.reason, request.principal);
  }
  @RequirePermission('administration.integrations.manage', 'RELEASE_MANAGEMENT')
  @Post('administration/roles/assign')
  assignRole(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = RoleAssignmentSchema.parse(body);
    return this.platform.assignRole(input.userId, input.roleId, request.principal);
  }
  @RequirePermission('administration.integrations.manage', 'RELEASE_MANAGEMENT')
  @Post('administration/roles/revoke')
  revokeRole(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = RoleAssignmentSchema.parse(body);
    return this.platform.revokeRole(input.userId, input.roleId, request.principal);
  }
}
