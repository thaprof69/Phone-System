import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  agentApprovals,
  agentConfigVersions,
  agentDeployments,
  agentDriftFindings,
  agentTests,
  agentTestVersions,
  auditEvents,
  callbackRequests,
  callClassifications,
  callEntities,
  callOutcomes,
  callSummaries,
  conversations,
  correctionHistory,
  corrections,
  customerLinks,
  handoffs,
  knowledgeAssets,
  knowledgeApprovals,
  knowledgeSyncs,
  knowledgeVersions,
  messageDeliveries,
  providerConversations,
  providerTestMappings,
  providerWorkspaces,
  reportDefinitions,
  reportRuns,
  retentionPolicies,
  staffTasks,
  testRuns,
  testEvidence,
  toolInvocations,
  transcriptRevisions,
  transcriptTurns,
  voiceAssignments,
  voiceAgents,
  voiceProfiles,
} from '@quantum-parks/db';
import {
  HttpElevenLabsAdapter,
  type ElevenLabsPort,
  type ProviderTestRun,
} from '@quantum-parks/elevenlabs';
import { runtimeSecret } from '@quantum-parks/config';
import { evaluateReleaseGate, type ReleaseDependency } from '@quantum-parks/domain';
import { DeterministicLocalProvider, OpenAIResponsesProvider } from '@quantum-parks/intelligence';
import { DatabaseService } from './database.service.js';
import { WorkflowDispatchService } from './workflow-dispatch.service.js';
import { ElevenLabsIntegrationService } from './elevenlabs-integration.service.js';

const developmentActorId = '00000000-0000-4000-8000-000000000001';

@Injectable()
export class PlatformService {
  constructor(
    private readonly database: DatabaseService,
    private readonly workflows: WorkflowDispatchService,
    private readonly elevenLabsIntegration: ElevenLabsIntegrationService,
  ) {}

  private async providerAdapter(): Promise<ElevenLabsPort> {
    const configured = await this.elevenLabsIntegration.resolveActiveCredential();
    if (configured) {
      const production =
        configured.integration.environment === 'PRODUCTION' ||
        (process.env.QP_ENVIRONMENT ?? 'development') === 'production';
      return new HttpElevenLabsAdapter({
        baseUrl: production
          ? 'https://api.elevenlabs.io'
          : (process.env.ELEVENLABS_SANDBOX_BASE_URL ?? 'http://localhost:4100'),
        apiKeyReference: `integration/${configured.integration.id}`,
        workspaceId: 'configured-provider-workspace',
        resolveSecret: async () => configured.apiKey,
      });
    }
    return new HttpElevenLabsAdapter({
      baseUrl: process.env.ELEVENLABS_BASE_URL ?? 'http://localhost:4100',
      apiKeyReference: process.env.ELEVENLABS_SECRET_REF ?? 'local/elevenlabs/api-key',
      workspaceId: process.env.ELEVENLABS_WORKSPACE_ID ?? 'workspace_synthetic',
      resolveSecret: async () => runtimeSecret('LOCAL_ELEVENLABS_API_KEY', 'synthetic-api-key'),
    });
  }

  async providerHealth() {
    const result = await (await this.providerAdapter()).getWorkspace();
    return { provider: 'ELEVENLABS', result, checkedAt: new Date().toISOString() };
  }

  async providerCapabilities() {
    return (await this.providerAdapter()).getCapabilities();
  }

  async requestReconciliation() {
    const workspaceId = process.env.ELEVENLABS_WORKSPACE_ID ?? 'workspace_synthetic';
    const dispatched = await this.workflows.dispatchReconciliation(workspaceId);
    return {
      status: dispatched.queued ? 'QUEUED' : 'TEMPORARILY_UNAVAILABLE',
      workflowId: dispatched.workflowId,
      authoritativeDirection: 'LOCAL_TO_REMOTE',
    };
  }

  async listAgents() {
    const items = await this.database.db
      .select({
        id: voiceAgents.id,
        name: voiceAgents.name,
        purpose: voiceAgents.purpose,
        synthetic: voiceAgents.synthetic,
        versionId: agentConfigVersions.id,
        version: agentConfigVersions.version,
        state: agentConfigVersions.state,
        checksum: agentConfigVersions.checksum,
        createdAt: agentConfigVersions.createdAt,
      })
      .from(voiceAgents)
      .leftJoin(agentConfigVersions, eq(agentConfigVersions.agentId, voiceAgents.id))
      .orderBy(desc(voiceAgents.createdAt));
    return { items, nextCursor: null };
  }

  async createAgentDraft(input: {
    name: string;
    purpose: string;
    configuration: Record<string, unknown>;
    changeReason: string;
  }) {
    const checksum = createHash('sha256').update(JSON.stringify(input.configuration)).digest('hex');
    return this.database.db.transaction(async (tx) => {
      const [agent] = await tx
        .insert(voiceAgents)
        .values({
          name: input.name,
          purpose: input.purpose,
          synthetic: (process.env.ELEVENLABS_CAPABILITY_MODE ?? 'simulator') !== 'live',
        })
        .returning({ id: voiceAgents.id });
      if (!agent) throw new Error('Agent record was not created');
      const [version] = await tx
        .insert(agentConfigVersions)
        .values({
          agentId: agent.id,
          version: 1,
          configuration: input.configuration,
          checksum,
          changeReason: input.changeReason,
          authorId: process.env.QP_SYSTEM_ACTOR_ID ?? developmentActorId,
          synthetic: (process.env.ELEVENLABS_CAPABILITY_MODE ?? 'simulator') !== 'live',
        })
        .returning();
      if (!version) throw new Error('Agent draft was not created');
      return { ...version, name: input.name, purpose: input.purpose };
    });
  }

