import { createHash } from 'node:crypto';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import {
  agentConfigVersions,
  agentDeployments,
  conversations,
  inboxEvents,
  providerConversations,
  providerWorkspaces,
  rawWebhookEvents,
  voiceAgents,
} from '@quantum-parks/db';
import {
  HttpElevenLabsAdapter,
  type ProviderConversationDetail,
  type ProviderConversationSummary,
} from '@quantum-parks/elevenlabs';
import { DatabaseService } from './database.service.js';
import { ElevenLabsIntegrationService } from './elevenlabs-integration.service.js';
import { WorkflowDispatchService } from './workflow-dispatch.service.js';

const LIVE_STATUSES = new Set(['initiated', 'in-progress']);
const TERMINAL_STATUSES = new Set(['done', 'failed']);

export type LiveProviderCall = {
  providerConversationId: string;
  providerAgentId: string;
  agentName: string;
  status: 'INITIATED' | 'IN_PROGRESS';
  startedAt: string;
  direction: string;
  source: string;
};

export type ProviderCallMonitorSnapshot = {
  status: 'IDLE' | 'ACTIVE' | 'NOT_CONFIGURED' | 'DEGRADED';
  activeCalls: LiveProviderCall[];
  lastSyncedAt: string | null;
  message: string | null;
};

type AgentMapping = {
  providerAgentId: string;
  agentVersionId: string;
  agentName: string;
};

export function isLiveProviderConversation(status: string): boolean {
  return LIVE_STATUSES.has(status.toLowerCase());
}

export function providerConversationStartedAt(
  conversation: ProviderConversationSummary,
  metadata?: Record<string, unknown>,
): Date {
  const metadataStart = metadata?.['start_time_unix_secs'];
  const unixSeconds =
    conversation.startTimeUnixSeconds ??
    (typeof metadataStart === 'number' ? metadataStart : undefined);
  return unixSeconds === undefined ? new Date() : new Date(unixSeconds * 1_000);
}

export function providerConversationEndedAt(
  conversation: ProviderConversationSummary,
  metadata?: Record<string, unknown>,
): Date {
  const startedAt = providerConversationStartedAt(conversation, metadata);
  const metadataDuration = metadata?.['call_duration_secs'];
  const durationSeconds =
    conversation.durationSeconds ??
    (typeof metadataDuration === 'number' ? metadataDuration : undefined);
  return durationSeconds === undefined
    ? new Date()
    : new Date(startedAt.getTime() + durationSeconds * 1_000);
}

