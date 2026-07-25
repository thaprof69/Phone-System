import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Principal } from '@quantum-parks/auth';
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
  knowledgeAssignments,
  knowledgeConflicts,
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
  voiceConsentRecords,
  voicePreviews,
  voiceProfiles,
  webhookInboxEntries,
} from '@quantum-parks/db';
import {
  HttpElevenLabsAdapter,
  type ElevenLabsPort,
  type ProviderTestRun,
} from '@quantum-parks/elevenlabs';
import { runtimeSecret } from '@quantum-parks/config';
import {
  attemptsPolicyOverride,
  evaluateReleaseGate,
  validateAgentConfiguration,
  type AgentConversationConfiguration,
  type ReleaseDependency,
} from '@quantum-parks/domain';
import { DatabaseService } from './database.service.js';
import { WorkflowDispatchService } from './workflow-dispatch.service.js';
import { ElevenLabsIntegrationService } from './elevenlabs-integration.service.js';
import { AiosPlatformService } from './aios-platform.service.js';
import { AuditService } from './audit.service.js';

const developmentActorId = '00000000-0000-4000-8000-000000000001';

@Injectable()
export class PlatformService {
  constructor(
    private readonly database: DatabaseService,
    private readonly workflows: WorkflowDispatchService,
    private readonly elevenLabsIntegration: ElevenLabsIntegrationService,
    private readonly aios: AiosPlatformService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Resolves a principal to the `admin_users` row that represents them.
   *
   * Authorship and approval columns are uuids referring to real people, while a
   * principal carries an OIDC subject — the two are joined by `admin_users.oidc_subject`,
   * which is exactly what that column is for. Writing the subject straight into a uuid
   * column fails outright, and defaulting every actor to one system id would make the
   * independent-approver rule unverifiable, because author and reviewer would always be
   * the same person.
   *
   * An unrecognised subject falls back to the system actor rather than failing the
   * request: the audit entry still records the principal's own subject, so the identity
   * is never lost even when no user row exists yet.
   */
  private async actorId(principal: Principal): Promise<string> {
    const user = await this.database.db.query.adminUsers.findFirst({
      where: eq(adminUsers.oidcSubject, principal.subject),
    });
    return user?.id ?? process.env.QP_SYSTEM_ACTOR_ID ?? developmentActorId;
  }

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

  /** One agent version with its full configuration, for the conversation editor. */
  async getAgentVersion(versionId: string) {
    const version = await this.database.db.query.agentConfigVersions.findFirst({
      where: eq(agentConfigVersions.id, versionId),
    });
    if (!version) return { status: 'NOT_FOUND' as const };

    const [agent, approvals, deployment] = await Promise.all([
      this.database.db.query.voiceAgents.findFirst({ where: eq(voiceAgents.id, version.agentId) }),
      this.database.db
        .select()
        .from(agentApprovals)
        .where(eq(agentApprovals.agentVersionId, versionId)),
      this.database.db.query.agentDeployments.findFirst({
        where: eq(agentDeployments.agentVersionId, versionId),
      }),
    ]);

    return {
      status: 'OK' as const,
      version: {
        id: version.id,
        agentId: version.agentId,
        agentName: agent?.name ?? 'Unknown agent',
        version: version.version,
        state: version.state,
        configuration: version.configuration,
        checksum: version.checksum,
        changeReason: version.changeReason,
        authorId: version.authorId,
        synthetic: version.synthetic,
        createdAt: version.createdAt,
        // Only a draft is editable. Everything else is an immutable historical record,
        // and the editor must not offer to change something that is already published.
        editable: version.state === 'DRAFT' || version.state === 'CHANGES_REQUESTED',
        approvals,
        deployment: deployment ?? null,
      },
    };
  }

  /**
   * Starts a new draft from an existing version.
   *
   * A change never edits the version callers are hearing. It creates the next version,
   * which then has to travel the whole review, test and publication path on its own.
   */
  async createAgentVersionDraft(agentId: string, sourceVersionId?: string) {
    const versions = await this.database.db
      .select()
      .from(agentConfigVersions)
      .where(eq(agentConfigVersions.agentId, agentId));
    if (versions.length === 0) return { status: 'NOT_FOUND' as const };

    const existingDraft = versions.find(
      (version) => version.state === 'DRAFT' || version.state === 'CHANGES_REQUESTED',
    );
    // One draft at a time per agent: two concurrent drafts would race for the next
    // version number and make the review queue ambiguous.
    if (existingDraft) {
      return { status: 'CONFLICT' as const, existingDraftId: existingDraft.id };
    }

    const source = sourceVersionId
      ? versions.find((version) => version.id === sourceVersionId)
      : (versions.find((version) => version.state === 'ACTIVE') ??
        [...versions].sort((left, right) => right.version - left.version)[0]);
    if (!source) return { status: 'NOT_FOUND' as const };

    const nextVersion = Math.max(...versions.map((version) => version.version)) + 1;
    const actorId = process.env.QP_SYSTEM_ACTOR_ID ?? developmentActorId;

    const [created] = await this.database.db
      .insert(agentConfigVersions)
      .values({
        agentId,
        version: nextVersion,
        state: 'DRAFT',
        configuration: source.configuration,
        checksum: source.checksum,
        changeReason: `Draft created from version ${source.version}`,
        authorId: actorId,
        synthetic: source.synthetic,
      })
      .returning();
    if (!created) return { status: 'FAILED' as const };

    await this.audit.append({
      actorType: 'USER',
      actorId,
      action: 'AGENT_VERSION_DRAFT_CREATED',
      aggregateType: 'AgentConfigVersion',
      aggregateId: created.id,
      purpose: 'RELEASE_MANAGEMENT',
      payload: { agentId, sourceVersion: source.version, version: nextVersion },
    });

    return { status: 'CREATED' as const, version: created };
  }

  /**
   * Saves an edited configuration onto a draft.
   *
   * Validation is server-side and structural: the interface cannot talk the platform
   * into accepting an out-of-range turn setting or a weakened safety instruction.
   */
  async updateAgentVersionConfiguration(input: {
    versionId: string;
    configuration: unknown;
    changeReason: string;
    allowAdditionalFragments: boolean;
  }) {
    const version = await this.database.db.query.agentConfigVersions.findFirst({
      where: eq(agentConfigVersions.id, input.versionId),
    });
    if (!version) return { status: 'NOT_FOUND' as const };

    // Published and in-review versions are immutable. Editing one would change what
    // an approver already signed off, or what callers are currently hearing.
    if (version.state !== 'DRAFT' && version.state !== 'CHANGES_REQUESTED') {
      return { status: 'CONFLICT' as const, currentState: version.state };
    }

    // Reported rather than silently corrected: an author who tried to drop a safety
    // instruction should be told, not quietly overruled.
    if (attemptsPolicyOverride(input.configuration)) {
      return {
        status: 'FORBIDDEN' as const,
        message:
          'The safety policy fragments are code-owned. They cannot be removed or reworded by any role.',
      };
    }

    const validation = validateAgentConfiguration(input.configuration, {
      allowAdditionalFragments: input.allowAdditionalFragments,
    });
    if (!validation.valid) {
      return { status: 'INVALID' as const, issues: validation.issues };
    }

    const configuration = validation.configuration as AgentConversationConfiguration;
    const checksum = createHash('sha256').update(JSON.stringify(configuration)).digest('hex');
    const actorId = process.env.QP_SYSTEM_ACTOR_ID ?? developmentActorId;

    const [updated] = await this.database.db
      .update(agentConfigVersions)
      .set({
        configuration: configuration as unknown as Record<string, unknown>,
        checksum,
        changeReason: input.changeReason,
      })
      .where(eq(agentConfigVersions.id, input.versionId))
      .returning();
    if (!updated) return { status: 'FAILED' as const };

    await this.audit.append({
      actorType: 'USER',
      actorId,
      action: 'AGENT_VERSION_CONFIGURATION_UPDATED',
      aggregateType: 'AgentConfigVersion',
      aggregateId: input.versionId,
      purpose: 'RELEASE_MANAGEMENT',
      payload: {
        version: updated.version,
        changeReason: input.changeReason,
        checksum,
        additionalFragmentsPermitted: input.allowAdditionalFragments,
      },
    });

    return { status: 'SAVED' as const, version: updated };
  }

  /**
   * Submits a draft for review. Separate from saving so that an author can iterate
   * without repeatedly notifying reviewers.
   */
  async submitAgentVersionForReview(versionId: string) {
    const version = await this.database.db.query.agentConfigVersions.findFirst({
      where: eq(agentConfigVersions.id, versionId),
    });
    if (!version) return { status: 'NOT_FOUND' as const };
    if (version.state !== 'DRAFT' && version.state !== 'CHANGES_REQUESTED') {
      return { status: 'CONFLICT' as const, currentState: version.state };
    }

    const validation = validateAgentConfiguration(version.configuration, {
      allowAdditionalFragments: true,
    });
    // Re-validated at submission rather than trusted from save time: the code-owned
    // policy or the accepted runtime ranges may have moved since the draft was written.
    if (!validation.valid) {
      return { status: 'INVALID' as const, issues: validation.issues };
    }

    const [updated] = await this.database.db
      .update(agentConfigVersions)
      .set({ state: 'IN_REVIEW' })
      .where(eq(agentConfigVersions.id, versionId))
      .returning();

    await this.audit.append({
      actorType: 'USER',
      actorId: process.env.QP_SYSTEM_ACTOR_ID ?? developmentActorId,
      action: 'AGENT_VERSION_SUBMITTED_FOR_REVIEW',
      aggregateType: 'AgentConfigVersion',
      aggregateId: versionId,
      purpose: 'RELEASE_MANAGEMENT',
      payload: { version: version.version },
    });

    return { status: 'SUBMITTED' as const, version: updated };
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

  /**
   * The release pipeline for one agent: every version, its approval and test evidence,
   * its deployment, and any unresolved drift.
   */
  async getReleasePipeline(agentId: string) {
    const [versions, approvals, runs, deployments, drift] = await Promise.all([
      this.database.db
        .select()
        .from(agentConfigVersions)
        .where(eq(agentConfigVersions.agentId, agentId)),
      this.database.db.select().from(agentApprovals),
      this.database.db.select().from(testRuns),
      this.database.db.select().from(agentDeployments),
      this.database.db
        .select({ finding: agentDriftFindings, deployment: agentDeployments })
        .from(agentDriftFindings)
        .innerJoin(agentDeployments, eq(agentDriftFindings.deploymentId, agentDeployments.id)),
    ]);

    const ordered = [...versions].sort((left, right) => right.version - left.version);

    return {
      versions: ordered.map((version) => {
        const deployment = deployments.find((row) => row.agentVersionId === version.id);
        const versionDrift = drift.filter(
          (row) => row.deployment.agentVersionId === version.id && !row.finding.resolvedAt,
        );
        const versionRuns = runs.filter((run) => run.agentVersionId === version.id);
        const lastRun = [...versionRuns].sort(
          (left, right) => right.startedAt.getTime() - left.startedAt.getTime(),
        )[0];
        return {
          id: version.id,
          version: version.version,
          state: version.state,
          changeReason: version.changeReason,
          checksum: version.checksum,
          createdAt: version.createdAt,
          approvals: approvals
            .filter((approval) => approval.agentVersionId === version.id)
            .map((approval) => ({
              reviewerId: approval.reviewerId,
              decision: approval.decision,
              reason: approval.reason,
              createdAt: approval.createdAt,
            })),
          testEvidence: lastRun
            ? {
                runId: lastRun.id,
                status: lastRun.status,
                passCount: lastRun.passCount,
                failCount: lastRun.failCount,
                completedAt: lastRun.completedAt,
              }
            : null,
          deployment: deployment
            ? {
                id: deployment.id,
                syncState: deployment.syncState,
                providerAgentId: deployment.providerAgentId,
                localChecksum: deployment.localChecksum,
                remoteChecksum: deployment.remoteChecksum,
                // The comparison that decides whether a publication actually took.
                readBackMatches:
                  deployment.remoteChecksum !== null &&
                  deployment.remoteChecksum === deployment.localChecksum,
                publishedAt: deployment.publishedAt,
                verifiedAt: deployment.verifiedAt,
              }
            : null,
          drift: versionDrift.map((row) => ({
            id: row.finding.id,
            severity: row.finding.severity,
            path: row.finding.path,
            localValueHash: row.finding.localValueHash,
            remoteValueHash: row.finding.remoteValueHash,
          })),
          // Only a version that has already been live is a rollback candidate.
          rollbackCandidate: ['SUPERSEDED', 'ROLLED_BACK'].includes(version.state),
        };
      }),
    };
  }

  /**
   * Reads the published agent back from the provider and compares it to the approved
   * local record.
   *
   * A publication is not successful because the request returned 200. It is successful
   * when the object the provider actually holds matches what was approved, so this
   * compares checksums and records a drift finding when they differ. Local records stay
   * authoritative either way — the remote object is a runtime copy.
   */
  async verifyDeploymentReadBack(versionId: string) {
    const [version, deployment] = await Promise.all([
      this.database.db.query.agentConfigVersions.findFirst({
        where: eq(agentConfigVersions.id, versionId),
      }),
      this.database.db.query.agentDeployments.findFirst({
        where: eq(agentDeployments.agentVersionId, versionId),
      }),
    ]);
    if (!version || !deployment) return { status: 'NOT_FOUND' as const };

    const provider = await this.providerAdapter();
    let remoteChecksum: string | null = null;
    let providerError: string | null = null;
    try {
      const remote = deployment.providerAgentId
        ? await provider.getAgent(deployment.providerAgentId)
        : null;
      remoteChecksum = remote
        ? createHash('sha256').update(JSON.stringify(remote)).digest('hex')
        : null;
    } catch (error) {
      providerError = error instanceof Error ? error.message : 'Provider read-back failed';
    }

    const matches = remoteChecksum !== null && remoteChecksum === deployment.localChecksum;
    const syncState = providerError
      ? ('PUBLISH_FAILED' as const)
      : remoteChecksum === null
        ? ('REMOTE_MISSING' as const)
        : matches
          ? ('IN_SYNC' as const)
          : ('DRIFTED' as const);

    await this.database.db
      .update(agentDeployments)
      .set({ remoteChecksum, syncState, verifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(agentDeployments.id, deployment.id));

    // Divergence is recorded as evidence, not silently overwritten in either direction.
    if (syncState === 'DRIFTED') {
      await this.database.db.insert(agentDriftFindings).values({
        deploymentId: deployment.id,
        severity: 'HIGH',
        path: 'agent.configuration',
        localValueHash: deployment.localChecksum,
        remoteValueHash: remoteChecksum,
      });
    }

    await this.audit.append({
      actorType: 'SYSTEM',
      action: 'AGENT_DEPLOYMENT_READ_BACK',
      aggregateType: 'AgentDeployment',
      aggregateId: deployment.id,
      purpose: 'RELEASE_MANAGEMENT',
      payload: { versionId, syncState, matches, providerError },
    });

    return {
      status: 'VERIFIED' as const,
      matches,
      syncState,
      localChecksum: deployment.localChecksum,
      remoteChecksum,
      providerError,
      // Activation is granted by the comparison, never by the publish call returning.
      activated: matches,
    };
  }

  /**
   * Records that a drift finding has been reconciled.
   *
   * Reconciliation means a person decided which side is correct and acted. It does not
   * copy the remote value into the local record: local approved versions are
   * authoritative, so the remedy for drift is republishing, not adopting.
   */
  async resolveDriftFinding(findingId: string, resolution: string) {
    const finding = await this.database.db.query.agentDriftFindings.findFirst({
      where: eq(agentDriftFindings.id, findingId),
    });
    if (!finding) return { status: 'NOT_FOUND' as const };
    if (finding.resolvedAt) return { status: 'CONFLICT' as const, resolvedAt: finding.resolvedAt };

    const [updated] = await this.database.db
      .update(agentDriftFindings)
      .set({ resolvedAt: new Date(), resolution, updatedAt: new Date() })
      .where(eq(agentDriftFindings.id, findingId))
      .returning();

    await this.audit.append({
      actorType: 'USER',
      actorId: process.env.QP_SYSTEM_ACTOR_ID ?? developmentActorId,
      action: 'AGENT_DRIFT_RESOLVED',
      aggregateType: 'AgentDriftFinding',
      aggregateId: findingId,
      purpose: 'RELEASE_MANAGEMENT',
      payload: { resolution, path: finding.path },
    });

    return { status: 'RESOLVED' as const, finding: updated };
  }

  /**
   * Rolls back to a previously approved version.
   *
   * The rolled-back version is marked, never deleted, and the version being restored is
   * republished rather than edited — so the history of what was live and when stays
   * intact and auditable.
   */
  async rollbackToVersion(agentId: string, targetVersionId: string) {
    const versions = await this.database.db
      .select()
      .from(agentConfigVersions)
      .where(eq(agentConfigVersions.agentId, agentId));

    const target = versions.find((version) => version.id === targetVersionId);
    const current = versions.find((version) => version.state === 'ACTIVE');
    if (!target) return { status: 'NOT_FOUND' as const };

    const blockers: string[] = [];
    if (!['SUPERSEDED', 'ROLLED_BACK', 'PUBLISHED'].includes(target.state)) {
      blockers.push(
        `Version ${target.version} was never live, so there is nothing to roll back to`,
      );
    }
    if (current?.id === targetVersionId) {
      blockers.push(`Version ${target.version} is already the live version`);
    }
    const approvals = await this.database.db
      .select()
      .from(agentApprovals)
      .where(eq(agentApprovals.agentVersionId, targetVersionId));
    if (!approvals.some((approval) => approval.decision === 'APPROVED')) {
      blockers.push('The target version has no approval evidence');
    }
    if (blockers.length > 0) return { status: 'BLOCKED' as const, blockers };

    await this.database.db.transaction(async (tx) => {
      if (current) {
        await tx
          .update(agentConfigVersions)
          .set({ state: 'ROLLED_BACK' })
          .where(eq(agentConfigVersions.id, current.id));
      }
      await tx
        .update(agentConfigVersions)
        .set({ state: 'ACTIVE' })
        .where(eq(agentConfigVersions.id, targetVersionId));
      // The restored version must be re-verified against the provider before it can be
      // treated as genuinely live again.
      await tx
        .update(agentDeployments)
        .set({ syncState: 'PUBLISH_PENDING', updatedAt: new Date() })
        .where(eq(agentDeployments.agentVersionId, targetVersionId));
    });

    await this.audit.append({
      actorType: 'USER',
      actorId: process.env.QP_SYSTEM_ACTOR_ID ?? developmentActorId,
      action: 'AGENT_VERSION_ROLLED_BACK',
      aggregateType: 'AgentConfigVersion',
      aggregateId: targetVersionId,
      purpose: 'RELEASE_MANAGEMENT',
      payload: {
        restoredVersion: target.version,
        supersededVersion: current?.version ?? null,
      },
    });

    return {
      status: 'ROLLED_BACK' as const,
      restoredVersion: target.version,
      supersededVersion: current?.version ?? null,
      requiresReadBack: true,
    };
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

  /* ------------------------------------------------------------- knowledge */

  /**
   * One knowledge asset with everything an approver needs to decide.
   *
   * Content is included for every version, because the point of the review screen is to
   * compare what is proposed against what is live — a summary cannot support that.
   */
  async knowledgeAsset(assetId: string) {
    const asset = await this.database.db.query.knowledgeAssets.findFirst({
      where: eq(knowledgeAssets.id, assetId),
    });
    if (!asset) return { status: 'NOT_FOUND' as const };

    const versions = await this.database.db
      .select()
      .from(knowledgeVersions)
      .where(eq(knowledgeVersions.assetId, assetId))
      .orderBy(desc(knowledgeVersions.version));
    const versionIds = versions.map((version) => version.id);

    const [approvals, syncs, assignments, conflicts, agents, tests] = await Promise.all([
      versionIds.length > 0
        ? this.database.db
            .select()
            .from(knowledgeApprovals)
            .where(inArray(knowledgeApprovals.knowledgeVersionId, versionIds))
        : Promise.resolve([]),
      versionIds.length > 0
        ? this.database.db
            .select()
            .from(knowledgeSyncs)
            .where(inArray(knowledgeSyncs.knowledgeVersionId, versionIds))
        : Promise.resolve([]),
      versionIds.length > 0
        ? this.database.db
            .select()
            .from(knowledgeAssignments)
            .where(inArray(knowledgeAssignments.knowledgeVersionId, versionIds))
        : Promise.resolve([]),
      versionIds.length > 0
        ? this.database.db
            .select()
            .from(knowledgeConflicts)
            .where(inArray(knowledgeConflicts.leftVersionId, versionIds))
        : Promise.resolve([]),
      this.database.db.select().from(agentConfigVersions),
      this.database.db.select().from(agentTests),
    ]);

    const active = versions.find((version) => version.state === 'ACTIVE');
    const live = active ?? versions.find((version) => version.state === 'PUBLISHED') ?? null;

    return {
      status: 'FOUND' as const,
      asset,
      // The version an approver is comparing against. Null when nothing is live yet,
      // which is a different situation from "no change" and is shown as such.
      liveVersionId: live?.id ?? null,
      versions: versions.map((version) => ({
        ...version,
        approvals: approvals
          .filter((approval) => approval.knowledgeVersionId === version.id)
          .map((approval) => ({
            reviewerId: approval.reviewerId,
            decision: approval.decision,
            reason: approval.reason,
            createdAt: approval.createdAt,
          })),
        sync: syncs.find((sync) => sync.knowledgeVersionId === version.id) ?? null,
        assignments: assignments
          .filter((assignment) => assignment.knowledgeVersionId === version.id)
          .map((assignment) => ({
            ...assignment,
            agentVersionLabel:
              agents.find((agent) => agent.id === assignment.agentVersionId)?.version ?? null,
          })),
      })),
      conflicts,
      // Offered as assignment targets. Only versions that could actually serve.
      agentVersions: agents
        .filter((agent) => ['APPROVED', 'PUBLISHED', 'ACTIVE'].includes(agent.state))
        .map((agent) => ({ id: agent.id, version: agent.version, state: agent.state })),
      // A high-risk asset with no test covering it is a gap worth seeing on this page.
      linkedTests: tests
        .filter((test) => !test.archived)
        .map((test) => ({ id: test.id, name: test.name, riskLevel: test.riskLevel })),
    };
  }

  /**
   * Saves an edit as a new version rather than mutating the existing one.
   *
   * Published knowledge is what an agent answered from, so a version that has ever been
   * live is evidence and must stay readable exactly as it was. Editing therefore always
   * supersedes; it never overwrites.
   */
  async editKnowledgeAsset(input: {
    assetId: string;
    content: string;
    changeReason: string;
    effectiveAt?: string | undefined;
    expiresAt?: string | undefined;
    principal: Principal;
  }) {
    const asset = await this.database.db.query.knowledgeAssets.findFirst({
      where: eq(knowledgeAssets.id, input.assetId),
    });
    if (!asset) return { status: 'NOT_FOUND' as const };

    const versions = await this.database.db
      .select()
      .from(knowledgeVersions)
      .where(eq(knowledgeVersions.assetId, input.assetId))
      .orderBy(desc(knowledgeVersions.version));

    const blockers: string[] = [];
    const effectiveAt = input.effectiveAt ? new Date(input.effectiveAt) : null;
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (effectiveAt && Number.isNaN(effectiveAt.getTime())) {
      blockers.push('The effective date is not a valid date');
    }
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      blockers.push('The expiry date is not a valid date');
    }
    if (effectiveAt && expiresAt && expiresAt <= effectiveAt) {
      blockers.push('Knowledge cannot expire before it takes effect');
    }

    const checksum = createHash('sha256').update(input.content).digest('hex');
    // An identical edit would produce a version indistinguishable from its predecessor
    // and an approval decision about nothing.
    const latest = versions[0];
    if (latest && latest.contentChecksum === checksum) {
      blockers.push(`This is identical to version ${latest.version}`);
    }
    // A draft already open for this asset would create two competing candidates with no
    // rule for which supersedes which.
    const openDraft = versions.find((version) => ['DRAFT', 'IN_REVIEW'].includes(version.state));
    if (openDraft) {
      blockers.push(
        `Version ${openDraft.version} is already ${openDraft.state.toLowerCase().replace('_', ' ')}`,
      );
    }
    if (blockers.length > 0) return { status: 'BLOCKED' as const, blockers };

    const nextVersion = (latest?.version ?? 0) + 1;
    const [created] = await this.database.db
      .insert(knowledgeVersions)
      .values({
        assetId: input.assetId,
        version: nextVersion,
        state: 'DRAFT',
        content: input.content,
        contentChecksum: checksum,
        changeReason: input.changeReason,
        createdBy: await this.actorId(input.principal),
        ...(effectiveAt ? { effectiveAt } : {}),
        ...(expiresAt ? { expiresAt } : {}),
      })
      .returning();
    if (!created) return { status: 'FAILED' as const };

    await this.audit.append({
      actorType: 'USER',
      actorId: input.principal.subject,
      action: 'KNOWLEDGE_VERSION_DRAFTED',
      aggregateType: 'KnowledgeVersion',
      aggregateId: created.id,
      purpose: 'RELEASE_MANAGEMENT',
      payload: {
        assetId: input.assetId,
        version: nextVersion,
        changeReason: input.changeReason,
        checksum,
      },
    });

    return { status: 'CREATED' as const, version: created };
  }

  /** Moves a draft into review. The state check is the only gate; submission is not restricted to the author. */
  async submitKnowledgeForReview(versionId: string, principal: Principal) {
    const version = await this.database.db.query.knowledgeVersions.findFirst({
      where: eq(knowledgeVersions.id, versionId),
    });
    if (!version) return { status: 'NOT_FOUND' as const };
    if (version.state !== 'DRAFT') {
      return { status: 'CONFLICT' as const, currentState: version.state };
    }

    const [updated] = await this.database.db
      .update(knowledgeVersions)
      .set({ state: 'IN_REVIEW' })
      .where(eq(knowledgeVersions.id, versionId))
      .returning();

    await this.audit.append({
      actorType: 'USER',
      actorId: principal.subject,
      action: 'KNOWLEDGE_VERSION_SUBMITTED',
      aggregateType: 'KnowledgeVersion',
      aggregateId: versionId,
      purpose: 'RELEASE_MANAGEMENT',
      payload: { assetId: version.assetId, version: version.version },
    });

    return { status: 'UPDATED' as const, from: 'DRAFT', to: 'IN_REVIEW', version: updated };
  }

  /**
   * Retries a failed or drifted synchronisation.
   *
   * Local approved state stays authoritative throughout: a retry re-sends what was
   * approved here, and never adopts the remote copy as the new truth.
   */
  async retryKnowledgeSync(syncId: string, principal: Principal) {
    const sync = await this.database.db.query.knowledgeSyncs.findFirst({
      where: eq(knowledgeSyncs.id, syncId),
    });
    if (!sync) return { status: 'NOT_FOUND' as const };
    if (sync.syncState === 'IN_SYNC' && sync.remoteChecksum === sync.localChecksum) {
      return { status: 'CONFLICT' as const, currentState: sync.syncState };
    }

    const version = await this.database.db.query.knowledgeVersions.findFirst({
      where: eq(knowledgeVersions.id, sync.knowledgeVersionId),
    });
    if (!version) return { status: 'NOT_FOUND' as const };
    if (!['APPROVED', 'PUBLISHED', 'ACTIVE', 'PUBLISH_FAILED', 'DRIFTED'].includes(version.state)) {
      return { status: 'BLOCKED' as const, blockers: [`The version is ${version.state}`] };
    }

    const dispatched = await this.workflows.dispatchKnowledgePublication(sync.knowledgeVersionId);
    await this.database.db
      .update(knowledgeSyncs)
      .set({ syncState: 'PUBLISH_PENDING', lastAttemptAt: new Date(), updatedAt: new Date() })
      .where(eq(knowledgeSyncs.id, syncId));

    await this.audit.append({
      actorType: 'USER',
      actorId: principal.subject,
      action: 'KNOWLEDGE_SYNC_RETRIED',
      aggregateType: 'KnowledgeSync',
      aggregateId: syncId,
      purpose: 'RELEASE_MANAGEMENT',
      payload: { previousState: sync.syncState, versionId: sync.knowledgeVersionId },
    });

    return {
      status: dispatched.queued ? ('QUEUED' as const) : ('TEMPORARILY_UNAVAILABLE' as const),
      workflowId: dispatched.workflowId,
    };
  }

  /** Assigns a knowledge version to an agent version for one language. */
  async assignKnowledge(input: {
    versionId: string;
    agentVersionId: string;
    language: string;
    park?: string | undefined;
    active: boolean;
    principal: Principal;
  }) {
    const version = await this.database.db.query.knowledgeVersions.findFirst({
      where: eq(knowledgeVersions.id, input.versionId),
    });
    if (!version) return { status: 'NOT_FOUND' as const };

    const blockers: string[] = [];
    // Assigning unapproved knowledge would put unreviewed content on a caller path.
    if (!['APPROVED', 'PUBLISHED', 'ACTIVE'].includes(version.state)) {
      blockers.push(`Only approved knowledge can be assigned; this version is ${version.state}`);
    }
    const asset = await this.database.db.query.knowledgeAssets.findFirst({
      where: eq(knowledgeAssets.id, version.assetId),
    });
    if (asset && asset.language !== input.language) {
      blockers.push(`This asset is written in ${asset.language}, not ${input.language}`);
    }
    const agent = await this.database.db.query.agentConfigVersions.findFirst({
      where: eq(agentConfigVersions.id, input.agentVersionId),
    });
    if (!agent) blockers.push('That agent version does not exist');
    if (blockers.length > 0) return { status: 'BLOCKED' as const, blockers };

    const existing = await this.database.db
      .select()
      .from(knowledgeAssignments)
      .where(
        and(
          eq(knowledgeAssignments.knowledgeVersionId, input.versionId),
          eq(knowledgeAssignments.agentVersionId, input.agentVersionId),
          eq(knowledgeAssignments.language, input.language),
        ),
      )
      .limit(1);

    // Idempotent: re-assigning the same triple updates it rather than failing on the
    // unique index or silently doing nothing.
    const [assignment] = existing[0]
      ? await this.database.db
          .update(knowledgeAssignments)
          .set({ active: input.active, ...(input.park ? { park: input.park } : {}) })
          .where(eq(knowledgeAssignments.id, existing[0].id))
          .returning()
      : await this.database.db
          .insert(knowledgeAssignments)
          .values({
            knowledgeVersionId: input.versionId,
            agentVersionId: input.agentVersionId,
            language: input.language,
            active: input.active,
            ...(input.park ? { park: input.park } : {}),
          })
          .returning();

    await this.audit.append({
      actorType: 'USER',
      actorId: input.principal.subject,
      action: 'KNOWLEDGE_ASSIGNMENT_SET',
      aggregateType: 'KnowledgeAssignment',
      aggregateId: assignment?.id ?? input.versionId,
      purpose: 'RELEASE_MANAGEMENT',
      payload: {
        versionId: input.versionId,
        agentVersionId: input.agentVersionId,
        language: input.language,
        active: input.active,
      },
    });

    return { status: 'SAVED' as const, assignment };
  }

  /**
   * Turns a detected knowledge gap into a draft an author then writes.
   *
   * The draft is deliberately empty of generated content and starts in DRAFT: generated
   * knowledge is never published, and the evidence that produced the gap is recorded in
   * the change reason so the author can see what callers actually asked.
   */
  async convertGapToDraft(gapId: string, principal: Principal) {
    const gap = await this.database.db.query.knowledgeGaps.findFirst({
      where: eq(knowledgeGaps.id, gapId),
    });
    if (!gap) return { status: 'NOT_FOUND' as const };
    if (gap.status !== 'OPEN') return { status: 'CONFLICT' as const, currentState: gap.status };

    const authorId = await this.actorId(principal);
    const placeholder = [
      `Draft raised from a detected knowledge gap: ${gap.title}`,
      '',
      `This was asked ${gap.frequency} times across ${gap.evidenceIds.length} recorded calls.`,
      'Replace this text with the approved answer before submitting it for review.',
    ].join('\n');
    const checksum = createHash('sha256').update(placeholder).digest('hex');

    const created = await this.database.db.transaction(async (tx) => {
      const [asset] = await tx
        .insert(knowledgeAssets)
        .values({
          title: gap.title,
          sourceType: 'KNOWLEDGE_GAP',
          category: 'UNCATEGORISED',
          language: gap.language,
          ...(gap.park ? { park: gap.park } : {}),
          ownerId: authorId,
          riskClass: 'MEDIUM',
          synthetic: (process.env.QP_ENVIRONMENT ?? 'development') !== 'production',
        })
        .returning();
      if (!asset) throw new Error('Knowledge asset was not created');

      const [version] = await tx
        .insert(knowledgeVersions)
        .values({
          assetId: asset.id,
          version: 1,
          state: 'DRAFT',
          content: placeholder,
          contentChecksum: checksum,
          changeReason: `Raised from knowledge gap ${gap.id}`,
          createdBy: authorId,
        })
        .returning();
      if (!version) throw new Error('Knowledge version was not created');

      await tx
        .update(knowledgeGaps)
        .set({ status: 'IN_PROGRESS', ownerId: authorId, updatedAt: new Date() })
        .where(eq(knowledgeGaps.id, gapId));

      return { asset, version };
    });

    await this.audit.append({
      actorType: 'USER',
      actorId: principal.subject,
      action: 'KNOWLEDGE_GAP_CONVERTED',
      aggregateType: 'KnowledgeAsset',
      aggregateId: created.asset.id,
      purpose: 'RELEASE_MANAGEMENT',
      payload: { gapId, title: gap.title, frequency: gap.frequency },
    });

    return {
      status: 'CREATED' as const,
      assetId: created.asset.id,
      versionId: created.version.id,
    };
  }

  async createKnowledgeDraft(input: {
    title: string;
    category: string;
    language: string;
    riskClass: 'LOW' | 'MEDIUM' | 'HIGH';
    content: string;
    park?: string;
    /** Optional so existing callers keep working; supplied, it becomes the author. */
    principal?: Principal;
  }) {
    // Authorship has to be the real caller for the independent-approver rule to mean
    // anything later. Falling back to the system actor keeps local seeding working.
    const authorId = input.principal
      ? await this.actorId(input.principal)
      : (process.env.QP_SYSTEM_ACTOR_ID ?? developmentActorId);
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
          ownerId: authorId,
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
          createdBy: authorId,
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

  /**
   * Records an approval or rejection of a knowledge version.
   *
   * The reviewer is the calling principal, not a system actor. That distinction is the
   * whole of two-person approval: while every decision was attributed to one shared
   * identity, "an independent approver" could never actually be checked, because the
   * author and the reviewer were always the same subject.
   */
  async decideKnowledge(
    id: string,
    decision: 'APPROVE' | 'REJECT',
    reason: string,
    principal: Principal,
  ) {
    const version = await this.database.db.query.knowledgeVersions.findFirst({
      where: eq(knowledgeVersions.id, id),
    });
    if (!version) return { status: 'NOT_FOUND' as const };
    if (!['DRAFT', 'IN_REVIEW'].includes(version.state))
      return { status: 'CONFLICT' as const, currentState: version.state };
    const asset = await this.database.db.query.knowledgeAssets.findFirst({
      where: eq(knowledgeAssets.id, version.assetId),
    });
    const reviewerId = await this.actorId(principal);

    const blockers: string[] = [];
    if (decision === 'APPROVE' && asset?.riskClass === 'HIGH' && version.createdBy === reviewerId) {
      blockers.push('High-risk knowledge requires an approver other than its author');
    }
    // The unique index on (version, reviewer) would reject this anyway; catching it here
    // means the operator gets a sentence rather than a constraint violation.
    const alreadyDecided = await this.database.db
      .select()
      .from(knowledgeApprovals)
      .where(
        and(
          eq(knowledgeApprovals.knowledgeVersionId, id),
          eq(knowledgeApprovals.reviewerId, reviewerId),
        ),
      )
      .limit(1);
    if (alreadyDecided[0]) {
      blockers.push('You have already recorded a decision on this version');
    }
    if (blockers.length > 0) return { status: 'BLOCKED' as const, blockers };

    const nextState = decision === 'APPROVE' ? ('APPROVED' as const) : ('DRAFT' as const);
    const result = await this.database.db.transaction(async (tx) => {
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
      return {
        status: decision === 'APPROVE' ? ('APPROVED' as const) : ('REJECTED' as const),
        release: updated,
      };
    });

    await this.audit.append({
      actorType: 'USER',
      actorId: reviewerId,
      action: decision === 'APPROVE' ? 'KNOWLEDGE_VERSION_APPROVED' : 'KNOWLEDGE_VERSION_REJECTED',
      aggregateType: 'KnowledgeVersion',
      aggregateId: id,
      purpose: 'RELEASE_MANAGEMENT',
      payload: { assetId: version.assetId, version: version.version, reason },
    });

    return result;
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

  /**
   * The voice catalogue with what a comparison or an approval decision actually needs:
   * whether a preview exists to listen to, whether a custom voice's consent is still
   * valid, and which agent versions currently use it.
   */
  async listVoices() {
    const [profiles, previews, consents, assignments] = await Promise.all([
      this.database.db.select().from(voiceProfiles).orderBy(voiceProfiles.name),
      this.database.db.select().from(voicePreviews),
      this.database.db.select().from(voiceConsentRecords),
      this.database.db.select().from(voiceAssignments),
    ]);

    const now = new Date();
    return {
      status: 'SUCCESS',
      data: profiles.map((voice) => {
        const consent = consents
          .filter((record) => record.voiceProfileId === voice.id)
          .sort((left, right) => right.validUntil.getTime() - left.validUntil.getTime())[0];
        // A voice can carry several consent records over time; only the most recent one
        // that has neither expired nor been revoked actually authorises use today.
        const consentValid = Boolean(consent && !consent.revokedAt && consent.validUntil > now);
        return {
          ...voice,
          preview: previews.find((preview) => preview.voiceProfileId === voice.id) ?? null,
          consent: consent
            ? {
                permittedUse: consent.permittedUse,
                validUntil: consent.validUntil,
                revokedAt: consent.revokedAt,
                valid: consentValid,
              }
            : null,
          assignments: assignments
            .filter((assignment) => assignment.voiceProfileId === voice.id)
            .map((assignment) => ({
              agentVersionId: assignment.agentVersionId,
              language: assignment.language,
              environment: assignment.environment,
              fallback: assignment.fallback,
            })),
        };
      }),
    };
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

  /**
   * Approves a voice for caller-facing use.
   *
   * A custom (cloned) voice may only be approved while a consent record for it is
   * currently valid — not expired, not revoked. Provider-catalogue voices carry no
   * speaker to consent, so the check does not apply to them.
   */
  async approveVoice(id: string, principal: Principal) {
    const voice = await this.database.db.query.voiceProfiles.findFirst({
      where: eq(voiceProfiles.id, id),
    });
    if (!voice) return { status: 'NOT_FOUND' as const };
    if (!voice.available) {
      return { status: 'BLOCKED' as const, blockers: ['The provider no longer offers this voice'] };
    }
    if (voice.custom) {
      const consents = await this.database.db
        .select()
        .from(voiceConsentRecords)
        .where(eq(voiceConsentRecords.voiceProfileId, id));
      const now = new Date();
      const hasValidConsent = consents.some(
        (record) => !record.revokedAt && record.validUntil > now,
      );
      if (!hasValidConsent) {
        return {
          status: 'BLOCKED' as const,
          blockers: ['This is a cloned voice with no currently valid speaker consent on file'],
        };
      }
    }

    const [updated] = await this.database.db
      .update(voiceProfiles)
      .set({ approved: true, updatedAt: new Date() })
      .where(eq(voiceProfiles.id, id))
      .returning();

    await this.audit.append({
      actorType: 'USER',
      actorId: principal.subject,
      action: 'VOICE_APPROVED',
      aggregateType: 'VoiceProfile',
      aggregateId: id,
      purpose: 'RELEASE_MANAGEMENT',
      payload: { name: voice.name, custom: voice.custom },
    });

    return { status: 'APPROVED' as const, voice: updated };
  }

  async assignVoice(input: {
    agentVersionId: string;
    voiceProfileId: string;
    language: string;
    environment: 'development' | 'staging' | 'production';
    fallback: boolean;
    principal: Principal;
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
      .values({
        agentVersionId: input.agentVersionId,
        voiceProfileId: input.voiceProfileId,
        language: input.language,
        environment: input.environment,
        fallback: input.fallback,
        approved: true,
      })
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

    await this.audit.append({
      actorType: 'USER',
      actorId: input.principal.subject,
      action: 'VOICE_ASSIGNED',
      aggregateType: 'VoiceAssignment',
      aggregateId: assignment?.id ?? input.voiceProfileId,
      purpose: 'RELEASE_MANAGEMENT',
      payload: {
        agentVersionId: input.agentVersionId,
        language: input.language,
        environment: input.environment,
        fallback: input.fallback,
      },
    });

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
  /**
   * Work-item transitions for callbacks and staff tasks.
   *
   * The two share a schema and a lifecycle, so they share this method. Transitions are
   * validated against the current state rather than trusted from the caller: a browser
   * showing a stale row must not be able to complete something already cancelled.
   */
  async transitionWorkItem(input: {
    kind: 'callback' | 'task';
    id: string;
    action: 'ASSIGN' | 'START' | 'COMPLETE' | 'CANCEL' | 'REOPEN' | 'RESCHEDULE' | 'REPRIORITISE';
    ownerId?: string | undefined;
    dueAt?: string | undefined;
    priority?: string | undefined;
    note?: string | undefined;
  }) {
    const table = input.kind === 'callback' ? callbackRequests : staffTasks;
    const [existing] = await this.database.db.select().from(table).where(eq(table.id, input.id));
    if (!existing) return { status: 'NOT_FOUND' as const };

    // A closed item is terminal. Reopening is its own explicit action so that
    // "complete" can never quietly resurrect something that was cancelled.
    const closed = ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(existing.status);
    if (closed && input.action !== 'REOPEN') {
      return { status: 'CONFLICT' as const, currentState: existing.status };
    }
    if (!closed && input.action === 'REOPEN') {
      return { status: 'CONFLICT' as const, currentState: existing.status };
    }
    if (input.action === 'COMPLETE' && !input.note) {
      return {
        status: 'INVALID' as const,
        issues: [
          { path: 'note', message: 'Completing work requires a note recording what was done' },
        ],
      };
    }

    const now = new Date();
    const changes: Record<string, unknown> = { updatedAt: now };

    switch (input.action) {
      case 'ASSIGN':
        if (!input.ownerId) {
          return {
            status: 'INVALID' as const,
            issues: [{ path: 'ownerId', message: 'An owner is required' }],
          };
        }
        changes.ownerId = input.ownerId;
        changes.status = existing.status === 'OPEN' ? 'ASSIGNED' : existing.status;
        break;
      case 'START':
        changes.status = 'IN_PROGRESS';
        break;
      case 'COMPLETE':
        changes.status = 'COMPLETED';
        changes.completedAt = now;
        break;
      case 'CANCEL':
        changes.status = 'CANCELLED';
        break;
      case 'REOPEN':
        changes.status = 'OPEN';
        changes.completedAt = null;
        break;
      case 'RESCHEDULE':
        if (!input.dueAt) {
          return {
            status: 'INVALID' as const,
            issues: [{ path: 'dueAt', message: 'A new due time is required' }],
          };
        }
        changes.dueAt = new Date(input.dueAt);
        break;
      case 'REPRIORITISE':
        if (!input.priority) {
          return {
            status: 'INVALID' as const,
            issues: [{ path: 'priority', message: 'A priority is required' }],
          };
        }
        changes.priority = input.priority;
        break;
    }

    const [updated] = await this.database.db
      .update(table)
      .set(changes)
      .where(eq(table.id, input.id))
      .returning();

    await this.audit.append({
      actorType: 'USER',
      actorId: process.env.QP_SYSTEM_ACTOR_ID ?? developmentActorId,
      action: `${input.kind === 'callback' ? 'CALLBACK' : 'STAFF_TASK'}_${input.action}`,
      aggregateType: input.kind === 'callback' ? 'CallbackRequest' : 'StaffTask',
      aggregateId: input.id,
      purpose: 'OPERATIONS',
      payload: {
        from: existing.status,
        to: changes.status ?? existing.status,
        note: input.note ?? null,
        conversationId: existing.conversationId,
      },
    });

    return { status: 'UPDATED' as const, item: updated, from: existing.status };
  }

  /**
   * Handoff outcomes. A transfer that nobody answered is recorded as failed and the
   * caller is owed a callback, so failing one creates that callback rather than
   * leaving the commitment implicit.
   */
  async transitionHandoff(input: {
    id: string;
    action: 'COMPLETE' | 'FAIL';
    note?: string | undefined;
  }) {
    const [existing] = await this.database.db
      .select()
      .from(handoffs)
      .where(eq(handoffs.id, input.id));
    if (!existing) return { status: 'NOT_FOUND' as const };
    if (existing.status === 'COMPLETED') {
      return { status: 'CONFLICT' as const, currentState: existing.status };
    }

    const now = new Date();
    const [updated] = await this.database.db
      .update(handoffs)
      .set({
        status: input.action === 'COMPLETE' ? 'COMPLETED' : 'FAILED_NO_ANSWER',
        completedAt: input.action === 'COMPLETE' ? now : null,
      })
      .where(eq(handoffs.id, input.id))
      .returning();

    let callbackCreated = false;
    if (input.action === 'FAIL') {
      // Idempotent on the conversation: retrying a failure must not promise the
      // customer two call-backs.
      const [callback] = await this.database.db
        .insert(callbackRequests)
        .values({
          conversationId: existing.conversationId,
          idempotencyKey: `handoff-fallback-${existing.id}`,
          priority: 'HIGH',
          reason: input.note ?? 'Transfer was not answered; caller is owed a call back',
          status: 'OPEN',
          dueAt: new Date(now.getTime() + 24 * 3_600_000),
        })
        .onConflictDoNothing({ target: callbackRequests.idempotencyKey })
        .returning();
      callbackCreated = Boolean(callback);
    }

    await this.audit.append({
      actorType: 'USER',
      actorId: process.env.QP_SYSTEM_ACTOR_ID ?? developmentActorId,
      action: `HANDOFF_${input.action}`,
      aggregateType: 'Handoff',
      aggregateId: input.id,
      purpose: 'OPERATIONS',
      payload: { from: existing.status, routeKey: existing.routeKey, callbackCreated },
    });

    return { status: 'UPDATED' as const, handoff: updated, callbackCreated };
  }

  /**
   * Message delivery actions.
   *
   * A retry creates a new delivery attempt rather than mutating the original, so the
   * record of what was attempted and when survives. The idempotency key carries the
   * attempt number, which is what stops a double-click sending two messages.
   */
  async transitionMessage(input: {
    id: string;
    action: 'RETRY' | 'CANCEL';
    channel?: string | undefined;
  }) {
    const [existing] = await this.database.db
      .select()
      .from(messageDeliveries)
      .where(eq(messageDeliveries.id, input.id));
    if (!existing) return { status: 'NOT_FOUND' as const };

    if (input.action === 'CANCEL') {
      if (existing.status === 'DELIVERED') {
        return { status: 'CONFLICT' as const, currentState: existing.status };
      }
      const [updated] = await this.database.db
        .update(messageDeliveries)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(eq(messageDeliveries.id, input.id))
        .returning();
      await this.audit.append({
        actorType: 'USER',
        actorId: process.env.QP_SYSTEM_ACTOR_ID ?? developmentActorId,
        action: 'MESSAGE_CANCELLED',
        aggregateType: 'MessageDelivery',
        aggregateId: input.id,
        purpose: 'OPERATIONS',
        payload: { from: existing.status },
      });
      return { status: 'UPDATED' as const, delivery: updated };
    }

    if (existing.status === 'DELIVERED') {
      return { status: 'CONFLICT' as const, currentState: existing.status };
    }

    const attempts = await this.database.db
      .select()
      .from(messageDeliveries)
      .where(eq(messageDeliveries.conversationId, existing.conversationId));
    const attemptNumber = attempts.length + 1;
    const channel = input.channel ?? existing.channel;

    const [retry] = await this.database.db
      .insert(messageDeliveries)
      .values({
        conversationId: existing.conversationId,
        digitalLinkId: existing.digitalLinkId,
        channel,
        templateKey: existing.templateKey,
        idempotencyKey: `${existing.idempotencyKey}-retry-${attemptNumber}`,
        status: 'QUEUED',
        sentAt: null,
      })
      .onConflictDoNothing({ target: messageDeliveries.idempotencyKey })
      .returning();

    if (!retry) return { status: 'CONFLICT' as const, currentState: 'RETRY_ALREADY_QUEUED' };

    await this.audit.append({
      actorType: 'USER',
      actorId: process.env.QP_SYSTEM_ACTOR_ID ?? developmentActorId,
      action: 'MESSAGE_RETRIED',
      aggregateType: 'MessageDelivery',
      aggregateId: retry.id,
      purpose: 'OPERATIONS',
      payload: {
        originalId: input.id,
        attemptNumber,
        channel,
        channelChanged: channel !== existing.channel,
      },
    });

    return {
      status: 'RETRIED' as const,
      delivery: retry,
      attemptNumber,
      channelChanged: channel !== existing.channel,
    };
  }

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