  async decideAgentRelease(id: string, decision: 'APPROVE' | 'REJECT', reason: string) {
    const version = await this.database.db.query.agentConfigVersions.findFirst({
      where: eq(agentConfigVersions.id, id),
    });
    if (!version) return { status: 'NOT_FOUND' };
    if (!['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED'].includes(version.state))
      return { status: 'CONFLICT', currentState: version.state };
    const reviewerId = process.env.QP_SYSTEM_ACTOR_ID ?? developmentActorId;
    if (
      decision === 'APPROVE' &&
      process.env.QP_ENVIRONMENT === 'production' &&
      reviewerId === version.authorId
    ) {
      return { status: 'BLOCKED', blockers: ['Agent releases require an independent approver'] };
    }
    const nextState =
      decision === 'APPROVE' ? ('APPROVED_FOR_TEST' as const) : ('CHANGES_REQUESTED' as const);
    return this.database.db.transaction(async (tx) => {
      await tx
        .insert(agentApprovals)
        .values({
          agentVersionId: id,
          reviewerId,
          decision: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          reason,
        })
        .onConflictDoUpdate({
          target: [agentApprovals.agentVersionId, agentApprovals.reviewerId],
          set: {
            decision: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
            reason,
            createdAt: new Date(),
          },
        });
      const [updated] = await tx
        .update(agentConfigVersions)
        .set({ state: nextState })
        .where(eq(agentConfigVersions.id, id))
        .returning();
      return {
        status: decision === 'APPROVE' ? 'APPROVED_FOR_TEST' : 'CHANGES_REQUESTED',
        release: updated,
      };
    });
  }

  async requestAgentTestStaging(id: string) {
    const version = await this.database.db.query.agentConfigVersions.findFirst({
      where: eq(agentConfigVersions.id, id),
    });
    if (!version) return { status: 'NOT_FOUND' };
    const blockers: string[] = [];
    if (version.state !== 'APPROVED_FOR_TEST')
      blockers.push(`Release is ${version.state}, not APPROVED_FOR_TEST`);
    const approvals = await this.database.db
      .select()
      .from(agentApprovals)
      .where(eq(agentApprovals.agentVersionId, id));
    if (!approvals.some((approval) => approval.decision === 'APPROVED'))
      blockers.push('Required approval evidence is incomplete');
    if (process.env.QP_ENVIRONMENT === 'production' && version.synthetic)
      blockers.push('Synthetic agent releases are forbidden in production');
    if (blockers.length) return { status: 'BLOCKED', releaseId: id, blockers };
    const dispatched = await this.workflows.dispatchAgentTestStaging(id);
    return {
      status: dispatched.queued ? 'QUEUED' : 'TEMPORARILY_UNAVAILABLE',
      releaseId: id,
      workflowId: dispatched.workflowId,
    };
  }

  async promoteAgentRelease(id: string) {
    const version = await this.database.db.query.agentConfigVersions.findFirst({
      where: eq(agentConfigVersions.id, id),
    });
    if (!version) return { status: 'NOT_FOUND' };
    const [approvals, runs, drift] = await Promise.all([
      this.database.db.select().from(agentApprovals).where(eq(agentApprovals.agentVersionId, id)),
      this.database.db.select().from(testRuns).where(eq(testRuns.agentVersionId, id)),
      this.database.db
        .select({ id: agentDriftFindings.id })
        .from(agentDriftFindings)
        .innerJoin(agentDeployments, eq(agentDriftFindings.deploymentId, agentDeployments.id))
        .where(and(eq(agentDeployments.agentVersionId, id), isNull(agentDriftFindings.resolvedAt))),
    ]);
    const blockers: string[] = [];
    if (version.state !== 'TEST_PASSED')
      blockers.push(`Release is ${version.state}, not TEST_PASSED`);
    if (!approvals.some((approval) => approval.decision === 'APPROVED'))
      blockers.push('Required approval evidence is incomplete');
    if (!runs.some((run) => run.status === 'COMPLETED' && run.failCount === 0 && run.passCount > 0))
      blockers.push('Mandatory provider tests have not passed');
    if (drift.length) blockers.push('Unresolved provider drift exists');
    if (blockers.length) return { status: 'BLOCKED', releaseId: id, blockers };
    const [updated] = await this.database.db
      .update(agentConfigVersions)
      .set({ state: 'APPROVED_FOR_PUBLISH' })
      .where(eq(agentConfigVersions.id, id))
      .returning();
    return { status: 'APPROVED_FOR_PUBLISH', release: updated };
  }

  async requestPublication(id: string) {
    const version = await this.database.db.query.agentConfigVersions.findFirst({
      where: eq(agentConfigVersions.id, id),
    });
    if (!version) return { status: 'NOT_FOUND' };
    const [approvals, runs, deployments, drift] = await Promise.all([
      this.database.db.select().from(agentApprovals).where(eq(agentApprovals.agentVersionId, id)),
      this.database.db.select().from(testRuns).where(eq(testRuns.agentVersionId, id)),
      this.database.db
        .select()
        .from(agentDeployments)
        .where(eq(agentDeployments.agentVersionId, id)),
      this.database.db
        .select({ id: agentDriftFindings.id })
        .from(agentDriftFindings)
        .innerJoin(agentDeployments, eq(agentDriftFindings.deploymentId, agentDeployments.id))
        .where(and(eq(agentDeployments.agentVersionId, id), isNull(agentDriftFindings.resolvedAt))),
    ]);
    const blockers: string[] = [];
    if (version.state !== 'APPROVED_FOR_PUBLISH')
      blockers.push(`Release is ${version.state}, not APPROVED_FOR_PUBLISH`);
    if (!approvals.some((approval) => approval.decision === 'APPROVED'))
      blockers.push('Required approval evidence is incomplete');
    if (!runs.some((run) => run.status === 'COMPLETED' && run.failCount === 0))
      blockers.push('Mandatory tests have not passed');
    if (drift.length) blockers.push('Unresolved provider drift exists');
    if ((process.env.ELEVENLABS_CAPABILITY_MODE ?? 'simulator') !== 'live')
      blockers.push('Synthetic provider dependencies are forbidden in production');
    if (deployments.some((deployment) => deployment.syncState === 'DRIFTED'))
      blockers.push('An existing provider mapping is drifted');
    if (blockers.length) return { status: 'BLOCKED', releaseId: id, blockers };
    const dispatched = await this.workflows.dispatchAgentPublication(id);
    return {
      status: dispatched.queued ? 'QUEUED' : 'TEMPORARILY_UNAVAILABLE',
      releaseId: id,
      workflowId: dispatched.workflowId,
    };
  }

