import { createDecipheriv, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { and, eq, isNull } from 'drizzle-orm';
import {
  callClassifications,
  callEntities,
  callOutcomes,
  callSummaries,
  callbackRequests,
  agentConfigVersions,
  agentDeployments,
  agentDriftFindings,
  conversations,
  createDatabase,
  handoffs,
  inboxEvents,
  knowledgeAssets,
  knowledgeSyncs,
  knowledgeVersions,
  messageDeliveries,
  encryptedProviderCredentials,
  providerConversations,
  providerCredentialReferences,
  providerIntegrations,
  providerWorkspaces,
  redactions,
  staffTasks,
  toolInvocations,
  transcriptRevisions,
  transcriptTurns,
  webhookInboxEntries,
} from '@quantum-parks/db';
import {
  deriveDeterministicOutcome,
  redactPaymentData,
  type TrustedEvent,
} from '@quantum-parks/domain';
import {
  DeterministicLocalProvider,
  OpenAIResponsesProvider,
  enrichNonBlocking,
  type EnrichmentProvider,
} from '@quantum-parks/intelligence';
import type { PostCallActivities } from '@quantum-parks/workflows';
import { HttpElevenLabsAdapter, canonicalProviderChecksum } from '@quantum-parks/elevenlabs';
import { runtimeSecret } from '@quantum-parks/config';

const connection = createDatabase(
  process.env.DATABASE_URL ??
    'postgresql://quantum_parks:quantum_parks@localhost:5432/quantum_parks',
);
const db = connection.db;

async function providerAdapter() {
  const integration = await db.query.providerIntegrations.findFirst({
    where: eq(providerIntegrations.provider, 'ELEVENLABS'),
  });
  if (integration && integration.status !== 'DISCONNECTED') {
    const reference = await db.query.providerCredentialReferences.findFirst({
      where: and(
        eq(providerCredentialReferences.id, integration.credentialReferenceId),
        eq(providerCredentialReferences.active, true),
      ),
    });
    const encrypted = reference
      ? await db.query.encryptedProviderCredentials.findFirst({
          where: and(
            eq(encryptedProviderCredentials.secretReference, reference.secretReference),
            isNull(encryptedProviderCredentials.revokedAt),
          ),
        })
      : undefined;
    if (encrypted) {
      const encodedKey =
        process.env.PROVIDER_CREDENTIAL_MASTER_KEY ??
        (process.env.PROVIDER_CREDENTIAL_MASTER_KEY_FILE
          ? readFileSync(process.env.PROVIDER_CREDENTIAL_MASTER_KEY_FILE, 'utf8')
          : '');
      const masterKey = Buffer.from(encodedKey.trim(), 'base64');
      if (masterKey.length !== 32) throw new Error('Provider credential vault is unavailable');
      const decipher = createDecipheriv(
        'aes-256-gcm',
        masterKey,
        Buffer.from(encrypted.initializationVector, 'base64'),
      );
      decipher.setAAD(
        Buffer.from(`ELEVENLABS:${encrypted.secretReference}:${encrypted.keyVersion}`),
      );
      decipher.setAuthTag(Buffer.from(encrypted.authenticationTag, 'base64'));
      const apiKey = Buffer.concat([
        decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
      return new HttpElevenLabsAdapter({
        baseUrl:
          integration.environment === 'PRODUCTION' ||
          (process.env.QP_ENVIRONMENT ?? 'development') === 'production'
            ? 'https://api.elevenlabs.io'
            : (process.env.ELEVENLABS_SANDBOX_BASE_URL ?? 'http://localhost:4100'),
        apiKeyReference: `integration/${integration.id}`,
        workspaceId: 'configured-provider-workspace',
        resolveSecret: async () => apiKey,
      });
    }
  }
  return new HttpElevenLabsAdapter({
    baseUrl: process.env.ELEVENLABS_BASE_URL ?? 'http://localhost:4100',
    apiKeyReference: process.env.ELEVENLABS_SECRET_REF ?? 'local/elevenlabs/api-key',
    workspaceId: process.env.ELEVENLABS_WORKSPACE_ID ?? 'workspace_synthetic',
    resolveSecret: async () => runtimeSecret('LOCAL_ELEVENLABS_API_KEY', 'synthetic-api-key'),
  });
}

function projectRemote(
  remote: Record<string, unknown>,
  local: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(local)
      .filter((key) => remote[key] !== undefined)
      .map((key) => [key, remote[key]]),
  );
}

type ProviderTurn = { role?: unknown; message?: unknown; time_in_call_secs?: unknown };

function normalizeTurns(
  value: unknown[],
): Array<{ speaker: string; content: string; startedAtMs: number | null }> {
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const turn = candidate as ProviderTurn;
    if (typeof turn.role !== 'string' || typeof turn.message !== 'string') return [];
    return [
      {
        speaker: turn.role.toUpperCase(),
        content: turn.message.normalize('NFKC').trim(),
        startedAtMs:
          typeof turn.time_in_call_secs === 'number'
            ? Math.round(turn.time_in_call_secs * 1_000)
            : null,
      },
    ];
  });
}

