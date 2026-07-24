import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNull } from 'drizzle-orm';
import {
  adminUsers,
  agentApprovals,
  agentConfigVersions,
  agentDeployments,
  agentDriftFindings,
  agentTests,
  aggregateFacts,
  agentTestVersions,
  auditEvents,
  callbackRequests,
  callClassifications,
  callEntities,
  callOutcomes,
  callSummaries,
  conversationProcessingRuns,
  conversations,
  correctionHistory,
  corrections,
  customerLinks,
  featureFlags,
  handoffs,
  knowledgeAssets,
  knowledgeApprovals,
  knowledgeGaps,
  knowledgeSyncs,
  knowledgeVersions,
  messageDeliveries,
  providerConversations,
  providerTestMappings,
  providerWorkspaces,
  qualityEvaluations,
  permissions,
  reportDefinitions,
  reportRuns,
  retentionPolicies,
  rolePermissions,
  roles,
  staffTasks,
  systemConfigurations,
  testRuns,
  testEvidence,
  toolInvocations,
  transcriptRevisions,
  transcriptTurns,
  trends,
  userRoles,
  voiceAssignments,
  voiceAgents,
  voiceProfiles,
  webhookInboxEntries,
} from '@quantum-parks/db';
import {
  HttpElevenLabsAdapter,
  type ElevenLabsPort,
  type ProviderTestRun,
} from '@quantum-parks/elevenlabs';
import { runtimeSecret } from '@quantum-parks/config';
import { evaluateReleaseGate, type ReleaseDependency } from '@quantum-parks/domain';
import { DatabaseService } from './database.service.js';
import { WorkflowDispatchService } from './workflow-dispatch.service.js';
import { ElevenLabsIntegrationService } from './elevenlabs-integration.service.js';
import { AiosPlatformService } from './aios-platform.service.js';

const developmentActorId = '00000000-0000-4000-8000-000000000001';