  async listKnowledge() {
    const items = await this.database.db
      .select({
        id: knowledgeAssets.id,
        title: knowledgeAssets.title,
        category: knowledgeAssets.category,
        park: knowledgeAssets.park,
        language: knowledgeAssets.language,
        riskClass: knowledgeAssets.riskClass,
        synthetic: knowledgeAssets.synthetic,
        versionId: knowledgeVersions.id,
        version: knowledgeVersions.version,
        state: knowledgeVersions.state,
        checksum: knowledgeVersions.contentChecksum,
        effectiveAt: knowledgeVersions.effectiveAt,
        expiresAt: knowledgeVersions.expiresAt,
      })
      .from(knowledgeAssets)
      .leftJoin(knowledgeVersions, eq(knowledgeVersions.assetId, knowledgeAssets.id))
      .orderBy(desc(knowledgeAssets.createdAt));
    return { items, nextCursor: null };
  }

  async createKnowledgeDraft(input: {
    title: string;
    category: string;
    language: string;
    riskClass: 'LOW' | 'MEDIUM' | 'HIGH';
    content: string;
    park?: string;
  }) {
    const checksum = createHash('sha256').update(input.content).digest('hex');
    return this.database.db.transaction(async (tx) => {
      const [asset] = await tx
        .insert(knowledgeAssets)
        .values({
          title: input.title,
          sourceType: 'AUTHORED_TEXT',
          category: input.category,
          ...(input.park ? { park: input.park } : {}),
          language: input.language,
          ownerId: process.env.QP_SYSTEM_ACTOR_ID ?? developmentActorId,
          riskClass: input.riskClass,
          synthetic: (process.env.QP_ENVIRONMENT ?? 'development') !== 'production',
        })
        .returning({ id: knowledgeAssets.id });
      if (!asset) throw new Error('Knowledge asset was not created');
      const [version] = await tx
        .insert(knowledgeVersions)
        .values({
          assetId: asset.id,
          version: 1,
          content: input.content,
          contentChecksum: checksum,
          changeReason: 'Initial authored draft',
          createdBy: process.env.QP_SYSTEM_ACTOR_ID ?? developmentActorId,
        })
        .returning();
      if (!version) throw new Error('Knowledge draft was not created');
      return {
        ...version,
        title: input.title,
        category: input.category,
        language: input.language,
        riskClass: input.riskClass,
        ...(input.park ? { park: input.park } : {}),
      };
    });
  }