function enrichmentProvider(): EnrichmentProvider | undefined {
  const selected = process.env.ENRICHMENT_PROVIDER ?? 'deterministic-local';
  if (selected === 'deterministic-local') return new DeterministicLocalProvider();
  if (selected === 'openai-responses' && process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL) {
    return new OpenAIResponsesProvider({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL,
      ...(process.env.OPENAI_BASE_URL ? { baseUrl: process.env.OPENAI_BASE_URL } : {}),
    });
  }
  return undefined;
}

async function recordDrift(
  deploymentId: string,
  localValueHash: string | null,
  remoteValueHash: string | null,
) {
  const existing = await db.query.agentDriftFindings.findFirst({
    where: and(
      eq(agentDriftFindings.deploymentId, deploymentId),
      eq(agentDriftFindings.path, '$'),
      isNull(agentDriftFindings.resolvedAt),
    ),
  });
  if (existing) {
    await db
      .update(agentDriftFindings)
      .set({ localValueHash, remoteValueHash, updatedAt: new Date() })
      .where(eq(agentDriftFindings.id, existing.id));
    return;
  }
  await db.insert(agentDriftFindings).values({
    deploymentId,
    severity: 'HIGH',
    path: '$',
    localValueHash,
    remoteValueHash,
  });
}

async function resolveDrift(deploymentId: string) {
  await db
    .update(agentDriftFindings)
    .set({
      resolvedAt: new Date(),
      resolution: 'REMOTE_MATCHES_APPROVED_LOCAL_RELEASE',
      updatedAt: new Date(),
    })
    .where(
      and(eq(agentDriftFindings.deploymentId, deploymentId), isNull(agentDriftFindings.resolvedAt)),
    );
}