@Injectable()
export class ProviderConversationMonitorService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ProviderConversationMonitorService.name);
  private readonly pollIntervalMs = Math.max(
    2_000,
    Number(process.env.PROVIDER_CALL_POLL_INTERVAL_MS ?? 5_000),
  );
  private readonly lookbackSeconds = Math.max(
    300,
    Number(process.env.PROVIDER_CALL_LOOKBACK_SECONDS ?? 86_400),
  );
  private readonly webhookGraceSeconds = Math.max(
    0,
    Number(process.env.PROVIDER_WEBHOOK_GRACE_SECONDS ?? 10),
  );
  private timer: NodeJS.Timeout | undefined;
  private syncInFlight: Promise<ProviderCallMonitorSnapshot> | undefined;
  private terminalSeen = new Set<string>();
  private current: ProviderCallMonitorSnapshot = {
    status: 'IDLE',
    activeCalls: [],
    lastSyncedAt: null,
    message: null,
  };

  constructor(
    private readonly database: DatabaseService,
    private readonly integrationService: ElevenLabsIntegrationService,
    private readonly workflows: WorkflowDispatchService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' || process.env.PROVIDER_CALL_MONITOR_ENABLED === 'false')
      return;
    this.timer = setInterval(() => {
      void this.syncNow();
    }, this.pollIntervalMs);
    this.timer.unref();
    void this.syncNow();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  snapshot(): ProviderCallMonitorSnapshot {
    return this.current;
  }

  syncNow(): Promise<ProviderCallMonitorSnapshot> {
    this.syncInFlight ??= this.performSync()
      .catch((error: unknown) => {
        this.logger.error(
          'ElevenLabs conversation monitoring failed',
          error instanceof Error ? error.stack : undefined,
        );
        this.current = {
          status: 'DEGRADED',
          activeCalls: [],
          lastSyncedAt: new Date().toISOString(),
          message: 'Live call monitoring is temporarily unavailable',
        };
        return this.current;
      })
      .finally(() => {
        this.syncInFlight = undefined;
      });
    return this.syncInFlight;
  }

  private async performSync(): Promise<ProviderCallMonitorSnapshot> {
    const resolved = await this.integrationService.resolveActiveCredential();
    if (!resolved) {
      this.current = {
        status: 'NOT_CONFIGURED',
        activeCalls: [],
        lastSyncedAt: new Date().toISOString(),
        message: 'ElevenLabs is not connected',
      };
      return this.current;
    }

    const workspace = await this.database.db.query.providerWorkspaces.findFirst({
      where: eq(providerWorkspaces.id, resolved.integration.workspaceId),
    });
    if (!workspace) {
      this.current = {
        status: 'DEGRADED',
        activeCalls: [],
        lastSyncedAt: new Date().toISOString(),
        message: 'The connected ElevenLabs workspace is not mapped',
      };
      return this.current;
    }

    const mappingRows = await this.database.db
      .select({
        providerAgentId: agentDeployments.providerAgentId,
        agentVersionId: agentConfigVersions.id,
        agentName: voiceAgents.name,
      })
      .from(agentDeployments)
      .innerJoin(agentConfigVersions, eq(agentDeployments.agentVersionId, agentConfigVersions.id))
      .innerJoin(voiceAgents, eq(agentConfigVersions.agentId, voiceAgents.id))
      .where(eq(agentDeployments.workspaceId, workspace.id));
    const mappings = new Map<string, AgentMapping>();
    for (const row of mappingRows) {
      if (!row.providerAgentId) continue;
      mappings.set(row.providerAgentId, {
        providerAgentId: row.providerAgentId,
        agentVersionId: row.agentVersionId,
        agentName: row.agentName,
      });
    }
    const configuredAgentIds = new Set(mappings.keys());
    if (resolved.integration.defaultAgentId)
      configuredAgentIds.add(resolved.integration.defaultAgentId);

    if (configuredAgentIds.size === 0) {
      this.current = {
        status: 'DEGRADED',
        activeCalls: [],
        lastSyncedAt: new Date().toISOString(),
        message: 'No ElevenLabs agent is configured for call capture',
      };
      return this.current;
    }

    const provider = new HttpElevenLabsAdapter({
      baseUrl: this.integrationService.baseUrl(resolved.integration.environment),
      apiKeyReference: `integration/${resolved.integration.id}`,
      workspaceId: workspace.providerWorkspaceId,
      resolveSecret: async () => resolved.apiKey,
    });
    const discovered: ProviderConversationSummary[] = [];
    const startedAfterUnix = Math.floor(Date.now() / 1_000) - this.lookbackSeconds;
    let cursor: string | undefined;
    for (let pageNumber = 0; pageNumber < 5; pageNumber += 1) {
      const page = await provider.listConversations(cursor, startedAfterUnix);
      if (page.status !== 'SUCCESS') {
        this.current = {
          status: 'DEGRADED',
          activeCalls: [],
          lastSyncedAt: new Date().toISOString(),
          message: page.error.safeMessage,
        };
        return this.current;
      }
      discovered.push(
        ...page.data.conversations.filter((conversation) =>
          configuredAgentIds.has(conversation.agentId),
        ),
      );
      if (!page.data.has_more || !page.data.next_cursor) break;
      cursor = page.data.next_cursor;
    }

    const activeCalls = discovered
      .filter((conversation) => isLiveProviderConversation(conversation.status))
      .map((conversation): LiveProviderCall => {
        const mapping = mappings.get(conversation.agentId);
        return {
          providerConversationId: conversation.conversationId,
          providerAgentId: conversation.agentId,
          agentName:
            conversation.agentName ??
            mapping?.agentName ??
            resolved.integration.verifiedAgentName ??
            'AI Receptionist',
          status: conversation.status.toLowerCase() === 'initiated' ? 'INITIATED' : 'IN_PROGRESS',
          startedAt: providerConversationStartedAt(conversation).toISOString(),
          direction: conversation.direction ?? 'inbound',
          source: conversation.initiationSource ?? 'telephony',
        };
      })
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt));

    const terminal = discovered.filter(
      (conversation) =>
        TERMINAL_STATUSES.has(conversation.status.toLowerCase()) &&
        !this.terminalSeen.has(conversation.conversationId),
    );
    for (const conversation of terminal) {
      const endedAt = providerConversationEndedAt(conversation);
      if (Date.now() - endedAt.getTime() < this.webhookGraceSeconds * 1_000) continue;
      const mapping = mappings.get(conversation.agentId);
      const recovered = await this.recoverConversation({
        provider,
        workspaceId: workspace.id,
        workspaceSynthetic: workspace.synthetic,
        summary: conversation,
        ...(mapping ? { mapping } : {}),
      });
      if (recovered) this.terminalSeen.add(conversation.conversationId);
    }

    this.current = {
      status: activeCalls.length > 0 ? 'ACTIVE' : 'IDLE',
      activeCalls,
      lastSyncedAt: new Date().toISOString(),
      message: null,
    };
    return this.current;
  }

  private async recoverConversation(input: {
    provider: HttpElevenLabsAdapter;
    workspaceId: string;
    workspaceSynthetic: boolean;
    summary: ProviderConversationSummary;
    mapping?: AgentMapping;
  }): Promise<boolean> {
    const signedEvidence = await this.database.db.query.rawWebhookEvents.findFirst({
      where: and(
        eq(rawWebhookEvents.workspaceId, input.workspaceId),
        eq(rawWebhookEvents.providerConversationId, input.summary.conversationId),
      ),
      columns: { id: true },
    });
    if (signedEvidence) {
      await this.markRecoveryProcessed(input.summary.conversationId);
      return true;
    }

    const existingProvider = await this.database.db.query.providerConversations.findFirst({
      where: and(
        eq(providerConversations.workspaceId, input.workspaceId),
        eq(providerConversations.providerConversationId, input.summary.conversationId),
      ),
      columns: { id: true },
    });
    if (existingProvider) {
      const existingConversation = await this.database.db.query.conversations.findFirst({
        where: eq(conversations.providerConversationId, existingProvider.id),
        columns: { processingState: true },
      });
      if (
        existingConversation &&
        ['COMPLETED', 'PARTIAL', 'FAILED_FINAL'].includes(existingConversation.processingState)
      ) {
        await this.markRecoveryProcessed(input.summary.conversationId);
        return true;
      }
    }

    const result = await input.provider.getConversation(input.summary.conversationId);
    if (result.status !== 'SUCCESS') {
      this.logger.warn(
        `Conversation recovery failed for ${input.summary.conversationId}: ${result.error.code}`,
      );
      return false;
    }
    const detail = result.data;
    const checksum = createHash('sha256').update(JSON.stringify(detail)).digest('hex');
    const startedAt = providerConversationStartedAt(detail, detail.metadata);
    const endedAt = providerConversationEndedAt(detail, detail.metadata);
    const providerMetadata = {
      ...detail.metadata,
      quantumCapture: {
        source: 'ELEVENLABS_CONVERSATION_RETRIEVAL',
        retrievedAt: new Date().toISOString(),
        providerStatus: detail.status,
        direction: detail.direction ?? input.summary.direction ?? null,
        initiationSource: detail.initiationSource ?? input.summary.initiationSource ?? null,
        providerHasAudio: detail.providerHasAudio,
        providerHasUserAudio: detail.providerHasUserAudio,
        providerHasResponseAudio: detail.providerHasResponseAudio,
      },
      ...(detail.initiationClientData
        ? { conversation_initiation_client_data: detail.initiationClientData }
        : {}),
    };
    const failed = detail.status.toLowerCase() === 'failed';
    const transcriptAvailable = detail.transcript.length > 0;

    const persisted = await this.database.db.transaction(async (tx) => {
      await tx
        .insert(providerConversations)
        .values({
          workspaceId: input.workspaceId,
          providerConversationId: detail.conversationId,
          providerAgentId: detail.agentId,
          providerBranchId: detail.branchId ?? null,
          providerVersionId: detail.versionId ?? null,
          providerTranscript: detail.transcript,
          providerAnalysis: detail.analysis ?? null,
          providerMetadata,
          hasAudio: false,
        })
        .onConflictDoUpdate({
          target: [providerConversations.workspaceId, providerConversations.providerConversationId],
          set: {
            providerAgentId: detail.agentId,
            providerBranchId: detail.branchId ?? null,
            providerVersionId: detail.versionId ?? null,
            providerTranscript: detail.transcript,
            providerAnalysis: detail.analysis ?? null,
            providerMetadata,
            hasAudio: false,
          },
        });
      const providerConversation = await tx.query.providerConversations.findFirst({
        where: and(
          eq(providerConversations.workspaceId, input.workspaceId),
          eq(providerConversations.providerConversationId, detail.conversationId),
        ),
        columns: { id: true },
      });
      if (!providerConversation)
        throw new Error('Recovered provider conversation was not persisted');

      let conversation = await tx.query.conversations.findFirst({
        where: eq(conversations.providerConversationId, providerConversation.id),
      });
      const processingState = failed
        ? 'FAILED_FINAL'
        : transcriptAvailable
          ? 'RAW_STORED'
          : 'FAILED_RETRYABLE';
      if (!conversation) {
        [conversation] = await tx
          .insert(conversations)
          .values({
            providerConversationId: providerConversation.id,
            agentVersionId: input.mapping?.agentVersionId ?? null,
            processingState,
            startedAt,
            endedAt,
            synthetic: input.workspaceSynthetic,
          })
          .returning();
      } else if (!['COMPLETED', 'PARTIAL'].includes(conversation.processingState)) {
        [conversation] = await tx
          .update(conversations)
          .set({
            agentVersionId: conversation.agentVersionId ?? input.mapping?.agentVersionId ?? null,
            processingState,
            startedAt: conversation.startedAt ?? startedAt,
            endedAt,
            updatedAt: new Date(),
          })
          .where(eq(conversations.id, conversation.id))
          .returning();
      }
      if (!conversation) throw new Error('Recovered canonical conversation was not persisted');

      await tx
        .insert(inboxEvents)
        .values({
          source: 'ELEVENLABS_CONVERSATION_RETRIEVAL',
          sourceEventId: detail.conversationId,
          payloadChecksum: checksum,
          status: failed
            ? 'PROVIDER_CALL_FAILED'
            : transcriptAvailable
              ? 'RECOVERED'
              : 'AWAITING_TRANSCRIPT',
          ...(failed
            ? {
                processedAt: new Date(),
                error: {
                  code: 'PROVIDER_CALL_FAILED',
                  retryable: false,
                  safeMessage: 'ElevenLabs reported that the call failed',
                },
              }
            : transcriptAvailable
              ? {}
              : {
                  error: {
                    code: 'TRANSCRIPT_NOT_READY',
                    retryable: true,
                    safeMessage: 'The provider conversation does not contain a transcript yet',
                  },
                }),
        })
        .onConflictDoNothing();
      const inbox = await tx.query.inboxEvents.findFirst({
        where: and(
          eq(inboxEvents.source, 'ELEVENLABS_CONVERSATION_RETRIEVAL'),
          eq(inboxEvents.sourceEventId, detail.conversationId),
        ),
      });
      if (!inbox) throw new Error('Conversation recovery inbox was not persisted');
      return { conversation, inbox };
    });

    if (failed) return true;
    if (!transcriptAvailable) return false;
    if (['COMPLETED', 'PARTIAL'].includes(persisted.conversation.processingState)) {
      await this.database.db
        .update(inboxEvents)
        .set({ status: 'PROCESSED', processedAt: new Date(), updatedAt: new Date() })
        .where(eq(inboxEvents.id, persisted.inbox.id));
      return true;
    }
    if (persisted.inbox.workflowId) return false;

    const workflowId = `post-call-recovery-${persisted.conversation.id}-${checksum.slice(0, 12)}`;
    const [claimed] = await this.database.db
      .update(inboxEvents)
      .set({ workflowId, status: 'DISPATCHING', error: null, updatedAt: new Date() })
      .where(and(eq(inboxEvents.id, persisted.inbox.id), isNull(inboxEvents.workflowId)))
      .returning({ id: inboxEvents.id });
    if (!claimed) return false;

    const queued = await this.workflows.dispatchPostCall({
      conversationId: persisted.conversation.id,
      workflowId,
    });
    await this.database.db
      .update(inboxEvents)
      .set({
        status: queued ? 'DISPATCHED' : 'PENDING',
        ...(queued
          ? {}
          : {
              workflowId: null,
              error: {
                code: 'TEMPORAL_UNAVAILABLE',
                retryable: true,
                safeMessage: 'Post-call processing could not be queued',
              },
            }),
        updatedAt: new Date(),
      })
      .where(eq(inboxEvents.id, persisted.inbox.id));
    return false;
  }

  private async markRecoveryProcessed(providerConversationId: string): Promise<void> {
    await this.database.db
      .update(inboxEvents)
      .set({
        status: 'PROCESSED',
        processedAt: new Date(),
        error: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inboxEvents.source, 'ELEVENLABS_CONVERSATION_RETRIEVAL'),
          eq(inboxEvents.sourceEventId, providerConversationId),
        ),
      );
  }
}