  async decideKnowledge(id: string, decision: 'APPROVE' | 'REJECT', reason: string) {
    const version = await this.database.db.query.knowledgeVersions.findFirst({
      where: eq(knowledgeVersions.id, id),
    });
    if (!version) return { status: 'NOT_FOUND' };
    if (!['DRAFT', 'IN_REVIEW'].includes(version.state))
      return { status: 'CONFLICT', currentState: version.state };
    const asset = await this.database.db.query.knowledgeAssets.findFirst({
      where: eq(knowledgeAssets.id, version.assetId),
    });
    const reviewerId = process.env.QP_SYSTEM_ACTOR_ID ?? developmentActorId;
    if (decision === 'APPROVE' && asset?.riskClass === 'HIGH' && version.createdBy === reviewerId)
      return {
        status: 'BLOCKED',
        blockers: ['High-risk knowledge requires an independent approver'],
      };
    const nextState = decision === 'APPROVE' ? ('APPROVED' as const) : ('DRAFT' as const);
    return this.database.db.transaction(async (tx) => {
      await tx.insert(knowledgeApprovals).values({
        knowledgeVersionId: id,
        reviewerId,
        decision: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        reason,
      });
      const [updated] = await tx
        .update(knowledgeVersions)
        .set({ state: nextState })
        .where(eq(knowledgeVersions.id, id))
        .returning();
      return { status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', release: updated };
    });
  }

  async requestKnowledgePublication(id: string) {
    const version = await this.database.db.query.knowledgeVersions.findFirst({
      where: eq(knowledgeVersions.id, id),
    });
    if (!version) return { status: 'NOT_FOUND' };
    const asset = await this.database.db.query.knowledgeAssets.findFirst({
      where: eq(knowledgeAssets.id, version.assetId),
    });
    const blockers: string[] = [];
    if (version.state !== 'APPROVED') blockers.push(`Knowledge release is ${version.state}`);
    if (version.effectiveAt && version.effectiveAt > new Date())
      blockers.push('Knowledge release is not yet effective');
    if (version.expiresAt && version.expiresAt <= new Date()) blockers.push('Knowledge is expired');
    if (process.env.QP_ENVIRONMENT === 'production' && asset?.synthetic)
      blockers.push('Synthetic knowledge is forbidden in production');
    const existingSync = await this.database.db.query.knowledgeSyncs.findFirst({
      where: eq(knowledgeSyncs.knowledgeVersionId, id),
    });
    if (existingSync?.syncState === 'DRIFTED')
      blockers.push('Provider knowledge mapping is drifted');
    if (blockers.length) return { status: 'BLOCKED', blockers };
    const dispatched = await this.workflows.dispatchKnowledgePublication(id);
    return {
      status: dispatched.queued ? 'QUEUED' : 'TEMPORARILY_UNAVAILABLE',
      releaseId: id,
      workflowId: dispatched.workflowId,
    };
  }

  async listVoices() {
    const items = await this.database.db.select().from(voiceProfiles).orderBy(voiceProfiles.name);
    return { status: 'SUCCESS', data: items };
  }

  async refreshVoiceCatalogue() {
    const workspace = await this.database.db.query.providerWorkspaces.findFirst({
      where: eq(
        providerWorkspaces.providerWorkspaceId,
        process.env.ELEVENLABS_WORKSPACE_ID ?? 'workspace_synthetic',
      ),
    });
    if (!workspace) return { status: 'NOT_CONFIGURED' };
    const remote = await (await this.providerAdapter()).listVoices();
    if (remote.status !== 'SUCCESS') return remote;
    let synchronized = 0;
    for (const voice of remote.data) {
      const providerVoiceId = typeof voice.voice_id === 'string' ? voice.voice_id : undefined;
      if (!providerVoiceId) continue;
      await this.database.db
        .insert(voiceProfiles)
        .values({
          providerVoiceId,
          workspaceId: workspace.id,
          name: typeof voice.name === 'string' ? voice.name : providerVoiceId,
          metadata: voice,
          custom: false,
          lastVerifiedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [voiceProfiles.workspaceId, voiceProfiles.providerVoiceId],
          set: {
            name: typeof voice.name === 'string' ? voice.name : providerVoiceId,
            metadata: voice,
            available: true,
            lastVerifiedAt: new Date(),
            updatedAt: new Date(),
          },
        });
      synchronized += 1;
    }
    return { status: 'SUCCESS', synchronized };
  }

  async approveVoice(id: string) {
    const [voice] = await this.database.db
      .update(voiceProfiles)
      .set({ approved: true, updatedAt: new Date() })
      .where(and(eq(voiceProfiles.id, id), eq(voiceProfiles.available, true)))
      .returning();
    return voice ? { status: 'APPROVED', voice } : { status: 'NOT_FOUND' };
  }

  async assignVoice(input: {
    agentVersionId: string;
    voiceProfileId: string;
    language: string;
    environment: 'development' | 'staging' | 'production';
    fallback: boolean;
  }) {
    const [agent, voice] = await Promise.all([
      this.database.db.query.agentConfigVersions.findFirst({
        where: eq(agentConfigVersions.id, input.agentVersionId),
      }),
      this.database.db.query.voiceProfiles.findFirst({
        where: eq(voiceProfiles.id, input.voiceProfileId),
      }),
    ]);
    if (!agent || !voice) return { status: 'NOT_FOUND' };
    if (!voice.approved || !voice.available)
      return { status: 'BLOCKED', blockers: ['Voice is unavailable or not locally approved'] };
    if (
      input.environment === 'production' &&
      !process.env.NATIVE_LANGUAGE_APPROVALS?.includes(input.language)
    )
      return { status: 'BLOCKED', blockers: ['Language lacks native-speaker approval evidence'] };
    const [assignment] = await this.database.db
      .insert(voiceAssignments)
      .values({ ...input, approved: true })
      .onConflictDoUpdate({
        target: [
          voiceAssignments.agentVersionId,
          voiceAssignments.language,
          voiceAssignments.environment,
          voiceAssignments.fallback,
        ],
        set: { voiceProfileId: input.voiceProfileId, approved: true, updatedAt: new Date() },
      })
      .returning();
    return { status: 'ASSIGNED', assignment, providerVoiceId: voice.providerVoiceId };
  }

  async listCalls(limit: number) {
    const items = await this.database.db
      .select({
        id: conversations.id,
        providerConversationId: providerConversations.providerConversationId,
        providerAgentId: providerConversations.providerAgentId,
        processingState: conversations.processingState,
        language: conversations.language,
        park: conversations.park,
        sensitive: conversations.sensitive,
        synthetic: conversations.synthetic,
        receivedAt: conversations.createdAt,
      })
      .from(conversations)
      .innerJoin(
        providerConversations,
        eq(conversations.providerConversationId, providerConversations.id),
      )
      .orderBy(desc(conversations.createdAt))
      .limit(limit);
    return { items, nextCursor: null };
  }

  async getCall(id: string) {
    const call = await this.database.db
      .select({
        id: conversations.id,
        processingState: conversations.processingState,
        language: conversations.language,
        park: conversations.park,
        sensitive: conversations.sensitive,
        synthetic: conversations.synthetic,
        providerConversationId: providerConversations.providerConversationId,
        providerAgentId: providerConversations.providerAgentId,
        providerBranchId: providerConversations.providerBranchId,
        providerVersionId: providerConversations.providerVersionId,
        providerMetadata: providerConversations.providerMetadata,
        providerAnalysisMetadata: providerConversations.providerAnalysis,
      })
      .from(conversations)
      .innerJoin(
        providerConversations,
        eq(conversations.providerConversationId, providerConversations.id),
      )
      .where(eq(conversations.id, id))
      .limit(1);
    if (!call[0]) return { status: 'NOT_FOUND' };
    const revisions = await this.database.db
      .select()
      .from(transcriptRevisions)
      .where(eq(transcriptRevisions.conversationId, id))
      .orderBy(transcriptRevisions.revision);
    const allowedRevision =
      revisions.find((revision) => revision.revisionType === 'REDACTED') ??
      revisions.find((revision) => revision.revisionType === 'CANONICAL');
    const [turns, summaries, classifications, outcomes, tools] = await Promise.all([
      allowedRevision
        ? this.database.db
            .select()
            .from(transcriptTurns)
            .where(eq(transcriptTurns.revisionId, allowedRevision.id))
            .orderBy(transcriptTurns.sequence)
        : Promise.resolve([]),
      this.database.db
        .select()
        .from(callSummaries)
        .where(eq(callSummaries.conversationId, id))
        .orderBy(desc(callSummaries.revision)),
      this.database.db
        .select()
        .from(callClassifications)
        .where(eq(callClassifications.conversationId, id))
        .orderBy(desc(callClassifications.revision)),
      this.database.db
        .select()
        .from(callOutcomes)
        .where(eq(callOutcomes.conversationId, id))
        .orderBy(desc(callOutcomes.createdAt)),
      this.database.db
        .select()
        .from(toolInvocations)
        .where(eq(toolInvocations.conversationId, id))
        .orderBy(toolInvocations.requestedAt),
    ]);
    return {
      ...call[0],
      transcriptRevision: allowedRevision ?? null,
      transcriptTurns: turns,
      summaries,
      classifications,
      deterministicOutcomes: outcomes,
      toolInvocations: tools,
    };
  }

  async listCorrections(conversationId: string) {
    const items = await this.database.db
      .select()
      .from(corrections)
      .where(eq(corrections.conversationId, conversationId))
      .orderBy(desc(corrections.createdAt));
    return { items };
  }

  async listTestsAndRuns() {
    const [tests, runs] = await Promise.all([
      this.database.db.select().from(agentTests).orderBy(desc(agentTests.createdAt)),
      this.database.db.select().from(testRuns).orderBy(desc(testRuns.startedAt)),
    ]);
    return { tests, runs };
  }

  async createTestCase(input: {
    name: string;
    testType: string;
    riskLevel: string;
    definition: Record<string, unknown>;
  }) {
    const actorId = process.env.QP_SYSTEM_ACTOR_ID ?? developmentActorId;
    const checksum = createHash('sha256').update(JSON.stringify(input.definition)).digest('hex');
    return this.database.db.transaction(async (tx) => {
      const [test] = await tx
        .insert(agentTests)
        .values({
          name: input.name,
          ownerId: actorId,
          testType: input.testType,
          riskLevel: input.riskLevel,
        })
        .returning();
      if (!test) throw new Error('Test case was not persisted');
      const [version] = await tx
        .insert(agentTestVersions)
        .values({ testId: test.id, version: 1, definition: input.definition, checksum })
        .returning();
      return { status: 'CREATED', test, version };
    });
  }

  async runProviderTests(input: {
    agentVersionId: string;
    testVersionIds: string[];
    repeatCount: number;
  }) {
    const release = await this.database.db.query.agentConfigVersions.findFirst({
      where: eq(agentConfigVersions.id, input.agentVersionId),
    });
    if (!release) return { status: 'NOT_FOUND', message: 'Agent release does not exist' };
    if (!['TESTING', 'TEST_FAILED'].includes(release.state))
      return {
        status: 'BLOCKED',
        blockers: [`Agent release is ${release.state}, not ready for tests`],
      };
    const deployment = await this.database.db.query.agentDeployments.findFirst({
      where: and(
        eq(agentDeployments.agentVersionId, input.agentVersionId),
        eq(agentDeployments.syncState, 'IN_SYNC'),
      ),
    });
    if (!deployment?.providerAgentId)
      return { status: 'BLOCKED', blockers: ['Agent release has no in-sync provider mapping'] };
    const versions = await this.database.db
      .select({
        id: agentTestVersions.id,
        definition: agentTestVersions.definition,
        name: agentTests.name,
      })
      .from(agentTestVersions)
      .innerJoin(agentTests, eq(agentTestVersions.testId, agentTests.id))
      .where(inArray(agentTestVersions.id, input.testVersionIds));
    if (versions.length !== input.testVersionIds.length)
      return { status: 'NOT_FOUND', message: 'One or more local test versions do not exist' };
    const provider = await this.providerAdapter();
    const mappings: Array<{ testVersionId: string; providerTestId: string }> = [];
    for (const version of versions) {
      const existing = await this.database.db.query.providerTestMappings.findFirst({
        where: and(
          eq(providerTestMappings.testVersionId, version.id),
          eq(providerTestMappings.workspaceId, deployment.workspaceId),
        ),
      });
      let providerTestId = existing?.providerTestId ?? null;
      if (!providerTestId || existing?.syncState !== 'IN_SYNC') {
        const created = await provider.createTest({
          ...version.definition,
          name: version.name,
        });
        if (created.status !== 'SUCCESS') return created;
        providerTestId = created.data.testId;
        await this.database.db
          .insert(providerTestMappings)
          .values({
            testVersionId: version.id,
            workspaceId: deployment.workspaceId,
            providerTestId,
            syncState: 'IN_SYNC',
          })
          .onConflictDoUpdate({
            target: [providerTestMappings.testVersionId, providerTestMappings.workspaceId],
            set: { providerTestId, syncState: 'IN_SYNC', updatedAt: new Date() },
          });
      }
      mappings.push({ testVersionId: version.id, providerTestId });
    }
    const remote = await provider.runTests(
      deployment.providerAgentId,
      mappings.map((mapping) => mapping.providerTestId),
      input.repeatCount,
      deployment.providerBranchId ?? undefined,
    );
    if (remote.status !== 'SUCCESS') return remote;
    const [run] = await this.database.db
      .insert(testRuns)
      .values({
        agentVersionId: input.agentVersionId,
        providerRunId: remote.data.runId,
        status: remote.data.status,
        repeatCount: input.repeatCount,
      })
      .returning();
    if (!run) throw new Error('Provider test run mapping was not persisted');
    await this.database.db.insert(testEvidence).values(
      mappings.map((mapping) => ({
        testRunId: run.id,
        testVersionId: mapping.testVersionId,
        internalEvaluation: {
          status: 'PENDING_PROVIDER_RESULT',
          providerRunId: remote.data.runId,
          providerTestId: mapping.providerTestId,
        },
        passed: false,
      })),
    );
    return this.applyProviderTestResult(run.id, remote.data);
  }

  async syncProviderTestRun(id: string) {
    const run = await this.database.db.query.testRuns.findFirst({ where: eq(testRuns.id, id) });
    if (!run) return { status: 'NOT_FOUND' };
    if (!run.providerRunId)
      return { status: 'BLOCKED', blockers: ['Provider run mapping is missing'] };
    const remote = await (await this.providerAdapter()).getTestInvocation(run.providerRunId);
    if (remote.status !== 'SUCCESS') return remote;
    return this.applyProviderTestResult(run.id, remote.data);
  }

  private async applyProviderTestResult(localRunId: string, result: ProviderTestRun) {
    const evidence = await this.database.db
      .select({ evidence: testEvidence, mapping: providerTestMappings })
      .from(testEvidence)
      .innerJoin(
        providerTestMappings,
        eq(testEvidence.testVersionId, providerTestMappings.testVersionId),
      )
      .where(eq(testEvidence.testRunId, localRunId));
    let passCount = 0;
    let failCount = 0;
    for (const item of evidence) {
      const providerRuns = result.testRuns.filter(
        (providerRun) => providerRun.testId === item.mapping.providerTestId,
      );
      const terminal =
        providerRuns.length > 0 &&
        providerRuns.every((providerRun) =>
          ['completed', 'passed', 'failed', 'error'].includes(providerRun.status.toLowerCase()),
        );
      const passed =
        terminal &&
        providerRuns.every(
          (providerRun) =>
            providerRun.result?.toLowerCase() === 'success' &&
            !['failed', 'error'].includes(providerRun.status.toLowerCase()),
        );
      if (terminal) {
        if (passed) passCount += providerRuns.length;
        else failCount += providerRuns.length;
      }
      await this.database.db
        .update(testEvidence)
        .set({
          passed,
          internalEvaluation: {
            status: terminal ? (passed ? 'PASSED' : 'FAILED') : 'PENDING_PROVIDER_RESULT',
            providerRunId: result.runId,
            providerTestId: item.mapping.providerTestId,
            providerRuns,
          },
        })
        .where(eq(testEvidence.id, item.evidence.id));
    }
    const completed = result.status === 'COMPLETED' || result.status === 'FAILED';
    const status = completed ? 'COMPLETED' : result.status;
    const [updated] = await this.database.db
      .update(testRuns)
      .set({
        status,
        passCount,
        failCount,
        completedAt: completed ? new Date() : null,
      })
      .where(eq(testRuns.id, localRunId))
      .returning();
    if (updated && completed) {
      await this.database.db
        .update(agentConfigVersions)
        .set({ state: failCount === 0 && passCount > 0 ? 'TEST_PASSED' : 'TEST_FAILED' })
        .where(eq(agentConfigVersions.id, updated.agentVersionId));
    }
    return {
      status,
      localRunId,
      providerRunId: result.runId,
      passCount,
      failCount,
      providerStatus: result.status,
    };
  }

  async listOperations() {
    const [transfers, callbacks, tasks, deliveries] = await Promise.all([
      this.database.db.select().from(handoffs).orderBy(desc(handoffs.requestedAt)),
      this.database.db.select().from(callbackRequests).orderBy(desc(callbackRequests.createdAt)),
      this.database.db.select().from(staffTasks).orderBy(desc(staffTasks.createdAt)),
      this.database.db.select().from(messageDeliveries).orderBy(desc(messageDeliveries.createdAt)),
    ]);
    return { transfers, callbacks, tasks, deliveries };
  }

  async createStaffTask(input: {
    conversationId: string;
    reason: string;
    priority: 'NORMAL' | 'URGENT';
    dueAt?: string;
  }) {
    const conversation = await this.database.db.query.conversations.findFirst({
      where: eq(conversations.id, input.conversationId),
    });
    if (!conversation) return { status: 'NOT_FOUND', message: 'Conversation does not exist' };
    const [task] = await this.database.db
      .insert(staffTasks)
      .values({
        conversationId: input.conversationId,
        idempotencyKey: `operator-${randomUUID()}`,
        ownerId: process.env.QP_SYSTEM_ACTOR_ID ?? developmentActorId,
        reason: input.reason,
        priority: input.priority,
        status: 'OPEN',
        ...(input.dueAt ? { dueAt: new Date(input.dueAt) } : {}),
      })
      .returning();
    return { status: 'CREATED', task };
  }

  async updateStaffTask(
    id: string,
    status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'EXPIRED',
  ) {
    const existing = await this.database.db.query.staffTasks.findFirst({
      where: eq(staffTasks.id, id),
    });
    if (!existing) return { status: 'NOT_FOUND' };
    if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED')
      return { status: 'CONFLICT', currentState: existing.status };
    const [task] = await this.database.db
      .update(staffTasks)
      .set({
        status,
        completedAt: status === 'COMPLETED' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(staffTasks.id, id))
      .returning();
    return { status: 'UPDATED', task };
  }

  async analyticsSummary() {
    const [classifications, calls] = await Promise.all([
      this.database.db.select().from(callClassifications),
      this.database.db.select().from(conversations),
    ]);
    const intentCounts = Object.entries(
      classifications.reduce<Record<string, number>>((totals, item) => {
        totals[item.primaryIntent] = (totals[item.primaryIntent] ?? 0) + 1;
        return totals;
      }, {}),
    ).map(([intent, count]) => ({ intent, count }));
    return {
      eligibleConversationCount: calls.filter((call) => !call.synthetic).length,
      syntheticConversationCount: calls.filter((call) => call.synthetic).length,
      intentCounts,
      generatedAt: new Date().toISOString(),
    };
  }

  async listReports() {
    const [definitions, runs] = await Promise.all([
      this.database.db.select().from(reportDefinitions).orderBy(desc(reportDefinitions.createdAt)),
      this.database.db.select().from(reportRuns).orderBy(desc(reportRuns.createdAt)),
    ]);
    return { definitions, runs };
  }

  async createReportDefinition(input: {
    key: string;
    schedule: string;
    classification: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
    configuration: Record<string, unknown>;
  }) {
    const [definition] = await this.database.db
      .insert(reportDefinitions)
      .values({ ...input, active: true })
      .onConflictDoNothing({ target: reportDefinitions.key })
      .returning();
    return definition
      ? { status: 'CREATED', definition }
      : { status: 'CONFLICT', message: 'A report definition with that key already exists' };
  }

  async listAudit(limit: number) {
    return {
      items: await this.database.db
        .select()
        .from(auditEvents)
        .orderBy(desc(auditEvents.occurredAt))
        .limit(limit),
    };
  }

  async listRetentionPolicies() {
    return {
      items: await this.database.db
        .select()
        .from(retentionPolicies)
        .orderBy(desc(retentionPolicies.createdAt)),
    };
  }

  async proposeCorrection(
    conversationId: string,
    input: {
      targetType:
        | 'CANONICAL_TRANSCRIPT'
        | 'REDACTED_TRANSCRIPT'
        | 'SUMMARY'
        | 'CLASSIFICATION'
        | 'ENTITY'
        | 'CUSTOMER_LINK';
      targetRecordId: string;
      reason: string;
      proposedValue: Record<string, unknown>;
    },
  ) {
    const targetExists = await this.correctionTargetBelongsToConversation(
      conversationId,
      input.targetType,
      input.targetRecordId,
    );
    if (!targetExists) return { status: 'NOT_FOUND' };
    const latest = await this.database.db.query.corrections.findFirst({
      where: and(
        eq(corrections.targetType, input.targetType),
        eq(corrections.targetRecordId, input.targetRecordId),
      ),
      orderBy: desc(corrections.revision),
    });
    const actorId = process.env.QP_SYSTEM_ACTOR_ID ?? developmentActorId;
    return this.database.db.transaction(async (tx) => {
      const [correction] = await tx
        .insert(corrections)
        .values({
          conversationId,
          targetType: input.targetType,
          targetRecordId: input.targetRecordId,
          revision: (latest?.revision ?? 0) + 1,
          reason: input.reason,
          proposedValue: input.proposedValue,
          proposedBy: actorId,
        })
        .returning();
      if (!correction) throw new Error('Correction proposal was not persisted');
      await tx.insert(correctionHistory).values({
        correctionId: correction.id,
        eventType: 'PROPOSED',
        toStatus: 'PROPOSED',
        actorId,
        reason: input.reason,
        evidence: { targetType: input.targetType, targetRecordId: input.targetRecordId },
      });
      return { status: 'PROPOSED', correction };
    });
  }

  async decideCorrection(id: string, decision: 'APPROVE' | 'REJECT', reason: string) {
    const correction = await this.database.db.query.corrections.findFirst({
      where: eq(corrections.id, id),
    });
    if (!correction) return { status: 'NOT_FOUND' };
    if (correction.status !== 'PROPOSED')
      return { status: 'CONFLICT', currentStatus: correction.status };
    const actorId = process.env.QP_SYSTEM_ACTOR_ID ?? developmentActorId;
    const nextStatus = decision === 'APPROVE' ? ('APPROVED' as const) : ('REJECTED' as const);
    return this.database.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(corrections)
        .set({
          status: nextStatus,
          decidedBy: actorId,
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(corrections.id, id), eq(corrections.status, 'PROPOSED')))
        .returning();
      if (!updated) return { status: 'CONFLICT' };
      await tx.insert(correctionHistory).values({
        correctionId: id,
        eventType: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        fromStatus: 'PROPOSED',
        toStatus: nextStatus,
        actorId,
        reason,
      });
      return { status: nextStatus, correction: updated };
    });
  }