@Injectable()
export class PlatformService {
  constructor(
    private readonly database: DatabaseService,
    private readonly workflows: WorkflowDispatchService,
    private readonly elevenLabsIntegration: ElevenLabsIntegrationService,
    private readonly aios: AiosPlatformService,
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

  /**
   * Two agent versions with their full configuration, for side-by-side review.
   *
   * Returned as canonical JSON text rather than as objects so the reviewer sees the
   * same bytes the checksum was taken over. A diff computed against a re-serialised
   * object could differ from what was actually approved and published.
   */
  async compareAgentVersions(leftId: string, rightId: string) {
    const [left, right] = await Promise.all([
      this.database.db.query.agentConfigVersions.findFirst({
        where: eq(agentConfigVersions.id, leftId),
      }),
      this.database.db.query.agentConfigVersions.findFirst({
        where: eq(agentConfigVersions.id, rightId),
      }),
    ]);
    if (!left || !right) return { status: 'NOT_FOUND' as const };

    const approvals = await this.database.db
      .select()
      .from(agentApprovals)
      .where(inArray(agentApprovals.agentVersionId, [leftId, rightId]));

    const render = (version: typeof left) => ({
      id: version.id,
      version: version.version,
      state: version.state,
      changeReason: version.changeReason,
      authorId: version.authorId,
      checksum: version.checksum,
      createdAt: version.createdAt,
      configurationText: JSON.stringify(version.configuration, null, 2),
      approvals: approvals
        .filter((approval) => approval.agentVersionId === version.id)
        .map((approval) => ({
          reviewerId: approval.reviewerId,
          decision: approval.decision,
          reason: approval.reason,
          createdAt: approval.createdAt,
        })),
    });

    return {
      status: 'OK' as const,
      left: render(left),
      right: render(right),
      identical: left.checksum === right.checksum,
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

  /**
   * Knowledge publication state: how each approved version stands against the copy
   * held by the voice runtime. Local and remote are reported separately — the remote
   * object is a runtime copy, and divergence is drift rather than a new source of truth.
   */
  async listKnowledgeReleases() {
    const rows = await this.database.db
      .select({ sync: knowledgeSyncs, version: knowledgeVersions, asset: knowledgeAssets })
      .from(knowledgeSyncs)
      .innerJoin(knowledgeVersions, eq(knowledgeSyncs.knowledgeVersionId, knowledgeVersions.id))
      .innerJoin(knowledgeAssets, eq(knowledgeVersions.assetId, knowledgeAssets.id))
      .orderBy(desc(knowledgeSyncs.updatedAt));

    return {
      items: rows.map((row) => ({
        id: row.sync.id,
        assetId: row.asset.id,
        title: row.asset.title,
        category: row.asset.category,
        language: row.asset.language,
        riskClass: row.asset.riskClass,
        version: row.version.version,
        versionState: row.version.state,
        syncState: row.sync.syncState,
        providerDocumentId: row.sync.providerDocumentId,
        localChecksum: row.sync.localChecksum,
        remoteChecksum: row.sync.remoteChecksum,
        checksumsMatch:
          row.sync.remoteChecksum !== null && row.sync.remoteChecksum === row.sync.localChecksum,
        lastAttemptAt: row.sync.lastAttemptAt,
        lastSuccessAt: row.sync.lastSuccessAt,
        lastError: row.sync.lastError,
      })),
    };
  }

  async listKnowledgeGaps() {
    return {
      items: await this.database.db
        .select()
        .from(knowledgeGaps)
        .orderBy(desc(knowledgeGaps.frequency)),
    };
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

  /**
   * Corrections across every call, for the review queue. The per-call list above
   * answers "what was corrected on this call"; this answers "what is waiting for a
   * decision", which is the question the queue exists for.
   */
  async listAllCorrections() {
    const rows = await this.database.db
      .select({ correction: corrections, conversation: conversations })
      .from(corrections)
      .innerJoin(conversations, eq(corrections.conversationId, conversations.id))
      .orderBy(desc(corrections.createdAt))
      .limit(200);
    const history = await this.database.db
      .select()
      .from(correctionHistory)
      .orderBy(desc(correctionHistory.createdAt));
    return {
      items: rows.map((row) => ({
        ...row.correction,
        park: row.conversation.park,
        language: row.conversation.language,
        callStartedAt: row.conversation.startedAt,
        historyCount: history.filter((entry) => entry.correctionId === row.correction.id).length,
      })),
    };
  }

  /**
   * Reconciliation subjects: calls whose processing did not complete, plus the
   * per-attempt run log that explains why. Grouping them here keeps the operator
   * flow in one request rather than one per call.
   */
  async listReconciliation() {
    const [stalled, runs, inbox] = await Promise.all([
      this.database.db
        .select({ conversation: conversations, provider: providerConversations })
        .from(conversations)
        .innerJoin(
          providerConversations,
          eq(conversations.providerConversationId, providerConversations.id),
        )
        .where(
          inArray(conversations.processingState, [
            'PARTIAL',
            'FAILED_RETRYABLE',
            'FAILED_FINAL',
            'SUMMARIZING',
            'CLASSIFYING',
            'NORMALIZING',
          ]),
        )
        .orderBy(desc(conversations.startedAt))
        .limit(100),
      this.database.db
        .select()
        .from(conversationProcessingRuns)
        .orderBy(desc(conversationProcessingRuns.startedAt))
        .limit(300),
      this.database.db
        .select()
        .from(webhookInboxEntries)
        .orderBy(desc(webhookInboxEntries.createdAt))
        .limit(100),
    ]);

    return {
      items: stalled.map((row) => ({
        id: row.conversation.id,
        providerConversationId: row.provider.providerConversationId,
        processingState: row.conversation.processingState,
        park: row.conversation.park,
        language: row.conversation.language,
        startedAt: row.conversation.startedAt,
        attempts: runs.filter((run) => run.conversationId === row.conversation.id).length,
        lastError:
          runs.find((run) => run.conversationId === row.conversation.id && run.error)?.error ??
          null,
      })),
      inbox: inbox.map((entry) => ({
        id: entry.id,
        state: entry.state,
        attempts: entry.attempts,
        workflowId: entry.workflowId,
        nextAttemptAt: entry.nextAttemptAt,
        lastError: entry.lastError,
        createdAt: entry.createdAt,
      })),
    };
  }

  /**
   * Human quality reviews. Distinct from test evidence: a test asserts a rule, a
   * review records a person's judgement against the rubric.
   */
  async listQualityReviews() {
    const rows = await this.database.db
      .select({ evaluation: qualityEvaluations, conversation: conversations })
      .from(qualityEvaluations)
      .innerJoin(conversations, eq(qualityEvaluations.conversationId, conversations.id))
      .orderBy(desc(qualityEvaluations.createdAt))
      .limit(200);
    return {
      items: rows.map((row) => ({
        id: row.evaluation.id,
        conversationId: row.evaluation.conversationId,
        rubricVersion: row.evaluation.rubricVersion,
        scores: row.evaluation.scores,
        reviewerId: row.evaluation.reviewerId,
        createdAt: row.evaluation.createdAt,
        park: row.conversation.park,
        language: row.conversation.language,
        callStartedAt: row.conversation.startedAt,
      })),
    };
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

  /**
   * Analytics series built from `aggregate_facts` rather than by counting rows in
   * `conversations`. The facts table is the aggregation boundary: reading from it
   * keeps a chart and a scheduled report answering with the same numbers.
   */
  async analyticsSeries(days: number) {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const [facts, trendRows] = await Promise.all([
      this.database.db.select().from(aggregateFacts).where(gte(aggregateFacts.date, since)),
      this.database.db.select().from(trends).orderBy(desc(trends.periodEnd)),
    ]);

    const dayKey = (date: Date) => date.toISOString().slice(0, 10);
    const dayKeys: string[] = [];
    for (let offset = 0; offset < days; offset += 1) {
      const date = new Date(since);
      date.setDate(date.getDate() + offset);
      dayKeys.push(dayKey(date));
    }

    const pick = (dimensionKey: string, metric: string) =>
      facts.filter((fact) => fact.dimensionKey === dimensionKey && fact.metric === metric);

    // Demand per day, with absent days rendered as zero rather than omitted, so the
    // x-axis stays continuous and a quiet day is visible as a quiet day.
    const received = pick('total', 'calls_received');
    const completed = pick('total', 'calls_completed');
    const demand = dayKeys.map((key) => ({
      label: key,
      received: received.find((fact) => dayKey(fact.date) === key)?.count ?? 0,
      completed: completed.find((fact) => dayKey(fact.date) === key)?.count ?? 0,
    }));

    const totalsFor = (dimensionKey: string) => {
      const totals = new Map<string, number>();
      for (const fact of pick(dimensionKey, 'calls_received')) {
        totals.set(fact.dimensionValue, (totals.get(fact.dimensionValue) ?? 0) + fact.count);
      }
      return [...totals.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((left, right) => right.value - left.value);
    };

    const durationFacts = pick('total', 'call_duration_seconds');
    const durationTotal = durationFacts.reduce((sum, fact) => sum + Number(fact.sum), 0);
    const durationCount = durationFacts.reduce((sum, fact) => sum + fact.count, 0);

    const totalReceived = received.reduce((sum, fact) => sum + fact.count, 0);
    const totalCompleted = completed.reduce((sum, fact) => sum + fact.count, 0);
    const outcomes = totalsFor('outcome');
    const resolved = outcomes.find((entry) => entry.label === 'RESOLVED_BY_AGENT')?.value ?? 0;

    return {
      windowDays: days,
      from: since.toISOString(),
      generatedAt: new Date().toISOString(),
      totals: {
        received: totalReceived,
        completed: totalCompleted,
        // Null rather than zero when there is nothing to divide by: a containment
        // rate with no calls behind it is unknown, not zero percent.
        containment: totalReceived > 0 ? resolved / totalReceived : null,
        averageDurationSeconds: durationCount > 0 ? durationTotal / durationCount : null,
      },
      demand,
      byIntent: totalsFor('intent'),
      byPark: totalsFor('park'),
      byLanguage: totalsFor('language'),
      byOutcome: outcomes,
      trends: trendRows.map((trend) => ({
        id: trend.id,
        trendType: trend.trendType,
        dimensions: trend.dimensions,
        metric: Number(trend.metric),
        confidence: trend.confidence === null ? null : Number(trend.confidence),
        periodStart: trend.periodStart,
        periodEnd: trend.periodEnd,
        evidence: trend.evidence,
      })),
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

  /**
   * Access administration. The `admin_users`, `roles`, `permissions` and join tables
   * have existed since the first migration but were never read: authorisation is
   * evaluated from the code-owned permission matrix. This exposes the registry so an
   * administrator can see who holds which role, and where duties are not separated.
   */
  async listAccessAdministration() {
    const [users, roleRows, permissionRows, assignments, grants] = await Promise.all([
      this.database.db.select().from(adminUsers).orderBy(adminUsers.displayName),
      this.database.db.select().from(roles).orderBy(roles.key),
      this.database.db.select().from(permissions).orderBy(permissions.key),
      this.database.db.select().from(userRoles),
      this.database.db.select().from(rolePermissions),
    ]);

    const rolesById = new Map(roleRows.map((role) => [role.id, role]));
    const permissionsById = new Map(
      permissionRows.map((permission) => [permission.id, permission]),
    );

    // Separation of duties: authoring and approving the same artefact class is the
    // combination the release gates exist to prevent, so it is surfaced explicitly.
    const conflictingPairs: Array<[string, string, string]> = [
      ['KNOWLEDGE_EDITOR', 'KNOWLEDGE_APPROVER', 'Can author and approve the same knowledge'],
      ['AGENT_ADMIN', 'PLATFORM_OWNER', 'Can author agent configuration and publish it'],
      ['AI_INTELLIGENCE_ADMIN', 'AI_GOVERNANCE_APPROVER', 'Can change AI routing and approve it'],
    ];

    return {
      users: users.map((user) => {
        const held = assignments
          .filter((assignment) => assignment.userId === user.id)
          .map((assignment) => rolesById.get(assignment.roleId)?.key)
          .filter((key): key is string => Boolean(key))
          .sort();
        return {
          id: user.id,
          displayName: user.displayName,
          email: user.email,
          oidcSubject: user.oidcSubject,
          active: user.active,
          sensitiveClearance: user.sensitiveClearance,
          roles: held,
          separationOfDutyWarnings: conflictingPairs
            .filter(([left, right]) => held.includes(left) && held.includes(right))
            .map(([, , reason]) => reason),
        };
      }),
      roles: roleRows.map((role) => ({
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
        memberCount: assignments.filter((assignment) => assignment.roleId === role.id).length,
        permissions: grants
          .filter((grant) => grant.roleId === role.id)
          .map((grant) => permissionsById.get(grant.permissionId)?.key)
          .filter((key): key is string => Boolean(key))
          .sort(),
      })),
      permissions: permissionRows,
    };
  }

  async listFeatureFlags() {
    return {
      items: await this.database.db.select().from(featureFlags).orderBy(featureFlags.key),
    };
  }

  async listSystemConfiguration() {
    return {
      items: await this.database.db
        .select()
        .from(systemConfigurations)
        .orderBy(systemConfigurations.key),
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

  /**
   * The operator cockpit payload.
   *
   * Computed server-side and in one round trip because the alternative — the browser
   * pulling whole collections and counting them — would be both slow and wrong: the
   * list endpoints cap at 100 records, so any client-side total would silently
   * under-report. Every figure here is derived from an authoritative record; nothing
   * is estimated.
   */
  async missionControl() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(startOfToday.getTime() - 7 * 86_400_000);
    const now = new Date();

    const [
      readiness,
      integration,
      agents,
      versions,
      deployments,
      drift,
      assignments,
      voices,
      todaysCalls,
      weeksCalls,
      outcomes,
      callbacks,
      tasks,
      handoffRows,
      deliveries,
      knowledgeRows,
      syncRows,
      gapRows,
      runs,
      recent,
      classifications,
    ] = await Promise.all([
      this.readiness(),
      this.elevenLabsIntegration.status(),
      this.database.db.select().from(voiceAgents),
      this.database.db.select().from(agentConfigVersions),
      this.database.db.select().from(agentDeployments),
      this.database.db
        .select()
        .from(agentDriftFindings)
        .where(isNull(agentDriftFindings.resolvedAt)),
      this.database.db.select().from(voiceAssignments),
      this.database.db.select().from(voiceProfiles),
      this.database.db
        .select()
        .from(conversations)
        .where(gte(conversations.startedAt, startOfToday)),
      this.database.db
        .select()
        .from(conversations)
        .where(gte(conversations.startedAt, sevenDaysAgo)),
      this.database.db.select().from(callOutcomes),
      this.database.db.select().from(callbackRequests),
      this.database.db.select().from(staffTasks),
      this.database.db.select().from(handoffs),
      this.database.db.select().from(messageDeliveries),
      this.database.db
        .select({ asset: knowledgeAssets, version: knowledgeVersions })
        .from(knowledgeVersions)
        .innerJoin(knowledgeAssets, eq(knowledgeVersions.assetId, knowledgeAssets.id)),
      this.database.db.select().from(knowledgeSyncs),
      this.database.db.select().from(knowledgeGaps),
      this.database.db.select().from(testRuns).orderBy(desc(testRuns.startedAt)),
      this.database.db
        .select({ conversation: conversations, provider: providerConversations })
        .from(conversations)
        .innerJoin(
          providerConversations,
          eq(conversations.providerConversationId, providerConversations.id),
        )
        .orderBy(desc(conversations.startedAt))
        .limit(12),
      this.database.db.select().from(callClassifications),
    ]);

    const agent = agents[0];
    const activeVersion = versions.find((version) => version.state === 'ACTIVE');
    const draftVersion = versions.find((version) => version.state === 'DRAFT');
    const testedVersion = versions.find((version) => version.state === 'TEST_PASSED');
    const activeDeployment = activeVersion
      ? deployments.find((deployment) => deployment.agentVersionId === activeVersion.id)
      : undefined;

    const configuredLanguages = Array.isArray(
      (activeVersion?.configuration as { languages?: unknown } | undefined)?.languages,
    )
      ? ((activeVersion?.configuration as { languages: string[] }).languages ?? [])
      : [];

    const activeAssignments = activeVersion
      ? assignments.filter((assignment) => assignment.agentVersionId === activeVersion.id)
      : [];

    const conversationIdsToday = new Set(todaysCalls.map((call) => call.id));
    const outcomesToday = outcomes.filter((outcome) =>
      conversationIdsToday.has(outcome.conversationId),
    );

    const completedToday = todaysCalls.filter(
      (call) => call.processingState === 'COMPLETED',
    ).length;
    const failedProcessing = todaysCalls.filter((call) =>
      ['FAILED_RETRYABLE', 'FAILED_FINAL'].includes(call.processingState),
    ).length;
    const partialProcessing = todaysCalls.filter(
      (call) => call.processingState === 'PARTIAL',
    ).length;

    const transfersToday = outcomesToday.filter((outcome) =>
      ['TRANSFER_COMPLETED', 'TRANSFER_FAILED_CALLBACK_CREATED'].includes(outcome.outcome),
    ).length;
    const unresolvedToday = outcomesToday.filter((outcome) =>
      ['UNRESOLVED_KNOWLEDGE_GAP', 'CUSTOMER_DISCONNECTED', 'TECHNICAL_FAILURE'].includes(
        outcome.outcome,
      ),
    ).length;
    const resolvedToday = outcomesToday.filter(
      (outcome) => outcome.outcome === 'RESOLVED_BY_AGENT',
    ).length;

    const openCallbacks = callbacks.filter((item) =>
      ['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(item.status),
    );
    const overdueCallbacks = openCallbacks.filter((item) => item.dueAt && item.dueAt < now);
    const openTasks = tasks.filter((item) =>
      ['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(item.status),
    );
    const overdueTasks = openTasks.filter((item) => item.dueAt && item.dueAt < now);
    const failedHandoffs = handoffRows.filter((item) => item.status !== 'COMPLETED');
    const failedMessages = deliveries.filter((item) => item.status === 'FAILED');

    const activeKnowledge = knowledgeRows.filter((row) => row.version.state === 'ACTIVE');
    const expiringKnowledge = activeKnowledge.filter(
      (row) =>
        row.version.expiresAt &&
        row.version.expiresAt > now &&
        row.version.expiresAt.getTime() - now.getTime() < 30 * 86_400_000,
    );
    const expiredKnowledge = activeKnowledge.filter(
      (row) => row.version.expiresAt && row.version.expiresAt <= now,
    );
    const knowledgeAwaitingReview = knowledgeRows.filter(
      (row) => row.version.state === 'IN_REVIEW',
    );
    const failedSyncs = syncRows.filter((row) =>
      ['PUBLISH_FAILED', 'DRIFTED', 'REMOTE_MISSING'].includes(row.syncState),
    );
    const openGaps = gapRows.filter((row) => ['OPEN', 'ASSIGNED'].includes(row.status));

    const unavailableVoices = voices.filter((voice) => !voice.available);
    const latestRun = runs[0];
    const lastCompletedRun = runs.find((run) => run.status !== 'RUNNING');

    // The share of today's calls the receptionist answered outright, which is the
    // closest honest proxy for "approved knowledge covered the question". Null when
    // no call carries an outcome yet — a rate with no evidence must not read as 0%.
    const knowledgeAnswerRate =
      outcomesToday.length > 0 ? resolvedToday / outcomesToday.length : null;
    const transferRate = outcomesToday.length > 0 ? transfersToday / outcomesToday.length : null;

    /* ------------------------------------------------ attention queue */

    type Attention = {
      id: string;
      severity: 'critical' | 'high' | 'medium';
      title: string;
      detail: string;
      href: string;
      count: number;
    };
    const attention: Attention[] = [];
    const add = (item: Attention) => {
      if (item.count > 0) attention.push(item);
    };

    add({
      id: 'drift',
      severity: 'critical',
      title: 'Unresolved provider drift',
      detail:
        'The live agent in the provider console no longer matches the approved configuration.',
      href: '/receptionist/releases',
      count: drift.length,
    });
    add({
      id: 'failed-sync',
      severity: 'critical',
      title: 'Knowledge failed to publish',
      detail:
        'Approved knowledge did not reach the voice runtime and callers may get stale answers.',
      href: '/knowledge/releases',
      count: failedSyncs.length,
    });
    add({
      id: 'failed-processing',
      severity: 'high',
      title: 'Calls failed to process',
      detail: 'These calls have no summary, classification or outcome and need replay.',
      href: '/calls/failed',
      count: failedProcessing,
    });
    add({
      id: 'expired-knowledge',
      severity: 'high',
      title: 'Knowledge past its expiry date',
      detail: 'Content is still assigned to the agent after the date it should have been reviewed.',
      href: '/knowledge/library?state=expired',
      count: expiredKnowledge.length,
    });
    add({
      id: 'failed-tests',
      severity: 'high',
      title: 'Failing tests on the current release',
      detail: 'Mandatory checks did not pass, so this version cannot be published.',
      href: '/quality/runs',
      count: lastCompletedRun?.failCount ?? 0,
    });
    add({
      id: 'failed-handoffs',
      severity: 'high',
      title: 'Transfers that were not answered',
      detail: 'A caller was transferred and nobody picked up.',
      href: '/operations/handoffs',
      count: failedHandoffs.length,
    });
    add({
      id: 'overdue-callbacks',
      severity: 'high',
      title: 'Callbacks past their due time',
      detail: 'Customers were promised a call back and have not received one.',
      href: '/operations/callbacks?due=overdue',
      count: overdueCallbacks.length,
    });
    add({
      id: 'failed-messages',
      severity: 'medium',
      title: 'Messages that failed to deliver',
      detail: 'An outbound message did not reach the customer.',
      href: '/operations/messages?status=FAILED',
      count: failedMessages.length,
    });
    add({
      id: 'unavailable-voices',
      severity: 'medium',
      title: 'Assigned voices that are unavailable',
      detail: 'The provider no longer offers a voice this agent references.',
      href: '/receptionist/voices',
      count: unavailableVoices.length,
    });
    add({
      id: 'overdue-tasks',
      severity: 'medium',
      title: 'Staff tasks past their due date',
      detail: 'Work raised from a call has not been completed in time.',
      href: '/operations/tasks',
      count: overdueTasks.length,
    });
    add({
      id: 'knowledge-review',
      severity: 'medium',
      title: 'Knowledge waiting for approval',
      detail: 'Changes are drafted but not yet approved by an independent reviewer.',
      href: '/knowledge/review',
      count: knowledgeAwaitingReview.length,
    });
    add({
      id: 'expiring-knowledge',
      severity: 'medium',
      title: 'Knowledge expiring within 30 days',
      detail: 'Review these before they lapse and stop being usable.',
      href: '/knowledge/library?state=expiring',
      count: expiringKnowledge.length,
    });
    add({
      id: 'partial-processing',
      severity: 'medium',
      title: 'Calls only partly processed',
      detail: 'Enrichment did not finish; transcripts exist but intelligence is incomplete.',
      href: '/calls/partial',
      count: partialProcessing,
    });

    const severityOrder = { critical: 0, high: 1, medium: 2 };
    attention.sort(
      (left, right) =>
        severityOrder[left.severity] - severityOrder[right.severity] || right.count - left.count,
    );

    /* ------------------------------------------------------- insight */

    const weekIds = new Set(weeksCalls.map((call) => call.id));
    const weekClassifications = classifications.filter((row) => weekIds.has(row.conversationId));
    const intentTotals = weekClassifications.reduce<Record<string, number>>((totals, row) => {
      totals[row.primaryIntent] = (totals[row.primaryIntent] ?? 0) + 1;
      return totals;
    }, {});
    const topIntents = Object.entries(intentTotals)
      .map(([intent, count]) => ({ intent, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 5);
    const topGap = [...openGaps].sort((left, right) => right.frequency - left.frequency)[0];

    // Withheld rather than shown thin: a "top intent" drawn from a handful of calls
    // is noise presented as insight.
    const insight =
      weekClassifications.length >= 20
        ? {
            evidenceCalls: weekClassifications.length,
            topIntents,
            knowledgeGap: topGap
              ? { title: topGap.title, frequency: topGap.frequency, language: topGap.language }
              : null,
          }
        : null;

    return {
      generatedAt: now.toISOString(),
      receptionist: {
        agentId: agent?.id ?? null,
        name: agent?.name ?? 'No receptionist configured',
        synthetic: agent?.synthetic ?? false,
        activeVersion: activeVersion
          ? { id: activeVersion.id, version: activeVersion.version, state: activeVersion.state }
          : null,
        draftVersion: draftVersion
          ? { id: draftVersion.id, version: draftVersion.version, state: draftVersion.state }
          : null,
        awaitingPublication: testedVersion
          ? { id: testedVersion.id, version: testedVersion.version, state: testedVersion.state }
          : null,
        languages: configuredLanguages,
        syncState: activeDeployment?.syncState ?? 'REMOTE_MISSING',
        publishedAt: activeDeployment?.publishedAt ?? null,
        verifiedAt: activeDeployment?.verifiedAt ?? null,
        voiceAssignments: activeAssignments.map((assignment) => ({
          language: assignment.language,
          fallback: assignment.fallback,
          voiceName: voices.find((voice) => voice.id === assignment.voiceProfileId)?.name ?? null,
          available:
            voices.find((voice) => voice.id === assignment.voiceProfileId)?.available ?? false,
        })),
      },
      runtime: {
        provider: 'ELEVENLABS',
        status: integration.status,
        capabilityMode: process.env.ELEVENLABS_CAPABILITY_MODE ?? 'simulator',
        productionRoutingEnabled: integration.productionRoutingEnabled,
        environment: process.env.QP_ENVIRONMENT ?? 'development',
      },
      today: {
        callsReceived: todaysCalls.length,
        callsCompleted: completedToday,
        failedProcessing,
        partialProcessing,
        transfers: transfersToday,
        transferRate,
        unresolved: unresolvedToday,
        knowledgeAnswerRate,
        callbacksDue: overdueCallbacks.length,
        callbacksOpen: openCallbacks.length,
        openTasks: openTasks.length,
        testStatus: latestRun?.status ?? 'NOT_RUN',
        testFailures: lastCompletedRun?.failCount ?? 0,
      },
      attention,
      recentCalls: recent.map((row) => ({
        id: row.conversation.id,
        startedAt: row.conversation.startedAt,
        park: row.conversation.park,
        language: row.conversation.language,
        processingState: row.conversation.processingState,
        durationSeconds:
          (row.provider.providerMetadata as { call_duration_secs?: number } | null)
            ?.call_duration_secs ?? null,
        intent:
          classifications.find((item) => item.conversationId === row.conversation.id)
            ?.primaryIntent ?? null,
        outcome:
          outcomes.find((item) => item.conversationId === row.conversation.id)?.outcome ?? null,
        synthetic: row.conversation.synthetic,
      })),
      insight,
      readiness: {
        state: readiness.state,
        allowed: readiness.allowed,
        domains: readiness.domains,
        blockers: readiness.blockers,
      },
    };
  }

  async readiness() {
    const environment =
      (process.env.QP_ENVIRONMENT as 'development' | 'staging' | 'production' | undefined) ??
      'development';
    const provider = await this.providerAdapter();
    const [capabilities, aiosReadiness, agentVersions, knowledge, deployments, drift, tests] =
      await Promise.all([
        provider.getCapabilities(),
        this.aios.evaluateReadiness(),
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
          : ['elevenlabs-simulator', 'business-sandbox'],
      securityHighOrCriticalFindings: Number(process.env.OPEN_SECURITY_HIGH_CRITICAL ?? 0),
    });
    if (drift.some((finding) => !finding.resolvedAt))
      result.blockers.push('Unresolved provider drift exists');
    result.blockers.push(...aiosReadiness.blockers.map((blocker) => `AIOS: ${blocker}`));
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
      domains: {
        voiceRuntime: Object.values(capabilities).some((state) => state === 'SUPPORTED')
          ? 'CONFIGURED_WITH_BLOCKERS'
          : 'NOT_CONFIGURED',
        aios: aiosReadiness.status,
        platform: result.readiness,
        productionRouting:
          result.allowed && result.blockers.length === 0 ? 'ELIGIBLE_FOR_APPROVAL' : 'BLOCKED',
      },
    };
  }
}