export const activities: PostCallActivities = {
  async normalizeAndRedact(input) {
    const existing = await db.query.transcriptRevisions.findFirst({
      where: and(
        eq(transcriptRevisions.conversationId, input.conversationId),
        eq(transcriptRevisions.revisionType, 'REDACTED'),
      ),
    });
    if (existing) {
      const existingRedactions = await db
        .select({ id: redactions.id })
        .from(redactions)
        .innerJoin(transcriptTurns, eq(redactions.turnId, transcriptTurns.id))
        .where(eq(transcriptTurns.revisionId, existing.id));
      return {
        conversationId: input.conversationId,
        transcriptRevisionId: existing.id,
        paymentDataDetected: existingRedactions.length > 0,
      };
    }

    const rows = await db
      .select({ transcript: providerConversations.providerTranscript })
      .from(conversations)
      .innerJoin(
        providerConversations,
        eq(conversations.providerConversationId, providerConversations.id),
      )
      .where(eq(conversations.id, input.conversationId))
      .limit(1);
    const row = rows[0];
    if (!row) throw new Error('Conversation does not have provider transcript evidence');
    const normalized = normalizeTurns(row.transcript);
    if (normalized.length === 0) throw new Error('Provider transcript contains no usable turns');

    return db.transaction(async (tx) => {
      await tx
        .update(conversations)
        .set({ processingState: 'NORMALIZING', updatedAt: new Date() })
        .where(eq(conversations.id, input.conversationId));
      const [canonical] = await tx
        .insert(transcriptRevisions)
        .values({
          conversationId: input.conversationId,
          revision: 1,
          revisionType: 'CANONICAL',
          reason: 'Normalized from immutable provider transcript evidence',
        })
        .returning({ id: transcriptRevisions.id });
      if (!canonical) throw new Error('Canonical transcript revision was not created');
      await tx.insert(transcriptTurns).values(
        normalized.map((turn, sequence) => ({
          revisionId: canonical.id,
          sequence,
          speaker: turn.speaker,
          content: turn.content,
          startedAtMs: turn.startedAtMs,
          classification: 'CONFIDENTIAL' as const,
        })),
      );

      const [redacted] = await tx
        .insert(transcriptRevisions)
        .values({
          conversationId: input.conversationId,
          revision: 2,
          revisionType: 'REDACTED',
          sourceRevisionId: canonical.id,
          reason: 'Automated restricted-data redaction',
        })
        .returning({ id: transcriptRevisions.id });
      if (!redacted) throw new Error('Redacted transcript revision was not created');

      let paymentDataDetected = false;
      for (const [sequence, turn] of normalized.entries()) {
        const result = redactPaymentData(turn.content);
        paymentDataDetected ||= result.paymentDataDetected;
        const [storedTurn] = await tx
          .insert(transcriptTurns)
          .values({
            revisionId: redacted.id,
            sequence,
            speaker: turn.speaker,
            content: result.text,
            startedAtMs: turn.startedAtMs,
            classification: result.paymentDataDetected ? 'RESTRICTED' : 'CONFIDENTIAL',
          })
          .returning({ id: transcriptTurns.id });
        if (result.paymentDataDetected && storedTurn) {
          await tx.insert(redactions).values({
            turnId: storedTurn.id,
            redactionType: 'PAYMENT_CARD_NUMBER',
            detectorVersion: 'payment-redactor-v1',
            restrictedMetadata: { detectionCount: result.detectionCount },
          });
        }
      }
      await tx
        .update(conversations)
        .set({ processingState: 'REDACTED', sensitive: paymentDataDetected, updatedAt: new Date() })
        .where(eq(conversations.id, input.conversationId));
      return {
        conversationId: input.conversationId,
        transcriptRevisionId: redacted.id,
        paymentDataDetected,
      };
    });
  },

  async enrichConversation(input) {
    const alreadyEnriched = await db.query.callSummaries.findFirst({
      where: eq(callSummaries.conversationId, input.conversationId),
    });
    if (alreadyEnriched) return { state: 'COMPLETED' };
    const provider = enrichmentProvider();
    if (!provider) return { state: 'PARTIAL' };
    const turns = await db
      .select({
        id: transcriptTurns.id,
        speaker: transcriptTurns.speaker,
        content: transcriptTurns.content,
      })
      .from(transcriptTurns)
      .where(eq(transcriptTurns.revisionId, input.transcriptRevisionId))
      .orderBy(transcriptTurns.sequence);
    await db
      .update(conversations)
      .set({ processingState: 'SUMMARIZING', updatedAt: new Date() })
      .where(eq(conversations.id, input.conversationId));
    const enriched = await enrichNonBlocking(provider, { turns });
    if (enriched.state === 'PARTIAL') return { state: 'PARTIAL' };

    await db.transaction(async (tx) => {
      await tx.insert(callSummaries).values({
        conversationId: input.conversationId,
        transcriptRevisionId: input.transcriptRevisionId,
        revision: 1,
        summary: enriched.output.summary,
        provider: enriched.output.provider,
        model: enriched.output.model,
        ...(enriched.output.modelVersion ? { modelVersion: enriched.output.modelVersion } : {}),
        promptVersion: enriched.output.promptVersion,
        schemaVersion: enriched.output.schemaVersion,
        evidenceCoverage: String(enriched.output.summary.evidence_coverage),
      });
      const [classification] = await tx
        .insert(callClassifications)
        .values({
          conversationId: input.conversationId,
          transcriptRevisionId: input.transcriptRevisionId,
          revision: 1,
          primaryIntent: enriched.output.classification.primary_intent,
          secondaryIntents: enriched.output.classification.secondary_intents,
          taxonomyVersion: 'qp-intent-taxonomy-v1',
          provider: enriched.output.provider,
          model: enriched.output.model,
          promptVersion: enriched.output.promptVersion,
          schemaVersion: enriched.output.schemaVersion,
          confidence: '1',
          evidenceIds: enriched.output.classification.evidence_ids,
        })
        .returning({ id: callClassifications.id });
      if (classification && enriched.output.classification.park) {
        await tx.insert(callEntities).values({
          classificationId: classification.id,
          entityType: 'PARK',
          value: enriched.output.classification.park,
          confidence: '1',
          evidenceIds: enriched.output.classification.evidence_ids,
        });
      }
      await tx
        .update(conversations)
        .set({
          processingState: 'CLASSIFYING',
          language: enriched.output.classification.language,
          park: enriched.output.classification.park,
          ...(enriched.output.classification.sensitive ? { sensitive: true } : {}),
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, input.conversationId));
    });
    return { state: 'COMPLETED' };
  },

  async deriveOutcome(input) {
    const existing = await db.query.callOutcomes.findFirst({
      where: eq(callOutcomes.conversationId, input.conversationId),
    });
    if (existing) return;
    const [tools, transfers, deliveries, callbacks, tasks, paymentRedactions] = await Promise.all([
      db
        .select()
        .from(toolInvocations)
        .where(eq(toolInvocations.conversationId, input.conversationId)),
      db.select().from(handoffs).where(eq(handoffs.conversationId, input.conversationId)),
      db
        .select()
        .from(messageDeliveries)
        .where(eq(messageDeliveries.conversationId, input.conversationId)),
      db
        .select()
        .from(callbackRequests)
        .where(eq(callbackRequests.conversationId, input.conversationId)),
      db.select().from(staffTasks).where(eq(staffTasks.conversationId, input.conversationId)),
      db
        .select({ id: redactions.id })
        .from(redactions)
        .innerJoin(transcriptTurns, eq(redactions.turnId, transcriptTurns.id))
        .innerJoin(transcriptRevisions, eq(transcriptTurns.revisionId, transcriptRevisions.id))
        .where(eq(transcriptRevisions.conversationId, input.conversationId)),
    ]);
    const events: TrustedEvent[] = [
      ...tools.map((item) => ({
        type: 'TOOL_RESULT' as const,
        status: item.resultStatus === 'SUCCESS' ? ('SUCCESS' as const) : ('FAILED' as const),
        referenceId: item.id,
      })),
      ...transfers.map((item) => ({
        type: 'TRANSFER_RESULT' as const,
        status: item.status === 'COMPLETED' ? ('SUCCESS' as const) : ('FAILED' as const),
        referenceId: item.id,
      })),
      ...deliveries.map((item) => ({
        type: 'DELIVERY_RECEIPT' as const,
        status: item.status === 'DELIVERED' ? ('SUCCESS' as const) : ('UNCONFIRMED' as const),
        referenceId: item.id,
      })),
      ...callbacks.map((item) => ({
        type: 'CALLBACK_PERSISTED' as const,
        status: 'SUCCESS' as const,
        referenceId: item.id,
      })),
      ...tasks.map((item) => ({
        type: 'TASK_PERSISTED' as const,
        status: 'SUCCESS' as const,
        referenceId: item.id,
      })),
      ...paymentRedactions.map((item) => ({
        type: 'POLICY_DETECTION' as const,
        status: 'SUCCESS' as const,
        referenceId: item.id,
        code: 'PAYMENT_DATA',
      })),
      {
        type: 'CONVERSATION_END',
        status: 'SUCCESS',
        referenceId: `conversation:${input.conversationId}`,
      },
    ];
    const outcome = deriveDeterministicOutcome(events);
    await db.insert(callOutcomes).values({
      conversationId: input.conversationId,
      outcome: outcome.outcome,
      evidenceIds: outcome.evidenceIds,
      policyVersion: 'deterministic-outcomes-v1',
    });
  },

  async linkAndFollowUp(input) {
    await db
      .update(conversations)
      .set({ processingState: 'FOLLOW_UP', updatedAt: new Date() })
      .where(eq(conversations.id, input.conversationId));
  },

  async aggregateConversation(input) {
    await db
      .update(conversations)
      .set({ processingState: 'AGGREGATED', updatedAt: new Date() })
      .where(eq(conversations.id, input.conversationId));
  },

  async completeProcessing(input) {
    await db.transaction(async (tx) => {
      await tx
        .update(conversations)
        .set({ processingState: input.partial ? 'PARTIAL' : 'COMPLETED', updatedAt: new Date() })
        .where(eq(conversations.id, input.conversationId));
      await tx
        .update(webhookInboxEntries)
        .set({ state: 'PROCESSED', processedAt: new Date(), updatedAt: new Date() })
        .where(eq(webhookInboxEntries.id, input.inboxId));
    });
  },

  async publishAgent(input) {
    const version = await db.query.agentConfigVersions.findFirst({
      where: eq(agentConfigVersions.id, input.releaseId),
    });
    const requiredState = input.purpose === 'TEST' ? 'APPROVED_FOR_TEST' : 'APPROVED_FOR_PUBLISH';
    if (!version || version.state !== requiredState)
      throw new Error(`Agent release is not approved for ${input.purpose.toLowerCase()}`);
    const workspace = await db.query.providerWorkspaces.findFirst({
      where: eq(
        providerWorkspaces.providerWorkspaceId,
        process.env.ELEVENLABS_WORKSPACE_ID ?? 'workspace_synthetic',
      ),
    });
    if (!workspace) throw new Error('Provider workspace mapping is not configured');
    const expectedChecksum = canonicalProviderChecksum(version.configuration);
    const existing = await db.query.agentDeployments.findFirst({
      where: and(
        eq(agentDeployments.agentVersionId, version.id),
        eq(agentDeployments.workspaceId, workspace.id),
      ),
    });
    const published = existing?.providerAgentId
      ? await (
          await providerAdapter()
        ).updateAgent(
          existing.providerAgentId,
          existing.providerBranchId ?? undefined,
          version.configuration,
        )
      : await (await providerAdapter()).createAgent(version.configuration);
    if (published.status !== 'SUCCESS') throw new Error(published.error.safeMessage);
    if (existing) {
      await db
        .update(agentDeployments)
        .set({
          providerAgentId: published.data.agentId,
          providerBranchId: published.data.branchId ?? null,
          providerVersionId: published.data.versionId ?? null,
          localChecksum: expectedChecksum,
          syncState: 'PUBLISH_PENDING',
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(agentDeployments.id, existing.id));
    } else {
      await db.insert(agentDeployments).values({
        agentVersionId: version.id,
        workspaceId: workspace.id,
        environment: workspace.environment,
        providerAgentId: published.data.agentId,
        providerBranchId: published.data.branchId ?? null,
        providerVersionId: published.data.versionId ?? null,
        localChecksum: expectedChecksum,
        syncState: 'PUBLISH_PENDING',
        publishedAt: new Date(),
      });
    }
    await db
      .update(agentConfigVersions)
      .set({ state: input.purpose === 'TEST' ? 'TESTING' : 'PUBLISHING' })
      .where(eq(agentConfigVersions.id, version.id));
    return { providerAgentId: published.data.agentId, checksum: expectedChecksum };
  },

  async readBackAgent(input) {
    const version = await db.query.agentConfigVersions.findFirst({
      where: eq(agentConfigVersions.id, input.releaseId),
    });
    const deployment = await db.query.agentDeployments.findFirst({
      where: and(
        eq(agentDeployments.agentVersionId, input.releaseId),
        eq(agentDeployments.providerAgentId, input.providerAgentId),
      ),
    });
    if (!version || !deployment)
      throw new Error('Published local-to-provider mapping does not exist');
    const remote = await (
      await providerAdapter()
    ).getAgent(input.providerAgentId, deployment.providerBranchId ?? undefined);
    if (remote.status !== 'SUCCESS') throw new Error(remote.error.safeMessage);
    const remoteChecksum = canonicalProviderChecksum(
      projectRemote(remote.data, version.configuration),
    );
    const synchronized = remoteChecksum === input.expectedChecksum;
    await db
      .update(agentDeployments)
      .set({
        remoteChecksum,
        syncState: synchronized ? 'IN_SYNC' : 'DRIFTED',
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentDeployments.id, deployment.id));
    if (!synchronized) {
      await recordDrift(deployment.id, input.expectedChecksum, remoteChecksum);
    } else {
      await resolveDrift(deployment.id);
      await db
        .update(agentConfigVersions)
        .set({ state: input.nextState })
        .where(eq(agentConfigVersions.id, version.id));
    }
    return { synchronized };
  },

  async publishKnowledge(input) {
    const version = await db.query.knowledgeVersions.findFirst({
      where: eq(knowledgeVersions.id, input.releaseId),
    });
    if (!version || version.state !== 'APPROVED')
      throw new Error('Knowledge release is not approved for publication');
    const asset = await db.query.knowledgeAssets.findFirst({
      where: eq(knowledgeAssets.id, version.assetId),
    });
    if (!asset) throw new Error('Knowledge asset is unavailable');
    const workspace = await db.query.providerWorkspaces.findFirst({
      where: eq(
        providerWorkspaces.providerWorkspaceId,
        process.env.ELEVENLABS_WORKSPACE_ID ?? 'workspace_synthetic',
      ),
    });
    if (!workspace) throw new Error('Provider workspace mapping is not configured');
    const existing = await db.query.knowledgeSyncs.findFirst({
      where: and(
        eq(knowledgeSyncs.knowledgeVersionId, version.id),
        eq(knowledgeSyncs.workspaceId, workspace.id),
      ),
    });
    if (existing?.providerDocumentId)
      return {
        providerDocumentId: existing.providerDocumentId,
        checksum: version.contentChecksum,
      };
    const published = await (
      await providerAdapter()
    ).createKnowledgeText(asset.title, version.content);
    if (published.status !== 'SUCCESS') throw new Error(published.error.safeMessage);
    if (existing) {
      await db
        .update(knowledgeSyncs)
        .set({
          providerDocumentId: published.data.documentId,
          syncState: 'PUBLISH_PENDING',
          lastAttemptAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(knowledgeSyncs.id, existing.id));
    } else {
      await db.insert(knowledgeSyncs).values({
        knowledgeVersionId: version.id,
        workspaceId: workspace.id,
        providerDocumentId: published.data.documentId,
        localChecksum: version.contentChecksum,
        syncState: 'PUBLISH_PENDING',
        lastAttemptAt: new Date(),
      });
    }
    return {
      providerDocumentId: published.data.documentId,
      checksum: version.contentChecksum,
    };
  },

  async readBackKnowledge(input) {
    const sync = await db.query.knowledgeSyncs.findFirst({
      where: eq(knowledgeSyncs.knowledgeVersionId, input.releaseId),
    });
    if (!sync || sync.providerDocumentId !== input.providerDocumentId)
      throw new Error('Published knowledge mapping does not exist');
    const remote = await (await providerAdapter()).getKnowledge(input.providerDocumentId);
    if (remote.status !== 'SUCCESS') throw new Error(remote.error.safeMessage);
    const remoteText = typeof remote.data.text === 'string' ? remote.data.text : '';
    const remoteChecksum = createHash('sha256').update(remoteText).digest('hex');
    const synchronized = remoteChecksum === input.expectedChecksum;
    await db
      .update(knowledgeSyncs)
      .set({
        remoteChecksum,
        syncState: synchronized ? 'IN_SYNC' : 'DRIFTED',
        lastAttemptAt: new Date(),
        ...(synchronized ? { lastSuccessAt: new Date(), lastError: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(knowledgeSyncs.id, sync.id));
    if (synchronized)
      await db
        .update(knowledgeVersions)
        .set({ state: 'PUBLISHED' })
        .where(eq(knowledgeVersions.id, input.releaseId));
    return { synchronized };
  },

  async reconcileWorkspace(input) {
    const workspace = await db.query.providerWorkspaces.findFirst({
      where: eq(providerWorkspaces.providerWorkspaceId, input.workspaceId),
    });
    if (!workspace) throw new Error('Provider workspace mapping is not configured');
    const mappings = await db
      .select({ deployment: agentDeployments, version: agentConfigVersions })
      .from(agentDeployments)
      .innerJoin(agentConfigVersions, eq(agentDeployments.agentVersionId, agentConfigVersions.id))
      .where(eq(agentDeployments.workspaceId, workspace.id));
    let driftCount = 0;
    for (const mapping of mappings) {
      if (!mapping.deployment.providerAgentId) continue;
      const remote = await (
        await providerAdapter()
      ).getAgent(
        mapping.deployment.providerAgentId,
        mapping.deployment.providerBranchId ?? undefined,
      );
      const remoteChecksum =
        remote.status === 'SUCCESS'
          ? canonicalProviderChecksum(projectRemote(remote.data, mapping.version.configuration))
          : null;
      const synchronized = remoteChecksum === mapping.deployment.localChecksum;
      if (!synchronized) {
        driftCount += 1;
        await db
          .update(agentDeployments)
          .set({
            syncState: remote.status === 'SUCCESS' ? 'DRIFTED' : 'REMOTE_MISSING',
            remoteChecksum,
            verifiedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(agentDeployments.id, mapping.deployment.id));
        await recordDrift(mapping.deployment.id, mapping.deployment.localChecksum, remoteChecksum);
      } else {
        await db
          .update(agentDeployments)
          .set({
            syncState: 'IN_SYNC',
            remoteChecksum,
            verifiedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(agentDeployments.id, mapping.deployment.id));
        await resolveDrift(mapping.deployment.id);
      }
    }
    const providerCalls = await db
      .select()
      .from(providerConversations)
      .where(eq(providerConversations.workspaceId, workspace.id));
    let missingConversationCount = 0;
    const localProviderIds = new Set(providerCalls.map((call) => call.providerConversationId));
    let cursor: string | undefined;
    for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
      const page = await (await providerAdapter()).listConversations(cursor);
      if (page.status !== 'SUCCESS') break;
      for (const remoteConversation of page.data.conversations) {
        if (localProviderIds.has(remoteConversation.conversation_id)) continue;
        missingConversationCount += 1;
        await db
          .insert(inboxEvents)
          .values({
            source: 'ELEVENLABS_RECONCILIATION',
            sourceEventId: remoteConversation.conversation_id,
            payloadChecksum: createHash('sha256')
              .update(JSON.stringify(remoteConversation))
              .digest('hex'),
            status: 'MISSING_SIGNED_POST_CALL_WEBHOOK',
            error: {
              code: 'MISSING_LOCAL_CONVERSATION',
              retryable: true,
              safeMessage: 'Provider conversation exists without signed local webhook evidence',
            },
          })
          .onConflictDoNothing();
      }
      if (!page.data.has_more || !page.data.next_cursor) break;
      cursor = page.data.next_cursor;
    }
    for (const call of providerCalls) {
      const remote = await (await providerAdapter()).getConversation(call.providerConversationId);
      if (remote.status === 'NOT_FOUND') missingConversationCount += 1;
    }
    return { driftCount, missingConversationCount };
  },
};