  private async correctionTargetBelongsToConversation(
    conversationId: string,
    targetType:
      | 'CANONICAL_TRANSCRIPT'
      | 'REDACTED_TRANSCRIPT'
      | 'SUMMARY'
      | 'CLASSIFICATION'
      | 'ENTITY'
      | 'CUSTOMER_LINK',
    targetRecordId: string,
  ) {
    if (targetType === 'CANONICAL_TRANSCRIPT' || targetType === 'REDACTED_TRANSCRIPT') {
      return Boolean(
        await this.database.db.query.transcriptRevisions.findFirst({
          where: and(
            eq(transcriptRevisions.id, targetRecordId),
            eq(transcriptRevisions.conversationId, conversationId),
          ),
        }),
      );
    }
    if (targetType === 'SUMMARY')
      return Boolean(
        await this.database.db.query.callSummaries.findFirst({
          where: and(
            eq(callSummaries.id, targetRecordId),
            eq(callSummaries.conversationId, conversationId),
          ),
        }),
      );
    if (targetType === 'CLASSIFICATION')
      return Boolean(
        await this.database.db.query.callClassifications.findFirst({
          where: and(
            eq(callClassifications.id, targetRecordId),
            eq(callClassifications.conversationId, conversationId),
          ),
        }),
      );
    if (targetType === 'CUSTOMER_LINK')
      return Boolean(
        await this.database.db.query.customerLinks.findFirst({
          where: and(
            eq(customerLinks.id, targetRecordId),
            eq(customerLinks.conversationId, conversationId),
          ),
        }),
      );
    const entity = await this.database.db
      .select({ id: callEntities.id })
      .from(callEntities)
      .innerJoin(callClassifications, eq(callEntities.classificationId, callClassifications.id))
      .where(
        and(
          eq(callEntities.id, targetRecordId),
          eq(callClassifications.conversationId, conversationId),
        ),
      )
      .limit(1);
    return entity.length > 0;
  }

  async readiness() {
    const environment =
      (process.env.QP_ENVIRONMENT as 'development' | 'staging' | 'production' | undefined) ??
      'development';
    const enrichmentProvider =
      process.env.ENRICHMENT_PROVIDER === 'openai-responses' &&
      process.env.OPENAI_API_KEY &&
      process.env.OPENAI_MODEL
        ? new OpenAIResponsesProvider({
            apiKey: process.env.OPENAI_API_KEY,
            model: process.env.OPENAI_MODEL,
            ...(process.env.OPENAI_BASE_URL ? { baseUrl: process.env.OPENAI_BASE_URL } : {}),
          })
        : process.env.ENRICHMENT_PROVIDER === 'openai-responses'
          ? undefined
          : new DeterministicLocalProvider();
    const provider = await this.providerAdapter();
    const [capabilities, enrichmentHealth, agentVersions, knowledge, deployments, drift, tests] =
      await Promise.all([
        provider.getCapabilities(),
        enrichmentProvider?.health(),
        this.database.db.select().from(agentConfigVersions),
        this.database.db
          .select({ asset: knowledgeAssets, version: knowledgeVersions })
          .from(knowledgeVersions)
          .innerJoin(knowledgeAssets, eq(knowledgeVersions.assetId, knowledgeAssets.id)),
        this.database.db.select().from(agentDeployments),
        this.database.db.select().from(agentDriftFindings),
        this.database.db.select().from(testRuns),
      ]);
    const dependencies: ReleaseDependency[] = [
      ...agentVersions
        .filter((item) => item.state === 'ACTIVE')
        .map((item) => ({
          id: item.id,
          kind: 'AGENT' as const,
          approved: true,
          active: true,
          synthetic: item.synthetic,
          expired: false,
          syncState:
            deployments.find((mapping) => mapping.agentVersionId === item.id)?.syncState ??
            ('REMOTE_MISSING' as const),
        })),
      ...knowledge
        .filter((item) => item.version.state === 'ACTIVE')
        .map((item) => ({
          id: item.version.id,
          kind: 'KNOWLEDGE' as const,
          approved: true,
          active: true,
          synthetic: item.asset.synthetic,
          expired: Boolean(item.version.expiresAt && item.version.expiresAt <= new Date()),
          syncState: 'IN_SYNC' as const,
        })),
    ];
    const result = evaluateReleaseGate({
      environment,
      capabilities,
      requiredCapabilities: ['agent_versioning', 'post_call_webhooks', 'conversation_retrieval'],
      dependencies,
      criticalTestsPassed: tests.some((run) => run.status === 'COMPLETED' && run.failCount === 0),
      approvalsComplete: agentVersions.some((version) =>
        ['APPROVED_FOR_PUBLISH', 'PUBLISHED', 'ACTIVE'].includes(version.state),
      ),
      privacyApproved: process.env.PROVIDER_PRIVACY_APPROVED === 'true',
      retentionApproved: process.env.PRODUCTION_RETENTION_APPROVED === 'true',
      disclosureApproved: process.env.CALLER_DISCLOSURE_APPROVED === 'true',
      developmentIdentity: !process.env.OIDC_ISSUER,
      fakeAdapters:
        (process.env.ELEVENLABS_CAPABILITY_MODE ?? 'simulator') === 'live'
          ? []
          : ['elevenlabs-simulator', 'business-sandbox', 'deterministic-enrichment'],
      securityHighOrCriticalFindings: Number(process.env.OPEN_SECURITY_HIGH_CRITICAL ?? 0),
    });
    if (drift.some((finding) => !finding.resolvedAt))
      result.blockers.push('Unresolved provider drift exists');
    if (!enrichmentProvider)
      result.blockers.push('Configured enrichment provider is missing its runtime model or secret');
    else if (enrichmentHealth?.status !== 'SUCCESS' || !enrichmentHealth.data.structuredOutputs)
      result.blockers.push('Configured enrichment model capability check failed');
    if (environment === 'production' && !process.env.NATIVE_LANGUAGE_APPROVALS?.trim())
      result.blockers.push('No native-speaker language approval evidence is configured');
    if (environment === 'production' && process.env.ACTIVE_OPERATOR_QUEUES !== 'true')
      result.blockers.push('Operator queues are not active');
    if (environment === 'production' && process.env.ACTIVE_MESSAGE_TEMPLATES !== 'true')
      result.blockers.push('Approved messaging templates are not active');
    return {
      ...result,
      state: result.readiness,
      allowed: result.allowed && result.blockers.length === 0,
    };
  }
}
