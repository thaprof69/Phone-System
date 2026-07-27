import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Principal } from '@quantum-parks/auth';
import {
  AIOSContextBuilder,
  AIOSOrchestrator,
  type AIOSGovernanceRepository,
  type ContextSource,
} from '@quantum-parks/aios';
import {
  OpenAIIntelligenceProvider,
  SimulatorIntelligenceProvider,
  type SimulatorMode,
} from '@quantum-parks/aios-adapters';
import type {
  AiosEventEnvelope,
  AIOSEventBus,
  AiosResult,
  CapabilityVersion,
  ExecuteCapabilityRequest,
  GovernedIntelligenceArtifact,
  IntelligenceCapabilityKey,
  IntelligenceProvider,
  ResolvedIntelligenceRoute,
  ServiceVersion,
} from '@quantum-parks/aios-contracts';
import {
  aiArtifacts,
  aiBudgetPolicies,
  aiCapabilities,
  aiCapabilityDependencies,
  aiCapabilityVersions,
  aiContextManifests,
  aiEvidenceReferences,
  aiModelApprovals,
  aiModelPrices,
  aiModels,
  aiOutputSchemas,
  aiOutputSchemaVersions,
  aiProcessingRuns,
  aiPrompts,
  aiPromptVersions,
  aiProviderConnections,
  aiProviderCredentialReferences,
  aiProviderHealthChecks,
  aiReadinessEvaluations,
  aiRoutes,
  aiRouteVersions,
  aiServices,
  aiServiceVersions,
  aiTaxonomies,
  aiTaxonomyVersions,
  aiUsageRecords,
  conversations,
  encryptedProviderCredentials,
  outboxEvents,
  transcriptRevisions,
  transcriptTurns,
} from '@quantum-parks/db';
import { InteractionEvidenceSchema, SummarySchema } from '@quantum-parks/intelligence';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DatabaseService } from './database.service.js';
import {
  PROVIDER_DEFINITIONS,
  findProviderDefinition,
  validateCredentialPayload,
} from './provider-registry.js';
import { AuditService } from './audit.service.js';
import { ProviderCredentialVaultService } from './provider-credential-vault.service.js';

type Environment = 'development' | 'staging' | 'production';
type ProviderInput = {
  /** Validated against the provider registry at runtime, not narrowed to one vendor. */
  providerKey: string;
  apiKey: string;
  connectionLabel: string;
  environment: Environment;
  region?: string | undefined;
  approvedDataRegion?: string | undefined;
  organizationReference?: string | undefined;
};

const successState = (state: string) => state === 'SUCCESS' || state === 'FALLBACK_USED';
const safeCredentialReference = (provider: string, id: string) =>
  `AI-${provider}-${id.replaceAll('-', '').slice(0, 8).toUpperCase()}`;

/** One grouped bucket (provider, model or capability) accumulated by `groupedUsage`. */
type UsageGroup = {
  key: string;
  label: string;
  executionCount: number;
  latencies: number[];
  fallbackCount: number;
  schemaRejectedCount: number;
  timeoutCount: number;
  failureCount: number;
  retryCount: number;
  succeededCount: number;
  costMicros: number;
  inputTokens: number;
  outputTokens: number;
};

@Injectable()
export class AiosPlatformService implements AIOSGovernanceRepository, AIOSEventBus {
  private readonly validationAttempts = new Map<string, number[]>();

  constructor(
    private readonly database: DatabaseService,
    private readonly vault: ProviderCredentialVaultService,
    private readonly audit: AuditService,
  ) {}

  async execute(
    request: ExecuteCapabilityRequest,
  ): Promise<AiosResult<GovernedIntelligenceArtifact>> {
    const capability = await this.getActiveCapability(request.capabilityKey);
    if (
      capability &&
      ((request.executionContext.environment === 'production' &&
        !(await this.isCapabilityProductionApproved(capability.id))) ||
        !(await this.isInvocationAllowed(
          request.executionContext.callerService,
          request.executionContext.purpose,
          capability.id,
        )))
    )
      return {
        state: 'POLICY_REJECTED',
        code: 'AIOS_CAPABILITY_POLICY',
        safeMessage: 'The capability is not approved for this caller and environment.',
        retryable: false,
      };
    const providers: IntelligenceProvider[] = [
      new SimulatorIntelligenceProvider(this.simulatorMode()),
    ];
    const openAiConnection = await this.activeConnection(
      'OPENAI',
      request.executionContext.environment,
    );
    if (openAiConnection) {
      providers.push(
        new OpenAIIntelligenceProvider({
          resolveApiKey: () => this.resolveCredential(openAiConnection.id, 'OPENAI'),
        }),
      );
    }
    const contextBuilder = new AIOSContextBuilder([this.transcriptContextSource()]);
    return new AIOSOrchestrator(this, contextBuilder, providers, this).executeCapability(request);
  }

  async overview() {
    const environment = this.environment();
    const [connections, models, capabilities, routes, runs, usage, latestReadiness] =
      await Promise.all([
        this.database.db.select().from(aiProviderConnections),
        this.database.db.select().from(aiModels),
        this.database.db
          .select({
            key: aiCapabilities.key,
            displayName: aiCapabilities.displayName,
            version: aiCapabilityVersions.version,
            state: aiCapabilityVersions.state,
            critical: aiCapabilityVersions.critical,
            productionApproved: aiCapabilityVersions.productionApproved,
          })
          .from(aiCapabilities)
          .leftJoin(aiCapabilityVersions, eq(aiCapabilityVersions.capabilityId, aiCapabilities.id)),
        this.database.db.select().from(aiRouteVersions),
        this.database.db
          .select()
          .from(aiProcessingRuns)
          .orderBy(desc(aiProcessingRuns.startedAt))
          .limit(20),
        this.database.db
          .select({
            requests: sql<number>`count(*)::int`,
            inputTokens: sql<number>`coalesce(sum(${aiUsageRecords.inputTokens}), 0)::int`,
            outputTokens: sql<number>`coalesce(sum(${aiUsageRecords.outputTokens}), 0)::int`,
            costMicros: sql<number>`coalesce(sum(${aiUsageRecords.costMicros}), 0)::bigint`,
          })
          .from(aiUsageRecords),
        this.database.db
          .select()
          .from(aiReadinessEvaluations)
          .where(eq(aiReadinessEvaluations.environment, environment))
          .orderBy(desc(aiReadinessEvaluations.evaluatedAt))
          .limit(1),
      ]);
    const readiness = latestReadiness[0] ?? (await this.evaluateReadiness());
    return {
      architecture: {
        executionPath:
          'Application Service → AIOS Gateway → Capability → Service → Orchestrator → Context & Evidence → Governance → Adapter',
        providerNeutral: true,
        directProviderInvocationAllowed: false,
      },
      readiness,
      providers: connections.map((connection) => this.safeConnection(connection)),
      models,
      capabilities,
      routes,
      recentRuns: runs,
      usage: usage[0] ?? { requests: 0, inputTokens: 0, outputTokens: 0, costMicros: 0 },
      statusSeparation: {
        voiceRuntime: 'INDEPENDENT',
        aios: readiness.status,
        platform: 'INDEPENDENT',
        productionRouting: 'BLOCKED',
      },
    };
  }

  /**
   * Execution history with full provenance.
   *
   * A count of recent runs answers nothing. What an operator needs when enrichment
   * misbehaves is which capability ran, on which model and prompt version, what it
   * cost, how long it took, whether it fell back, and which record it was about — all
   * of which is already recorded and was simply never surfaced.
   */
  async executionHistory(limit: number) {
    const [runs, artifacts, usage, models, capabilities, capabilityVersions] = await Promise.all([
      this.database.db
        .select()
        .from(aiProcessingRuns)
        .orderBy(desc(aiProcessingRuns.startedAt))
        .limit(limit),
      this.database.db.select().from(aiArtifacts),
      this.database.db.select().from(aiUsageRecords),
      this.database.db.select().from(aiModels),
      this.database.db.select().from(aiCapabilities),
      this.database.db.select().from(aiCapabilityVersions),
    ]);

    return {
      items: runs.map((run) => {
        const artifact = artifacts.find((row) => row.processingRunId === run.id);
        const usageRecord = usage.find((row) => row.processingRunId === run.id);
        const model = models.find((row) => row.id === (artifact?.modelId ?? usageRecord?.modelId));
        const version = capabilityVersions.find((row) => row.id === run.capabilityVersionId);
        const capability = capabilities.find((row) => row.id === version?.capabilityId);

        return {
          id: run.id,
          capabilityKey: capability?.key ?? usageRecord?.capabilityKey ?? 'UNKNOWN',
          capabilityDisplayName: capability?.displayName ?? null,
          capabilityVersion: version?.version ?? null,
          sourceRecordId: run.sourceRecordId,
          sourceRevisionId: run.sourceRevisionId,
          state: run.state,
          attempt: run.attempt,
          replayOfRunId: run.replayOfRunId,
          errorCode: run.errorCode,
          safeError: run.safeError,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          latencyMs: usageRecord?.latencyMs ?? null,
          inputTokens: usageRecord?.inputTokens ?? null,
          outputTokens: usageRecord?.outputTokens ?? null,
          costMicros: usageRecord?.costMicros ?? null,
          currency: usageRecord?.currency ?? null,
          correlationId: run.correlationId,
          causationId: run.causationId,
          provider: artifact?.providerKey ?? null,
          providerRequestId: artifact?.providerRequestId ?? null,
          model: model?.providerModelId ?? null,
          providerModelVersion: artifact?.providerModelVersion ?? null,
          promptVersionId: artifact?.promptVersionId ?? null,
          schemaVersionId: artifact?.schemaVersionId ?? null,
          taxonomyVersionId: artifact?.taxonomyVersionId ?? null,
          routeVersionId: artifact?.routeVersionId ?? null,
          contextManifestId: artifact?.contextManifestId ?? null,
          outputRevisionId: artifact?.id ?? null,
          fallbackUsed: artifact?.fallbackUsed ?? false,
          qualityFlags: artifact?.qualityFlags ?? [],
          confidence: artifact?.confidence ?? null,
        };
      }),
    };
  }

  /**
   * Monitoring aggregates. Every figure here is derived from the runs above, so a
   * number on this screen can always be traced to the records that produced it.
   */
  async monitoringSummary() {
    const [runs, usage, health, connections, models] = await Promise.all([
      this.database.db.select().from(aiProcessingRuns),
      this.database.db.select().from(aiUsageRecords),
      this.database.db
        .select()
        .from(aiProviderHealthChecks)
        .orderBy(desc(aiProviderHealthChecks.checkedAt))
        .limit(200),
      this.database.db.select().from(aiProviderConnections),
      this.database.db.select().from(aiModels),
    ]);

    const total = runs.length;
    const succeeded = runs.filter((run) => run.state === 'SUCCESS').length;
    const fellBack = runs.filter((run) => run.state === 'FALLBACK_USED').length;
    const validationFailed = runs.filter((run) =>
      ['VALIDATION_FAILED', 'SCHEMA_REJECTED', 'EVIDENCE_INSUFFICIENT'].includes(run.state),
    ).length;
    const failed = total - succeeded - fellBack;

    const latencies = usage
      .map((record) => record.latencyMs)
      .filter((value): value is number => typeof value === 'number')
      .sort((left, right) => left - right);
    const percentile = (fraction: number) =>
      latencies.length === 0
        ? null
        : (latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * fraction))] ??
          null);

    const byState = Object.entries(
      runs.reduce<Record<string, number>>((totals, run) => {
        totals[run.state] = (totals[run.state] ?? 0) + 1;
        return totals;
      }, {}),
    )
      .map(([state, count]) => ({ state, count }))
      .sort((left, right) => right.count - left.count);

    return {
      // Rates are null rather than zero when nothing has run: a failure rate with no
      // executions behind it is unknown, not perfect.
      totals: {
        runs: total,
        succeeded,
        failed,
        fellBack,
        validationFailed,
        successRate: total > 0 ? succeeded / total : null,
        failureRate: total > 0 ? failed / total : null,
        fallbackRate: total > 0 ? fellBack / total : null,
        validationFailureRate: total > 0 ? validationFailed / total : null,
      },
      latency: {
        p50Ms: percentile(0.5),
        p95Ms: percentile(0.95),
        maxMs: latencies[latencies.length - 1] ?? null,
      },
      spend: {
        costMicros: usage.reduce((sum, record) => sum + (record.costMicros ?? 0), 0),
        currency: usage.find((record) => record.currency)?.currency ?? 'GBP',
        inputTokens: usage.reduce((sum, record) => sum + (record.inputTokens ?? 0), 0),
        outputTokens: usage.reduce((sum, record) => sum + (record.outputTokens ?? 0), 0),
      },
      byState,
      providerHealth: connections.map((connection) => {
        const checks = health.filter((check) => check.connectionId === connection.id);
        const degraded = checks.filter((check) => check.status !== 'CONNECTED');
        return {
          connectionId: connection.id,
          providerKey: connection.providerKey,
          label: connection.connectionLabel,
          status: connection.status,
          checks: checks.length,
          degradedChecks: degraded.length,
          lastCheckedAt: checks[0]?.checkedAt ?? null,
          lastStatus: checks[0]?.status ?? null,
          lastErrorCode: degraded[0]?.normalizedErrorCode ?? null,
        };
      }),
      models: models.map((model) => ({
        id: model.id,
        providerModelId: model.providerModelId,
        available: model.available,
        deprecated: model.deprecated,
        runs: usage.filter((record) => record.modelId === model.id).length,
      })),
    };
  }

  /**
   * One grouping pass over every usage record, joined back to the processing run
   * that produced it, bucketed by provider, model and capability. `performanceBreakdown`
   * and `costBreakdown` both read from this rather than each re-deriving their own
   * groups, so there is one place that decides what counts as a fallback, a timeout
   * or a retry.
   */
  private async groupedUsage() {
    const [runs, usage, connections, models] = await Promise.all([
      this.database.db.select().from(aiProcessingRuns),
      this.database.db.select().from(aiUsageRecords),
      this.database.db.select().from(aiProviderConnections),
      this.database.db.select().from(aiModels),
    ]);
    const runById = new Map(runs.map((run) => [run.id, run]));

    const emptyGroup = (key: string, label: string): UsageGroup => ({
      key,
      label,
      executionCount: 0,
      latencies: [],
      fallbackCount: 0,
      schemaRejectedCount: 0,
      timeoutCount: 0,
      failureCount: 0,
      retryCount: 0,
      succeededCount: 0,
      costMicros: 0,
      inputTokens: 0,
      outputTokens: 0,
    });

    const byProvider = new Map<string, UsageGroup>();
    const byModel = new Map<string, UsageGroup>();
    const byCapability = new Map<string, UsageGroup>();

    for (const record of usage) {
      const run = runById.get(record.processingRunId);
      if (!run) continue;
      const connection = connections.find((entry) => entry.id === record.providerConnectionId);
      const model = models.find((entry) => entry.id === record.modelId);

      const providerKey = connection?.providerKey ?? 'UNKNOWN';
      const modelKey = record.modelId;
      const capabilityKey = record.capabilityKey;

      const providerGroup =
        byProvider.get(providerKey) ??
        emptyGroup(providerKey, connection?.connectionLabel ?? providerKey);
      const modelGroup =
        byModel.get(modelKey) ??
        emptyGroup(modelKey, model?.displayName ?? model?.providerModelId ?? 'Unknown model');
      const capabilityGroup =
        byCapability.get(capabilityKey) ?? emptyGroup(capabilityKey, capabilityKey);

      for (const group of [providerGroup, modelGroup, capabilityGroup]) {
        group.executionCount += 1;
        group.latencies.push(record.latencyMs);
        group.costMicros += record.costMicros ?? 0;
        group.inputTokens += record.inputTokens ?? 0;
        group.outputTokens += record.outputTokens ?? 0;
        if (run.state === 'FALLBACK_USED') group.fallbackCount += 1;
        if (run.state === 'SCHEMA_REJECTED' || run.state === 'VALIDATION_FAILED')
          group.schemaRejectedCount += 1;
        if (run.state === 'TIMEOUT') group.timeoutCount += 1;
        if (successState(run.state)) group.succeededCount += 1;
        else group.failureCount += 1;
        if (run.attempt > 1) group.retryCount += 1;
      }
      byProvider.set(providerKey, providerGroup);
      byModel.set(modelKey, modelGroup);
      byCapability.set(capabilityKey, capabilityGroup);
    }

    return { runs, usage, byProvider, byModel, byCapability };
  }

  private percentile(latencies: number[], fraction: number): number | null {
    if (latencies.length === 0) return null;
    const sorted = [...latencies].sort((left, right) => left - right);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? null;
  }

  /**
   * Per-provider, per-model and per-capability execution health. Every figure
   * traces back to the same `ai_processing_runs`/`ai_usage_records` rows the
   * execution list and monitoring summary already read — this is a different cut
   * of the same evidence, not a second source of truth for it.
   */
  async performanceBreakdown() {
    const { byProvider, byModel, byCapability } = await this.groupedUsage();
    const toRow = (group: UsageGroup) => ({
      key: group.key,
      label: group.label,
      executionCount: group.executionCount,
      averageLatencyMs:
        group.latencies.length > 0
          ? group.latencies.reduce((sum, value) => sum + value, 0) / group.latencies.length
          : null,
      p95LatencyMs: this.percentile(group.latencies, 0.95),
      fallbackRate: group.executionCount > 0 ? group.fallbackCount / group.executionCount : null,
      schemaValidationFailures: group.schemaRejectedCount,
      timeoutCount: group.timeoutCount,
      failureCount: group.failureCount,
      retryCount: group.retryCount,
      successRate: group.executionCount > 0 ? group.succeededCount / group.executionCount : null,
    });
    const sortByVolume = <T extends { executionCount: number }>(rows: T[]) =>
      rows.sort((left, right) => right.executionCount - left.executionCount);

    return {
      generatedAt: new Date().toISOString(),
      byProvider: sortByVolume([...byProvider.values()].map(toRow)),
      byModel: sortByVolume([...byModel.values()].map(toRow)),
      byCapability: sortByVolume([...byCapability.values()].map(toRow)),
    };
  }

  /**
   * Token usage and spend, grouped the same way as `performanceBreakdown`, plus
   * cost attributed back to the conversations that caused it (via
   * `sourceRecordId`) and the existing budget policies' utilisation/breach state
   * from `budgetStatus`. No new spend ledger — this reads the same
   * `ai_usage_records` and `ai_budget_policies` rows.
   */
  async costBreakdown() {
    const { runs, usage, byProvider, byModel, byCapability } = await this.groupedUsage();
    const budgets = await this.budgetStatus();
    const runById = new Map(runs.map((run) => [run.id, run]));

    const conversationIds = [...new Set(runs.map((run) => run.sourceRecordId))];
    const conversationRows =
      conversationIds.length > 0
        ? await this.database.db
            .select()
            .from(conversations)
            .where(inArray(conversations.id, conversationIds))
        : [];
    const conversationById = new Map(conversationRows.map((row) => [row.id, row]));

    const costByConversation = new Map<string, number>();
    for (const record of usage) {
      const run = runById.get(record.processingRunId);
      if (!run) continue;
      costByConversation.set(
        run.sourceRecordId,
        (costByConversation.get(run.sourceRecordId) ?? 0) + (record.costMicros ?? 0),
      );
    }
    const costedConversations = [...costByConversation.entries()];
    const completedCosted = costedConversations.filter(
      ([conversationId]) => conversationById.get(conversationId)?.processingState === 'COMPLETED',
    );

    const trendBucket = (date: Date, granularity: 'day' | 'week' | 'month'): string => {
      if (granularity === 'month') return date.toISOString().slice(0, 7);
      if (granularity === 'day') return date.toISOString().slice(0, 10);
      const monday = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const isoDay = monday.getUTCDay() || 7;
      monday.setUTCDate(monday.getUTCDate() - isoDay + 1);
      return monday.toISOString().slice(0, 10);
    };
    const buildTrend = (granularity: 'day' | 'week' | 'month') => {
      const totals = new Map<string, number>();
      for (const record of usage) {
        const key = trendBucket(record.createdAt, granularity);
        totals.set(key, (totals.get(key) ?? 0) + (record.costMicros ?? 0));
      }
      return [...totals.entries()]
        .map(([label, costMicros]) => ({ label, costMicros }))
        .sort((left, right) => left.label.localeCompare(right.label));
    };

    const toRow = (group: UsageGroup) => ({
      key: group.key,
      label: group.label,
      executionCount: group.executionCount,
      costMicros: group.costMicros,
      inputTokens: group.inputTokens,
      outputTokens: group.outputTokens,
    });
    const sortBySpend = <T extends { costMicros: number }>(rows: T[]) =>
      rows.sort((left, right) => right.costMicros - left.costMicros);

    return {
      generatedAt: new Date().toISOString(),
      currency: usage.find((record) => record.currency)?.currency ?? 'GBP',
      totals: {
        costMicros: usage.reduce((sum, record) => sum + (record.costMicros ?? 0), 0),
        inputTokens: usage.reduce((sum, record) => sum + (record.inputTokens ?? 0), 0),
        outputTokens: usage.reduce((sum, record) => sum + (record.outputTokens ?? 0), 0),
      },
      // Null rather than zero with nothing costed yet: an average of no evidence
      // is unknown, not free.
      costPerCallMicros:
        costedConversations.length > 0
          ? costedConversations.reduce((sum, [, cost]) => sum + cost, 0) /
            costedConversations.length
          : null,
      costPerCompletedConversationMicros:
        completedCosted.length > 0
          ? completedCosted.reduce((sum, [, cost]) => sum + cost, 0) / completedCosted.length
          : null,
      byProvider: sortBySpend([...byProvider.values()].map(toRow)),
      byModel: sortBySpend([...byModel.values()].map(toRow)),
      byCapability: sortBySpend([...byCapability.values()].map(toRow)),
      dailyTrend: buildTrend('day'),
      weeklyTrend: buildTrend('week'),
      monthlyTrend: buildTrend('month'),
      budgets: budgets.items,
    };
  }

  async catalogue() {
    const [
      capabilities,
      services,
      providers,
      models,
      routes,
      prompts,
      schemas,
      taxonomies,
      budgets,
      health,
    ] = await Promise.all([
      this.database.db.select().from(aiCapabilities),
      this.database.db.select().from(aiServices),
      this.database.db.select().from(aiProviderConnections),
      this.database.db.select().from(aiModels),
      this.database.db.select().from(aiRouteVersions),
      this.database.db
        .select({
          id: aiPromptVersions.id,
          promptId: aiPromptVersions.promptId,
          promptKey: aiPrompts.key,
          version: aiPromptVersions.version,
          state: aiPromptVersions.state,
          checksum: aiPromptVersions.checksum,
          authorId: aiPromptVersions.authorId,
          approvedBy: aiPromptVersions.approvedBy,
          activatedAt: aiPromptVersions.activatedAt,
          createdAt: aiPromptVersions.createdAt,
        })
        .from(aiPromptVersions)
        .innerJoin(aiPrompts, eq(aiPrompts.id, aiPromptVersions.promptId)),
      this.database.db.select().from(aiOutputSchemaVersions),
      this.database.db.select().from(aiTaxonomyVersions),
      this.database.db.select().from(aiBudgetPolicies),
      this.database.db
        .select()
        .from(aiProviderHealthChecks)
        .orderBy(desc(aiProviderHealthChecks.checkedAt))
        .limit(50),
    ]);
    return {
      capabilities,
      services,
      providers: providers.map((provider) => this.safeConnection(provider)),
      models,
      routes,
      prompts,
      schemas: schemas.map(({ jsonSchema: _jsonSchema, ...schema }) => schema),
      taxonomies,
      budgets,
      health,
    };
  }

  async workspaceView() {
    const [overview, catalogue] = await Promise.all([this.overview(), this.catalogue()]);
    const blockerDescriptions: Record<string, string> = {
      AI_PROVIDER_NOT_CONFIGURED:
        'Connect and verify a production-capable AI provider for this environment.',
      AI_PROVIDER_UNHEALTHY: 'A configured provider is not currently healthy.',
      AI_CRITICAL_PIPELINE_DISABLED: 'A required intelligence capability is not active.',
      AI_ROUTE_MISSING: 'One or more active capabilities do not have an eligible execution route.',
      AI_COST_LIMIT_NOT_CONFIGURED: 'A governed budget policy has not been activated.',
      AI_SIMULATOR_IN_PRODUCTION_PATH:
        'The deterministic simulator is prohibited from production execution.',
      AI_PROVIDER_NOT_PRODUCTION_APPROVED:
        'Provider, model, capability, or route approval is incomplete.',
      AI_DATA_REGION_UNAPPROVED: 'The AI data-processing region has not been approved.',
      AI_RETENTION_UNAPPROVED: 'AI artifact retention has not been approved.',
      AI_EVALUATION_FAILED: 'Required production evaluation evidence is missing or failing.',
    };
    const modelsByConnection = new Map<string, typeof catalogue.models>();
    for (const model of catalogue.models) {
      const models = modelsByConnection.get(model.connectionId) ?? [];
      models.push(model);
      modelsByConnection.set(model.connectionId, models);
    }
    const productionProviders = catalogue.providers.filter(
      (provider) =>
        !provider.synthetic &&
        provider.enabled &&
        provider.status === 'CONNECTED' &&
        provider.lastVerifiedAt,
    );
    return {
      generatedAt: new Date().toISOString(),
      overview: {
        readiness: {
          ...overview.readiness,
          blockers: overview.readiness.blockers.map((code) => ({
            code,
            description:
              blockerDescriptions[code] ?? 'This server-computed governance check is incomplete.',
          })),
        },
        connectedProductionProviderCount: productionProviders.length,
        activeCapabilityCount: overview.capabilities.filter(
          (capability) => capability.state === 'ACTIVE',
        ).length,
        governedModelCount: catalogue.models.length,
        recentRunCount: overview.recentRuns.length,
        usage: overview.usage,
      },
      providers: {
        // Rendered from the code-owned provider registry so the connection form is
        // generated from each adapter's declared fields rather than written around
        // one vendor.
        definitions: PROVIDER_DEFINITIONS,
        installedAdapters: PROVIDER_DEFINITIONS.filter((definition) => definition.installed).map(
          (definition) => ({
            key: definition.key,
            label: definition.displayName,
            support: definition.support,
            description: definition.description,
          }),
        ),
        unavailableAdapters: PROVIDER_DEFINITIONS.filter((definition) => !definition.installed).map(
          (definition) => ({
            key: definition.key,
            label: definition.displayName,
            support: definition.support,
            description: definition.unavailableReason ?? 'Adapter not installed.',
          }),
        ),
        connections: catalogue.providers.map((provider) => ({
          ...provider,
          productionEligible:
            !provider.synthetic &&
            provider.enabled &&
            provider.status === 'CONNECTED' &&
            Boolean(provider.lastVerifiedAt),
          models: modelsByConnection.get(provider.id) ?? [],
        })),
      },
      capabilities: catalogue.capabilities.map((capability) => ({
        ...capability,
        activeVersion:
          overview.capabilities.find((version) => version.key === capability.key) ?? null,
      })),
      execution: {
        services: catalogue.services,
        routes: catalogue.routes,
        recentRuns: overview.recentRuns,
      },
      governance: {
        prompts: catalogue.prompts,
        schemas: catalogue.schemas,
        taxonomies: catalogue.taxonomies,
        budgets: catalogue.budgets,
      },
      monitoring: {
        usage: overview.usage,
        health: catalogue.health,
        recentRuns: overview.recentRuns,
      },
    };
  }

  /**
   * Rejects a provider the platform cannot actually serve, and a credential payload
   * whose shape the provider never declared.
   */
  private guardProvider(input: ProviderInput) {
    const definition = findProviderDefinition(input.providerKey);
    if (!definition || !definition.installed) {
      return {
        verified: false as const,
        state: 'PROVIDER_NOT_CONFIGURED' as const,
        safeMessage: definition?.unavailableReason ?? 'Adapter not installed.',
      };
    }
    const payload: Record<string, unknown> = { apiKey: input.apiKey };
    if (input.organizationReference !== undefined) {
      payload.organizationReference = input.organizationReference;
    }
    if (input.approvedDataRegion !== undefined) {
      payload.approvedDataRegion = input.approvedDataRegion;
    }
    const validation = validateCredentialPayload(input.providerKey, payload);
    if (!validation.valid) {
      return {
        verified: false as const,
        state: 'VALIDATION_FAILED' as const,
        safeMessage: validation.issues.map((issue) => issue.message).join(' · '),
      };
    }
    return null;
  }

  async testProvider(input: ProviderInput, principal: Principal) {
    this.enforceValidationLimit(principal.subject);

    // Refused at runtime, not merely absent from the interface: a provider with no
    // installed adapter has nothing to test against, and pretending otherwise would
    // report a connection this platform cannot actually make.
    const guard = this.guardProvider(input);
    if (guard) return guard;

    const provider = new OpenAIIntelligenceProvider({
      resolveApiKey: async () => input.apiKey,
      timeoutMs: 10_000,
    });
    const started = Date.now();
    const result = await provider.testConnection();
    await this.audit.append({
      actorType: 'USER',
      actorId: principal.subject,
      action: 'AI_PROVIDER_CONNECTION_TESTED',
      aggregateType: 'AI_PROVIDER_CONNECTION',
      aggregateId: 'ephemeral',
      purpose: 'RELEASE_MANAGEMENT',
      result: result.state,
      payload: { providerKey: input.providerKey, environment: input.environment },
    });
    if (!successState(result.state)) return { ...result, verified: false };
    return {
      ...result,
      verified: true,
      latencyMs: Date.now() - started,
      validationProof: this.vault.createProviderValidationProof(input.providerKey, {
        apiKey: input.apiKey,
        environment: input.environment === 'production' ? 'PRODUCTION' : 'SANDBOX',
        label: input.connectionLabel,
      }),
      expiresInSeconds: 300,
    };
  }

  async connectProvider(input: ProviderInput & { validationProof: string }, principal: Principal) {
    // Guarded again on connect: a valid proof for an uninstalled adapter must still
    // not create a connection.
    const guard = this.guardProvider(input);
    if (guard) return { status: 'REJECTED' as const, ...guard };

    const proofValid = this.vault.verifyProviderValidationProof(
      input.providerKey,
      input.validationProof,
      {
        apiKey: input.apiKey,
        environment: input.environment === 'production' ? 'PRODUCTION' : 'SANDBOX',
        label: input.connectionLabel,
      },
    );
    if (!proofValid)
      return {
        state: 'VALIDATION_FAILED' as const,
        saved: false,
        safeMessage: 'Run a successful provider test again before saving.',
      };
    const test = await this.testProvider(input, principal);
    if (!test.verified) return { ...test, saved: false };
    const capabilityMetadata = 'data' in test ? test.data.metadata : {};
    const encrypted = this.vault.encrypt(input.providerKey, input.apiKey);
    const now = new Date();
    const saved = await this.database.db.transaction(async (tx) => {
      await tx.insert(encryptedProviderCredentials).values({
        ...encrypted,
        provider: input.providerKey,
      });
      const [reference] = await tx
        .insert(aiProviderCredentialReferences)
        .values({
          providerKey: input.providerKey,
          secretReference: encrypted.secretReference,
          keyVersion: encrypted.keyVersion,
          active: true,
        })
        .returning();
      if (!reference) throw new Error('AI provider credential reference was not persisted');
      const [connection] = await tx
        .insert(aiProviderConnections)
        .values({
          providerKey: input.providerKey,
          connectionLabel: input.connectionLabel,
          environment: input.environment,
          credentialReferenceId: reference.id,
          status: 'CONNECTED',
          enabled: true,
          region: input.region ?? null,
          approvedDataRegion: input.approvedDataRegion ?? null,
          organizationReference: input.organizationReference ?? null,
          safeConfiguration: {},
          capabilitySnapshot: capabilityMetadata,
          modelCount: Number(capabilityMetadata.discoveredModels ?? 0),
          lastVerifiedAt: now,
          lastSuccessfulRequestAt: now,
          synthetic: false,
          createdBy: principal.subject,
          updatedBy: principal.subject,
        })
        .returning();
      if (!connection) throw new Error('AI provider connection was not persisted');
      return { connection, reference };
    });
    await this.audit.append({
      actorType: 'USER',
      actorId: principal.subject,
      action: 'AI_PROVIDER_CONNECTED',
      aggregateType: 'AI_PROVIDER_CONNECTION',
      aggregateId: saved.connection.id,
      purpose: 'RELEASE_MANAGEMENT',
      payload: {
        providerKey: input.providerKey,
        environment: input.environment,
        credentialReference: safeCredentialReference(input.providerKey, saved.reference.id),
      },
    });
    return {
      state: 'SUCCESS' as const,
      saved: true,
      connection: this.safeConnection(saved.connection),
    };
  }

  /**
   * The governed model registry.
   *
   * Only verified metadata is returned. Where the provider has not told us a context
   * window or a price, the field is absent rather than filled with a plausible number:
   * an invented limit is worse than a missing one because it will be believed.
   */
  async modelRegistry() {
    const [models, approvals, prices, connections, usage] = await Promise.all([
      this.database.db.select().from(aiModels),
      this.database.db.select().from(aiModelApprovals),
      this.database.db.select().from(aiModelPrices),
      this.database.db.select().from(aiProviderConnections),
      this.database.db.select().from(aiUsageRecords),
    ]);

    return {
      items: models.map((model) => {
        const connection = connections.find((row) => row.id === model.connectionId);
        const modelApprovals = approvals.filter((row) => row.modelId === model.id);
        const price = prices
          .filter((row) => row.modelId === model.id)
          .sort((left, right) => right.effectiveAt.getTime() - left.effectiveAt.getTime())[0];
        const runs = usage.filter((row) => row.modelId === model.id);
        const latencies = runs
          .map((row) => row.latencyMs)
          .filter((value): value is number => typeof value === 'number')
          .sort((left, right) => left - right);

        return {
          id: model.id,
          connectionId: model.connectionId,
          providerKey: connection?.providerKey ?? 'UNKNOWN',
          connectionLabel: connection?.connectionLabel ?? null,
          providerModelId: model.providerModelId,
          displayName: model.displayName,
          available: model.available,
          deprecated: model.deprecated,
          retiredAt: model.retiredAt,
          structuredOutput: model.structuredOutput,
          jsonSchemaSupport: model.jsonSchemaSupport,
          embeddingSupport: model.embeddingSupport,
          contextLimit: model.contextLimit,
          outputLimit: model.outputLimit,
          regionRestrictions: model.regionRestrictions ?? [],
          lastVerifiedAt: model.lastVerifiedAt,
          approvals: modelApprovals.map((approval) => ({
            environment: approval.environment,
            approved: approval.approved,
            approvedBy: approval.approvedBy,
            reason: approval.reason,
            approvedAt: approval.approvedAt,
          })),
          productionApproved: modelApprovals.some(
            (approval) => approval.environment === 'production' && approval.approved,
          ),
          // Absent, not guessed, when no price has been recorded.
          price: price
            ? {
                currency: price.currency,
                inputMicrosPerMillion: price.inputMicrosPerMillion,
                outputMicrosPerMillion: price.outputMicrosPerMillion,
                sourceUrl: price.sourceUrl,
                effectiveAt: price.effectiveAt,
                approvedBy: price.approvedBy,
              }
            : null,
          // Measured from recorded runs rather than quoted from a datasheet.
          latencyProfile:
            latencies.length > 0
              ? {
                  runs: latencies.length,
                  p50Ms: latencies[Math.floor(latencies.length * 0.5)] ?? null,
                  p95Ms: latencies[Math.floor(latencies.length * 0.95)] ?? null,
                }
              : null,
        };
      }),
    };
  }

  /**
   * Approves or refuses a model for one environment.
   *
   * Production approval is a separate decision from availability: a model the provider
   * offers is not thereby fit for caller-affecting work.
   */
  async decideModelApproval(input: {
    modelId: string;
    environment: Environment;
    approved: boolean;
    reason: string;
    principal: Principal;
  }) {
    const model = await this.database.db.query.aiModels.findFirst({
      where: eq(aiModels.id, input.modelId),
    });
    if (!model) return { status: 'NOT_FOUND' as const };

    const blockers: string[] = [];
    if (input.approved && !model.available) {
      blockers.push('The provider does not currently offer this model');
    }

    // A model is only as production-eligible as the adapter behind it. The simulator
    // is deliberately NON_PRODUCTION_ONLY, and approving one of its models for
    // production would put a synthetic adapter on a caller-affecting path.
    if (input.approved && input.environment === 'production') {
      const connection = await this.database.db.query.aiProviderConnections.findFirst({
        where: eq(aiProviderConnections.id, model.connectionId),
      });
      const definition = connection ? findProviderDefinition(connection.providerKey) : undefined;
      if (!definition || definition.support !== 'SUPPORTED') {
        blockers.push(
          `${connection?.providerKey ?? 'This provider'} is not eligible to serve production, so its models cannot be approved for it`,
        );
      }
      if (connection?.synthetic) {
        blockers.push('This is a synthetic connection and can never serve production');
      }
    }
    if (input.approved && model.deprecated) {
      blockers.push('This model is deprecated and cannot be approved');
    }
    // Every production capability requires a schema-valid response, so an unverified
    // structured-output capability cannot be approved for production.
    if (
      input.approved &&
      input.environment === 'production' &&
      model.structuredOutput !== 'SUPPORTED'
    ) {
      blockers.push(
        `Structured output is ${model.structuredOutput.toLowerCase()}, so this model cannot be approved for production`,
      );
    }
    if (blockers.length > 0) return { status: 'BLOCKED' as const, blockers };

    const actor = input.principal.subject;
    const [approval] = await this.database.db
      .insert(aiModelApprovals)
      .values({
        modelId: input.modelId,
        environment: input.environment,
        approved: input.approved,
        approvedBy: actor,
        reason: input.reason,
      })
      .onConflictDoUpdate({
        target: [aiModelApprovals.modelId, aiModelApprovals.environment],
        set: {
          approved: input.approved,
          approvedBy: actor,
          reason: input.reason,
          approvedAt: new Date(),
        },
      })
      .returning();

    await this.audit.append({
      actorType: 'USER',
      actorId: actor,
      action: input.approved ? 'AI_MODEL_APPROVED' : 'AI_MODEL_APPROVAL_WITHDRAWN',
      aggregateType: 'AiModel',
      aggregateId: input.modelId,
      purpose: 'RELEASE_MANAGEMENT',
      payload: {
        environment: input.environment,
        approved: input.approved,
        reason: input.reason,
        providerModelId: model.providerModelId,
      },
    });

    return { status: 'RECORDED' as const, approval };
  }

  /** Enables or disables a model for use, independently of approval. */
  async setModelAvailability(modelId: string, available: boolean, principal: Principal) {
    const model = await this.database.db.query.aiModels.findFirst({
      where: eq(aiModels.id, modelId),
    });
    if (!model) return { status: 'NOT_FOUND' as const };

    const [updated] = await this.database.db
      .update(aiModels)
      .set({ available, updatedAt: new Date() })
      .where(eq(aiModels.id, modelId))
      .returning();

    await this.audit.append({
      actorType: 'USER',
      actorId: principal.subject,
      action: available ? 'AI_MODEL_ENABLED' : 'AI_MODEL_DISABLED',
      aggregateType: 'AiModel',
      aggregateId: modelId,
      purpose: 'RELEASE_MANAGEMENT',
      payload: { providerModelId: model.providerModelId, available },
    });

    return { status: 'UPDATED' as const, model: updated };
  }

  /* ------------------------------------------------- governed artefacts */

  /**
   * Prompt, schema and taxonomy versions share one lifecycle, so they share this
   * implementation. Versions are immutable once they leave draft: activating a new one
   * supersedes the previous rather than editing what is already in use.
   */
  async governedArtefacts(kind: 'prompt' | 'schema' | 'taxonomy') {
    if (kind === 'prompt') {
      const [parents, versions] = await Promise.all([
        this.database.db.select().from(aiPrompts),
        this.database.db.select().from(aiPromptVersions),
      ]);
      return {
        items: parents.map((parent) => ({
          id: parent.id,
          key: parent.key,
          purpose: parent.purpose,
          versions: versions
            .filter((version) => version.promptId === parent.id)
            .sort((left, right) => right.version - left.version)
            .map((version) => ({
              id: version.id,
              version: version.version,
              state: version.state,
              content: version.content,
              checksum: version.checksum,
              authorId: version.authorId,
              approvedBy: version.approvedBy,
              activatedAt: version.activatedAt,
              createdAt: version.createdAt,
            })),
        })),
      };
    }
    if (kind === 'schema') {
      const [parents, versions] = await Promise.all([
        this.database.db.select().from(aiOutputSchemas),
        this.database.db.select().from(aiOutputSchemaVersions),
      ]);
      return {
        items: parents.map((parent) => ({
          id: parent.id,
          key: parent.key,
          purpose: parent.purpose,
          versions: versions
            .filter((version) => version.schemaId === parent.id)
            .sort((left, right) => right.version - left.version)
            .map((version) => ({
              id: version.id,
              version: version.version,
              state: version.state,
              content: JSON.stringify(version.jsonSchema, null, 2),
              checksum: version.checksum,
              // Code-owned schemas are registered by the build. Editing one at runtime
              // would let a model widen its own output contract.
              codeOwned: version.codeOwned,
              registeredByBuild: version.registeredByBuild,
              approvedBy: version.approvedBy,
              // This table records activation through state alone, so the column is
              // reported as absent rather than invented.
              activatedAt: null,
              createdAt: version.createdAt,
            })),
        })),
      };
    }
    const [parents, versions] = await Promise.all([
      this.database.db.select().from(aiTaxonomies),
      this.database.db.select().from(aiTaxonomyVersions),
    ]);
    return {
      items: parents.map((parent) => ({
        id: parent.id,
        key: parent.key,
        purpose: parent.purpose,
        versions: versions
          .filter((version) => version.taxonomyId === parent.id)
          .sort((left, right) => right.version - left.version)
          .map((version) => ({
            id: version.id,
            version: version.version,
            state: version.state,
            values: version.values,
            content: (version.values ?? []).join('\n'),
            checksum: version.checksum,
            authorId: version.authorId,
            approvedBy: version.approvedBy,
            activatedAt: null,
            createdAt: version.createdAt,
          })),
      })),
    };
  }

  /**
   * Advances a governed artefact through its lifecycle.
   *
   * Code-owned schemas are refused outright: they are registered by the build, and a
   * runtime edit would let a model's output contract be widened without review.
   */
  async transitionGovernedArtefact(input: {
    kind: 'prompt' | 'schema' | 'taxonomy';
    versionId: string;
    action: 'SUBMIT' | 'APPROVE' | 'REJECT' | 'ACTIVATE' | 'ROLLBACK';
    reason: string;
    principal: Principal;
  }) {
    const table =
      input.kind === 'prompt'
        ? aiPromptVersions
        : input.kind === 'schema'
          ? aiOutputSchemaVersions
          : aiTaxonomyVersions;

    const [version] = await this.database.db
      .select()
      .from(table)
      .where(eq(table.id, input.versionId));
    if (!version) return { status: 'NOT_FOUND' as const };

    if (input.kind === 'schema' && 'codeOwned' in version && version.codeOwned) {
      return {
        status: 'FORBIDDEN' as const,
        message:
          'This schema is code-owned and registered by the build. It cannot be changed at runtime.',
      };
    }

    const transitions: Record<string, { from: string[]; to: string }> = {
      SUBMIT: { from: ['DRAFT'], to: 'IN_REVIEW' },
      APPROVE: { from: ['IN_REVIEW'], to: 'APPROVED' },
      REJECT: { from: ['IN_REVIEW'], to: 'DRAFT' },
      ACTIVATE: { from: ['APPROVED'], to: 'ACTIVE' },
      ROLLBACK: { from: ['ACTIVE'], to: 'ROLLED_BACK' },
    };
    const transition = transitions[input.action];
    if (!transition || !transition.from.includes(version.state)) {
      return { status: 'CONFLICT' as const, currentState: version.state };
    }

    // Approving your own draft defeats the point of a second pair of eyes.
    if (
      input.action === 'APPROVE' &&
      'authorId' in version &&
      version.authorId === input.principal.subject
    ) {
      return {
        status: 'BLOCKED' as const,
        blockers: ['A version cannot be approved by the person who authored it'],
      };
    }

    const changes: Record<string, unknown> = { state: transition.to, updatedAt: new Date() };
    if (input.action === 'APPROVE') changes.approvedBy = input.principal.subject;
    if (input.action === 'ACTIVATE' && input.kind === 'prompt') changes.activatedAt = new Date();

    await this.database.db.transaction(async (tx) => {
      if (input.action === 'ACTIVATE') {
        // Exactly one active version per artefact, so resolution is unambiguous.
        const parentColumn =
          input.kind === 'prompt'
            ? aiPromptVersions.promptId
            : input.kind === 'schema'
              ? aiOutputSchemaVersions.schemaId
              : aiTaxonomyVersions.taxonomyId;
        const parentId = (version as Record<string, unknown>)[
          input.kind === 'prompt' ? 'promptId' : input.kind === 'schema' ? 'schemaId' : 'taxonomyId'
        ] as string;
        await tx
          .update(table)
          .set({ state: 'SUPERSEDED', updatedAt: new Date() })
          .where(and(eq(parentColumn, parentId), eq(table.state, 'ACTIVE')));
      }
      await tx.update(table).set(changes).where(eq(table.id, input.versionId));
    });

    await this.audit.append({
      actorType: 'USER',
      actorId: input.principal.subject,
      action: `AI_${input.kind.toUpperCase()}_${input.action}`,
      aggregateType:
        input.kind === 'prompt'
          ? 'AiPromptVersion'
          : input.kind === 'schema'
            ? 'AiOutputSchemaVersion'
            : 'AiTaxonomyVersion',
      aggregateId: input.versionId,
      purpose: 'RELEASE_MANAGEMENT',
      payload: { from: version.state, to: transition.to, reason: input.reason },
    });

    return { status: 'UPDATED' as const, from: version.state, to: transition.to };
  }

  /* --------------------------------------------------------------- budgets */

  async upsertBudgetPolicy(input: {
    key: string;
    environment: Environment;
    scopeType: string;
    scopeId?: string | undefined;
    perRequestLimitMicros?: number | undefined;
    dailyLimitMicros?: number | undefined;
    monthlyLimitMicros?: number | undefined;
    currency: string;
    active: boolean;
    principal: Principal;
  }) {
    const blockers: string[] = [];
    // A per-request ceiling above the daily limit cannot bind, and a daily above the
    // monthly is the same mistake a level up.
    if (
      input.perRequestLimitMicros !== undefined &&
      input.dailyLimitMicros !== undefined &&
      input.perRequestLimitMicros > input.dailyLimitMicros
    ) {
      blockers.push('The per-request ceiling cannot exceed the daily limit');
    }
    if (
      input.dailyLimitMicros !== undefined &&
      input.monthlyLimitMicros !== undefined &&
      input.dailyLimitMicros > input.monthlyLimitMicros
    ) {
      blockers.push('The daily limit cannot exceed the monthly limit');
    }
    if (
      input.active &&
      input.perRequestLimitMicros === undefined &&
      input.dailyLimitMicros === undefined &&
      input.monthlyLimitMicros === undefined
    ) {
      blockers.push('An active budget must set at least one limit');
    }
    if (blockers.length > 0) return { status: 'BLOCKED' as const, blockers };

    const limits = {
      perRequestLimitMicros: input.perRequestLimitMicros ?? null,
      dailyLimitMicros: input.dailyLimitMicros ?? null,
      monthlyLimitMicros: input.monthlyLimitMicros ?? null,
      currency: input.currency,
      active: input.active,
      approvedBy: input.principal.subject,
    };

    // Matched explicitly rather than through `onConflictDoUpdate`. The uniqueness rule is
    // an expression index over `coalesce(scope_id, '')` — because an environment-wide
    // budget has a null scope and nulls do not collide — and a conflict target cannot
    // name that. The index still backs this: a concurrent duplicate is rejected by the
    // database rather than quietly inserted.
    const scopeId = input.scopeId ?? null;
    const [existing] = await this.database.db
      .select()
      .from(aiBudgetPolicies)
      .where(
        and(
          eq(aiBudgetPolicies.key, input.key),
          eq(aiBudgetPolicies.environment, input.environment),
          eq(aiBudgetPolicies.scopeType, input.scopeType),
          scopeId === null
            ? isNull(aiBudgetPolicies.scopeId)
            : eq(aiBudgetPolicies.scopeId, scopeId),
        ),
      )
      .limit(1);

    const [policy] = existing
      ? await this.database.db
          .update(aiBudgetPolicies)
          .set({ ...limits, updatedAt: new Date() })
          .where(eq(aiBudgetPolicies.id, existing.id))
          .returning()
      : await this.database.db
          .insert(aiBudgetPolicies)
          .values({
            key: input.key,
            environment: input.environment,
            scopeType: input.scopeType,
            scopeId,
            ...limits,
          })
          .returning();

    await this.audit.append({
      actorType: 'USER',
      actorId: input.principal.subject,
      action: 'AI_BUDGET_POLICY_SET',
      aggregateType: 'AiBudgetPolicy',
      aggregateId: policy?.id ?? input.key,
      purpose: 'RELEASE_MANAGEMENT',
      payload: {
        key: input.key,
        environment: input.environment,
        scopeType: input.scopeType,
        active: input.active,
        currency: input.currency,
      },
    });

    return { status: 'SAVED' as const, policy };
  }

  /**
   * Spend against each active budget, and any breach.
   *
   * Breaches are computed from recorded usage rather than tracked as a flag, so the
   * figure cannot drift away from what actually happened.
   */
  async budgetStatus() {
    const [budgets, usage, connections] = await Promise.all([
      this.database.db.select().from(aiBudgetPolicies),
      this.database.db.select().from(aiUsageRecords),
      this.database.db.select().from(aiProviderConnections),
    ]);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);

    return {
      items: budgets.map((budget) => {
        const scoped = usage.filter((record) => {
          if (budget.scopeType === 'PROVIDER')
            return record.providerConnectionId === budget.scopeId;
          if (budget.scopeType === 'MODEL') return record.modelId === budget.scopeId;
          if (budget.scopeType === 'CAPABILITY') return record.capabilityKey === budget.scopeId;
          return true;
        });
        const spend = (since: Date) =>
          scoped
            .filter((record) => record.createdAt >= since)
            .reduce((sum, record) => sum + (record.costMicros ?? 0), 0);

        const dailySpend = spend(startOfDay);
        const monthlySpend = spend(startOfMonth);
        const perRequestBreaches = scoped.filter(
          (record) =>
            budget.perRequestLimitMicros !== null &&
            (record.costMicros ?? 0) > budget.perRequestLimitMicros,
        );

        return {
          id: budget.id,
          key: budget.key,
          environment: budget.environment,
          scopeType: budget.scopeType,
          scopeId: budget.scopeId,
          scopeLabel:
            budget.scopeType === 'PROVIDER'
              ? (connections.find((row) => row.id === budget.scopeId)?.connectionLabel ?? null)
              : budget.scopeId,
          currency: budget.currency,
          active: budget.active,
          approvedBy: budget.approvedBy,
          perRequestLimitMicros: budget.perRequestLimitMicros,
          dailyLimitMicros: budget.dailyLimitMicros,
          monthlyLimitMicros: budget.monthlyLimitMicros,
          dailySpendMicros: dailySpend,
          monthlySpendMicros: monthlySpend,
          dailyBreached: budget.dailyLimitMicros !== null && dailySpend > budget.dailyLimitMicros,
          monthlyBreached:
            budget.monthlyLimitMicros !== null && monthlySpend > budget.monthlyLimitMicros,
          perRequestBreaches: perRequestBreaches.length,
          // A warning at four-fifths gives an operator time to act before the hard stop.
          warningThresholdReached:
            budget.dailyLimitMicros !== null && dailySpend >= budget.dailyLimitMicros * 0.8,
        };
      }),
    };
  }

  /* --------------------------------------------------------------- routes */

  async routeRegistry() {
    const [routes, versions, connections, models, budgets] = await Promise.all([
      this.database.db.select().from(aiRoutes),
      this.database.db.select().from(aiRouteVersions),
      this.database.db.select().from(aiProviderConnections),
      this.database.db.select().from(aiModels),
      this.database.db.select().from(aiBudgetPolicies),
    ]);

    const describe = (connectionId: string | null, modelId: string | null) => {
      if (!connectionId || !modelId) return null;
      const connection = connections.find((row) => row.id === connectionId);
      const model = models.find((row) => row.id === modelId);
      return {
        connectionId,
        modelId,
        providerKey: connection?.providerKey ?? 'UNKNOWN',
        connectionLabel: connection?.connectionLabel ?? null,
        providerModelId: model?.providerModelId ?? null,
        available: model?.available ?? false,
      };
    };

    return {
      items: routes.map((route) => ({
        id: route.id,
        key: route.key,
        purpose: route.purpose,
        versions: versions
          .filter((version) => version.routeId === route.id)
          .sort((left, right) => right.version - left.version)
          .map((version) => ({
            id: version.id,
            version: version.version,
            state: version.state,
            environment: version.environment,
            // Candidates are ordered: primary first, then fallback. The order is the
            // behaviour, so it is preserved rather than presented as a set.
            candidates: [
              {
                position: 0,
                role: 'PRIMARY',
                ...describe(version.providerConnectionId, version.modelId),
              },
              ...(version.fallbackProviderConnectionId && version.fallbackModelId
                ? [
                    {
                      position: 1,
                      role: 'FALLBACK',
                      ...describe(version.fallbackProviderConnectionId, version.fallbackModelId),
                    },
                  ]
                : []),
            ],
            timeoutMs: version.timeoutMs,
            maximumRetries: version.maximumRetries,
            confidenceThreshold: version.confidenceThreshold,
            maximumCostMicros: version.maximumCostMicros,
            layers: version.layers,
            authorId: version.authorId,
            approvedBy: version.approvedBy,
            createdAt: version.createdAt,
          })),
      })),
      budgets,
      connections: connections.map((connection) => this.safeConnection(connection)),
      models: models.map((model) => ({
        id: model.id,
        connectionId: model.connectionId,
        providerModelId: model.providerModelId,
        available: model.available,
        deprecated: model.deprecated,
        structuredOutput: model.structuredOutput,
      })),
    };
  }

  /**
   * Validates a route version against everything that must hold before it may serve
   * traffic.
   *
   * Run both as a preview and again at activation: a route that passed when it was
   * drafted may not pass now, because a model can be deprecated or an approval
   * withdrawn in between.
   */
  async validateRouteVersion(routeVersionId: string) {
    const version = await this.database.db.query.aiRouteVersions.findFirst({
      where: eq(aiRouteVersions.id, routeVersionId),
    });
    if (!version) return { status: 'NOT_FOUND' as const };

    const [connections, models, approvals, budgets, siblings] = await Promise.all([
      this.database.db.select().from(aiProviderConnections),
      this.database.db.select().from(aiModels),
      this.database.db.select().from(aiModelApprovals),
      this.database.db.select().from(aiBudgetPolicies),
      this.database.db
        .select()
        .from(aiRouteVersions)
        .where(eq(aiRouteVersions.routeId, version.routeId)),
    ]);

    const failures: Array<{ check: string; message: string }> = [];
    const production = version.environment === 'production';

    const checkCandidate = (
      role: 'primary' | 'fallback',
      connectionId: string | null,
      modelId: string | null,
    ) => {
      if (!connectionId || !modelId) return;
      const connection = connections.find((row) => row.id === connectionId);
      const model = models.find((row) => row.id === modelId);

      if (!connection) {
        failures.push({
          check: `${role}.provider`,
          message: 'The provider connection no longer exists',
        });
        return;
      }
      const definition = PROVIDER_DEFINITIONS.find((row) => row.key === connection.providerKey);
      if (!definition?.installed) {
        failures.push({
          check: `${role}.adapter`,
          message: `No adapter is installed for ${connection.providerKey}`,
        });
      }
      if (!connection.enabled) {
        failures.push({ check: `${role}.enabled`, message: 'The provider connection is disabled' });
      }
      if (connection.status !== 'CONNECTED') {
        failures.push({
          check: `${role}.status`,
          message: `The provider connection is ${connection.status.toLowerCase()}`,
        });
      }
      if (!model) {
        failures.push({ check: `${role}.model`, message: 'The model no longer exists' });
        return;
      }
      if (!model.available) {
        failures.push({ check: `${role}.availability`, message: 'The model is not available' });
      }
      if (model.deprecated) {
        failures.push({ check: `${role}.deprecation`, message: 'The model is deprecated' });
      }
      // Every governed capability requires a schema-valid response.
      if (model.structuredOutput !== 'SUPPORTED') {
        failures.push({
          check: `${role}.structuredOutput`,
          message: `Structured output is ${model.structuredOutput.toLowerCase()} for this model`,
        });
      }
      if (model.connectionId !== connectionId) {
        failures.push({
          check: `${role}.consistency`,
          message: 'The model belongs to a different provider connection',
        });
      }

      if (production) {
        const approved = approvals.some(
          (row) => row.modelId === modelId && row.environment === 'production' && row.approved,
        );
        if (!approved) {
          failures.push({
            check: `${role}.productionApproval`,
            message: 'The model is not approved for production',
          });
        }
        if (definition?.support !== 'SUPPORTED') {
          failures.push({
            check: `${role}.productionEligibility`,
            message: `${connection.providerKey} is not eligible to serve production`,
          });
        }
        if (!connection.approvedDataRegion) {
          failures.push({
            check: `${role}.region`,
            message: 'No approved data region is recorded on this connection',
          });
        }
        const regions = model.regionRestrictions ?? [];
        if (
          regions.length > 0 &&
          connection.approvedDataRegion &&
          !regions.includes(connection.approvedDataRegion)
        ) {
          failures.push({
            check: `${role}.regionPolicy`,
            message: `The model is restricted to ${regions.join(', ')}`,
          });
        }
      }
    };

    checkCandidate('primary', version.providerConnectionId, version.modelId);
    checkCandidate('fallback', version.fallbackProviderConnectionId, version.fallbackModelId);

    // Fallback integrity: a fallback identical to the primary is not a fallback, it is
    // the same failure twice.
    if (
      version.fallbackProviderConnectionId &&
      version.fallbackProviderConnectionId === version.providerConnectionId &&
      version.fallbackModelId === version.modelId
    ) {
      failures.push({
        check: 'fallback.integrity',
        message: 'The fallback is identical to the primary candidate, so it adds no resilience',
      });
    }

    // A route that both is and is not the active one for its environment would make
    // resolution ambiguous.
    const otherActive = siblings.filter(
      (row) =>
        row.id !== version.id && row.state === 'ACTIVE' && row.environment === version.environment,
    );
    if (otherActive.length > 0) {
      failures.push({
        check: 'route.uniqueness',
        message: `Version ${otherActive[0]?.version} is already active for ${version.environment}`,
      });
    }

    if (version.timeoutMs <= 0) {
      failures.push({ check: 'route.timeout', message: 'A positive timeout is required' });
    }
    if (version.maximumRetries < 0 || version.maximumRetries > 5) {
      failures.push({ check: 'route.retries', message: 'Retries must be between 0 and 5' });
    }

    // A cost limit must exist somewhere, or nothing stops a runaway spend.
    const applicableBudgets = budgets.filter(
      (budget) => budget.environment === version.environment && budget.active,
    );
    if (version.maximumCostMicros === null && applicableBudgets.length === 0) {
      failures.push({
        check: 'route.budget',
        message: 'No per-run ceiling and no active budget policy for this environment',
      });
    }
    const perRequestCeiling = applicableBudgets
      .map((budget) => budget.perRequestLimitMicros)
      .filter((value): value is number => typeof value === 'number');
    if (
      version.maximumCostMicros !== null &&
      perRequestCeiling.length > 0 &&
      version.maximumCostMicros > Math.min(...perRequestCeiling)
    ) {
      failures.push({
        check: 'route.budgetCeiling',
        message: 'The per-run ceiling exceeds the active per-request budget limit',
      });
    }

    return {
      status: 'VALIDATED' as const,
      routeVersionId,
      environment: version.environment,
      valid: failures.length === 0,
      failures,
    };
  }

  /** Creates a new draft route version, cloning an existing one when asked. */
  async createRouteVersion(input: {
    routeId: string;
    environment: Environment;
    providerConnectionId: string;
    modelId: string;
    fallbackProviderConnectionId?: string | undefined;
    fallbackModelId?: string | undefined;
    timeoutMs: number;
    maximumRetries: number;
    confidenceThreshold: number;
    maximumCostMicros?: number | undefined;
    principal: Principal;
  }) {
    const existing = await this.database.db
      .select()
      .from(aiRouteVersions)
      .where(eq(aiRouteVersions.routeId, input.routeId));
    if (existing.length === 0) {
      const route = await this.database.db.query.aiRoutes.findFirst({
        where: eq(aiRoutes.id, input.routeId),
      });
      if (!route) return { status: 'NOT_FOUND' as const };
    }

    const nextVersion = Math.max(0, ...existing.map((row) => row.version)) + 1;
    const [created] = await this.database.db
      .insert(aiRouteVersions)
      .values({
        routeId: input.routeId,
        version: nextVersion,
        state: 'DRAFT',
        environment: input.environment,
        providerConnectionId: input.providerConnectionId,
        modelId: input.modelId,
        fallbackProviderConnectionId: input.fallbackProviderConnectionId ?? null,
        fallbackModelId: input.fallbackModelId ?? null,
        timeoutMs: input.timeoutMs,
        maximumRetries: input.maximumRetries,
        confidenceThreshold: input.confidenceThreshold.toFixed(4),
        maximumCostMicros: input.maximumCostMicros ?? null,
        layers: [],
        authorId: input.principal.subject,
      })
      .returning();
    if (!created) return { status: 'FAILED' as const };

    await this.audit.append({
      actorType: 'USER',
      actorId: input.principal.subject,
      action: 'AI_ROUTE_VERSION_CREATED',
      aggregateType: 'AiRouteVersion',
      aggregateId: created.id,
      purpose: 'RELEASE_MANAGEMENT',
      payload: { routeId: input.routeId, version: nextVersion, environment: input.environment },
    });

    // Returned with the validation result so the author sees immediately what would
    // stop it activating, rather than discovering it at activation.
    const validation = await this.validateRouteVersion(created.id);
    return { status: 'CREATED' as const, routeVersion: created, validation };
  }

  /**
   * Activates a route version, but only if it revalidates now. The interface cannot
   * bypass this: activation is refused here, not merely discouraged in the UI.
   */
  async activateRouteVersion(routeVersionId: string, principal: Principal) {
    const validation = await this.validateRouteVersion(routeVersionId);
    if (validation.status === 'NOT_FOUND') return validation;
    if (!validation.valid) {
      return { status: 'BLOCKED' as const, failures: validation.failures };
    }

    const version = await this.database.db.query.aiRouteVersions.findFirst({
      where: eq(aiRouteVersions.id, routeVersionId),
    });
    if (!version) return { status: 'NOT_FOUND' as const };

    await this.database.db.transaction(async (tx) => {
      // Supersede whatever was active for this environment so resolution stays
      // unambiguous.
      await tx
        .update(aiRouteVersions)
        .set({ state: 'SUPERSEDED', updatedAt: new Date() })
        .where(
          and(
            eq(aiRouteVersions.routeId, version.routeId),
            eq(aiRouteVersions.environment, version.environment),
            eq(aiRouteVersions.state, 'ACTIVE'),
          ),
        );
      await tx
        .update(aiRouteVersions)
        .set({ state: 'ACTIVE', approvedBy: principal.subject, updatedAt: new Date() })
        .where(eq(aiRouteVersions.id, routeVersionId));
    });

    await this.audit.append({
      actorType: 'USER',
      actorId: principal.subject,
      action: 'AI_ROUTE_VERSION_ACTIVATED',
      aggregateType: 'AiRouteVersion',
      aggregateId: routeVersionId,
      purpose: 'RELEASE_MANAGEMENT',
      payload: {
        routeId: version.routeId,
        version: version.version,
        environment: version.environment,
      },
    });

    return { status: 'ACTIVATED' as const, routeVersionId };
  }

  async disableRouteVersion(routeVersionId: string, principal: Principal) {
    const version = await this.database.db.query.aiRouteVersions.findFirst({
      where: eq(aiRouteVersions.id, routeVersionId),
    });
    if (!version) return { status: 'NOT_FOUND' as const };
    if (version.state !== 'ACTIVE') {
      return { status: 'CONFLICT' as const, currentState: version.state };
    }

    const [updated] = await this.database.db
      .update(aiRouteVersions)
      .set({ state: 'ROLLED_BACK', updatedAt: new Date() })
      .where(eq(aiRouteVersions.id, routeVersionId))
      .returning();

    await this.audit.append({
      actorType: 'USER',
      actorId: principal.subject,
      action: 'AI_ROUTE_VERSION_DISABLED',
      aggregateType: 'AiRouteVersion',
      aggregateId: routeVersionId,
      purpose: 'RELEASE_MANAGEMENT',
      payload: { routeId: version.routeId, version: version.version },
    });

    return { status: 'DISABLED' as const, routeVersion: updated };
  }

  async discoverModels(connectionId: string, principal: Principal) {
    const connection = await this.database.db.query.aiProviderConnections.findFirst({
      where: eq(aiProviderConnections.id, connectionId),
    });
    if (!connection) return { state: 'PROVIDER_NOT_CONFIGURED' as const, discovered: 0 };
    const provider =
      connection.providerKey === 'SIMULATOR'
        ? new SimulatorIntelligenceProvider(this.simulatorMode())
        : new OpenAIIntelligenceProvider({
            resolveApiKey: () => this.resolveCredential(connection.id, connection.providerKey),
          });
    const result = await provider.listModels();
    if (!successState(result.state) || !('data' in result)) return { ...result, discovered: 0 };
    const now = new Date();
    for (const model of result.data) {
      await this.database.db
        .insert(aiModels)
        .values({
          connectionId,
          providerModelId: model.providerModelId,
          displayName: model.displayName,
          capabilities: model.providerMetadata,
          structuredOutput:
            model.structuredOutput === true
              ? 'SUPPORTED'
              : model.structuredOutput === false
                ? 'UNSUPPORTED'
                : 'UNVERIFIED',
          jsonSchemaSupport: model.structuredOutput === true ? 'SUPPORTED' : 'UNVERIFIED',
          embeddingSupport:
            model.embeddings === true
              ? 'SUPPORTED'
              : model.embeddings === false
                ? 'UNSUPPORTED'
                : 'UNVERIFIED',
          available: model.available,
          providerMetadata: model.providerMetadata,
          lastVerifiedAt: now,
        })
        .onConflictDoUpdate({
          target: [aiModels.connectionId, aiModels.providerModelId],
          set: {
            displayName: model.displayName,
            capabilities: model.providerMetadata,
            available: model.available,
            lastVerifiedAt: now,
            updatedAt: now,
          },
        });
    }
    await this.database.db
      .update(aiProviderConnections)
      .set({ modelCount: result.data.length, lastVerifiedAt: now, updatedAt: now })
      .where(eq(aiProviderConnections.id, connectionId));
    await this.audit.append({
      actorType: 'USER',
      actorId: principal.subject,
      action: 'AI_MODEL_DISCOVERED',
      aggregateType: 'AI_PROVIDER_CONNECTION',
      aggregateId: connectionId,
      purpose: 'RELEASE_MANAGEMENT',
      payload: { count: result.data.length },
    });
    return { state: 'SUCCESS' as const, discovered: result.data.length };
  }

  async disconnectProvider(connectionId: string, principal: Principal) {
    const connection = await this.database.db.query.aiProviderConnections.findFirst({
      where: eq(aiProviderConnections.id, connectionId),
    });
    if (!connection) return { state: 'PROVIDER_NOT_CONFIGURED' as const };
    const now = new Date();
    await this.database.db.transaction(async (tx) => {
      await tx
        .update(aiProviderConnections)
        .set({
          enabled: false,
          status: 'DISCONNECTED',
          updatedBy: principal.subject,
          updatedAt: now,
        })
        .where(eq(aiProviderConnections.id, connectionId));
      if (connection.credentialReferenceId)
        await tx
          .update(aiProviderCredentialReferences)
          .set({ active: false, revokedAt: now, updatedAt: now })
          .where(eq(aiProviderCredentialReferences.id, connection.credentialReferenceId));
    });
    await this.audit.append({
      actorType: 'USER',
      actorId: principal.subject,
      action: 'AI_PROVIDER_DISCONNECTED',
      aggregateType: 'AI_PROVIDER_CONNECTION',
      aggregateId: connectionId,
      purpose: 'RELEASE_MANAGEMENT',
    });
    return { state: 'SUCCESS' as const, disconnected: true };
  }

  async evaluateReadiness() {
    const environment = this.environment();
    const [connections, activeCapabilities, activeRoutes, budgets] = await Promise.all([
      this.database.db
        .select()
        .from(aiProviderConnections)
        .where(
          and(
            eq(aiProviderConnections.environment, environment),
            eq(aiProviderConnections.enabled, true),
          ),
        ),
      this.database.db
        .select()
        .from(aiCapabilityVersions)
        .where(eq(aiCapabilityVersions.state, 'ACTIVE')),
      this.database.db
        .select()
        .from(aiRouteVersions)
        .where(
          and(eq(aiRouteVersions.environment, environment), eq(aiRouteVersions.state, 'ACTIVE')),
        ),
      this.database.db
        .select()
        .from(aiBudgetPolicies)
        .where(
          and(eq(aiBudgetPolicies.environment, environment), eq(aiBudgetPolicies.active, true)),
        ),
    ]);
    const blockers: string[] = [];
    if (!connections.length) blockers.push('AI_PROVIDER_NOT_CONFIGURED');
    if (connections.some((connection) => connection.status !== 'CONNECTED'))
      blockers.push('AI_PROVIDER_UNHEALTHY');
    if (!activeCapabilities.length) blockers.push('AI_CRITICAL_PIPELINE_DISABLED');
    if (!activeRoutes.length) blockers.push('AI_ROUTE_MISSING');
    if (!budgets.length) blockers.push('AI_COST_LIMIT_NOT_CONFIGURED');
    if (
      environment === 'production' &&
      connections.some(
        (connection) => connection.synthetic || connection.providerKey === 'SIMULATOR',
      )
    )
      blockers.push('AI_SIMULATOR_IN_PRODUCTION_PATH');
    if (
      environment === 'production' &&
      activeCapabilities.some((capability) => !capability.productionApproved)
    )
      blockers.push('AI_PROVIDER_NOT_PRODUCTION_APPROVED');
    if (environment === 'production') {
      blockers.push('AI_DATA_REGION_UNAPPROVED', 'AI_RETENTION_UNAPPROVED', 'AI_EVALUATION_FAILED');
    }
    const status =
      blockers.length === 0
        ? environment === 'production'
          ? 'PRODUCTION_DEPLOYMENT_READY'
          : 'SANDBOX_CONFIGURED'
        : connections.length
          ? 'CONFIGURED_WITH_BLOCKERS'
          : 'NOT_CONFIGURED';
    const [evaluation] = await this.database.db
      .insert(aiReadinessEvaluations)
      .values({
        environment,
        status,
        checks: [
          { key: 'providers', passed: connections.length > 0 },
          { key: 'capabilities', passed: activeCapabilities.length > 0 },
          { key: 'routes', passed: activeRoutes.length > 0 },
          { key: 'budgets', passed: budgets.length > 0 },
        ],
        blockers: [...new Set(blockers)],
        evidenceIds: [],
      })
      .returning();
    return evaluation!;
  }

  async getActiveCapability(
    key: IntelligenceCapabilityKey,
  ): Promise<CapabilityVersion | undefined> {
    const [row] = await this.database.db
      .select({ definition: aiCapabilities, version: aiCapabilityVersions })
      .from(aiCapabilities)
      .innerJoin(aiCapabilityVersions, eq(aiCapabilityVersions.capabilityId, aiCapabilities.id))
      .where(and(eq(aiCapabilities.key, key), eq(aiCapabilityVersions.state, 'ACTIVE')))
      .limit(1);
    if (!row || row.version.emergencyDisabled) return undefined;
    const dependencies = await this.database.db
      .select({ dependency: aiCapabilities, link: aiCapabilityDependencies })
      .from(aiCapabilityDependencies)
      .innerJoin(
        aiCapabilities,
        eq(aiCapabilities.id, aiCapabilityDependencies.dependencyCapabilityId),
      )
      .where(eq(aiCapabilityDependencies.capabilityVersionId, row.version.id));
    return {
      id: row.version.id,
      capabilityKey: row.definition.key as IntelligenceCapabilityKey,
      version: row.version.version,
      serviceVersionId: row.version.serviceVersionId,
      contextPolicyVersionId: row.version.contextPolicyVersionId,
      dependencies: dependencies.map(({ dependency, link }) => ({
        capabilityKey: dependency.key as IntelligenceCapabilityKey,
        required: link.required,
        ...(link.minimumVersion ? { minimumVersion: link.minimumVersion } : {}),
        ...(link.maximumStalenessSeconds
          ? { maximumStalenessSeconds: link.maximumStalenessSeconds }
          : {}),
        parallelizable: link.parallelizable,
      })),
      allowedClassifications: row.version.allowedClassifications,
      maximumContextTokens: row.version.maximumContextTokens,
      confidenceThreshold: Number(row.version.confidenceThreshold),
      critical: row.version.critical,
      state: row.version.state,
    };
  }

  async getServiceVersion(id: string): Promise<ServiceVersion | undefined> {
    const [row] = await this.database.db
      .select({ service: aiServices, version: aiServiceVersions })
      .from(aiServiceVersions)
      .innerJoin(aiServices, eq(aiServices.id, aiServiceVersions.serviceId))
      .where(eq(aiServiceVersions.id, id))
      .limit(1);
    return row
      ? {
          id: row.version.id,
          serviceKey: row.service.key,
          version: row.version.version,
          pipelineVersionId: row.version.pipelineVersionId,
          routeVersionId: row.version.routeVersionId,
          promptVersionId: row.version.promptVersionId,
          schemaVersionId: row.version.schemaVersionId,
          ...(row.version.taxonomyVersionId
            ? { taxonomyVersionId: row.version.taxonomyVersionId }
            : {}),
          state: row.version.state,
        }
      : undefined;
  }

  async getRoute(
    _capability: CapabilityVersion,
    service: ServiceVersion,
    _request: ExecuteCapabilityRequest,
  ): Promise<ResolvedIntelligenceRoute | undefined> {
    const [row] = await this.database.db
      .select({
        route: aiRouteVersions,
        connection: aiProviderConnections,
        model: aiModels,
      })
      .from(aiRouteVersions)
      .innerJoin(
        aiProviderConnections,
        eq(aiProviderConnections.id, aiRouteVersions.providerConnectionId),
      )
      .innerJoin(aiModels, eq(aiModels.id, aiRouteVersions.modelId))
      .where(
        and(
          eq(aiRouteVersions.id, service.routeVersionId),
          eq(aiRouteVersions.state, 'ACTIVE'),
          eq(aiProviderConnections.enabled, true),
          eq(aiModels.available, true),
        ),
      )
      .limit(1);
    if (!row) return undefined;
    let fallback: ResolvedIntelligenceRoute['fallback'];
    if (row.route.fallbackProviderConnectionId && row.route.fallbackModelId) {
      const fallbackConnection = await this.database.db.query.aiProviderConnections.findFirst({
        where: eq(aiProviderConnections.id, row.route.fallbackProviderConnectionId),
      });
      const fallbackModel = await this.database.db.query.aiModels.findFirst({
        where: eq(aiModels.id, row.route.fallbackModelId),
      });
      if (fallbackConnection && fallbackModel)
        fallback = {
          providerKey: fallbackConnection.providerKey,
          providerConnectionId: fallbackConnection.id,
          modelId: fallbackModel.providerModelId,
        };
    }
    return {
      routeVersionId: row.route.id,
      providerKey: row.connection.providerKey,
      providerConnectionId: row.connection.id,
      modelId: row.model.providerModelId,
      ...(fallback ? { fallback } : {}),
      timeoutMs: row.route.timeoutMs,
      maximumRetries: row.route.maximumRetries,
      ...(row.route.maximumCostMicros !== null
        ? { maximumCostMicros: row.route.maximumCostMicros }
        : {}),
      explanation: Array.isArray(row.route.layers)
        ? (row.route.layers as ResolvedIntelligenceRoute['explanation'])
        : [],
    };
  }

  async getPrompt(id: string) {
    const [row] = await this.database.db
      .select({ prompt: aiPrompts, version: aiPromptVersions })
      .from(aiPromptVersions)
      .innerJoin(aiPrompts, eq(aiPrompts.id, aiPromptVersions.promptId))
      .where(and(eq(aiPromptVersions.id, id), eq(aiPromptVersions.state, 'ACTIVE')))
      .limit(1);
    if (!row) throw new Error('Approved AIOS prompt is unavailable');
    return {
      key: row.prompt.key,
      version: row.version.version,
      checksum: row.version.checksum,
      content: row.version.content,
    };
  }

  async getSchema(id: string) {
    const [row] = await this.database.db
      .select({ schema: aiOutputSchemas, version: aiOutputSchemaVersions })
      .from(aiOutputSchemaVersions)
      .innerJoin(aiOutputSchemas, eq(aiOutputSchemas.id, aiOutputSchemaVersions.schemaId))
      .where(and(eq(aiOutputSchemaVersions.id, id), eq(aiOutputSchemaVersions.state, 'ACTIVE')))
      .limit(1);
    if (!row) throw new Error('Approved AIOS schema is unavailable');
    return {
      key: row.schema.key,
      version: row.version.version,
      jsonSchema: row.version.jsonSchema,
      validate: (value: unknown) => {
        if (row.schema.key === 'CALL_SUMMARY') return SummarySchema.safeParse(value).success;
        if (row.schema.key === 'INTERACTION_ANALYSIS')
          return InteractionEvidenceSchema.safeParse(value).success;
        return false;
      },
    };
  }

  async getTaxonomy(id: string | undefined) {
    if (!id) return undefined;
    const [row] = await this.database.db
      .select({ taxonomy: aiTaxonomies, version: aiTaxonomyVersions })
      .from(aiTaxonomyVersions)
      .innerJoin(aiTaxonomies, eq(aiTaxonomies.id, aiTaxonomyVersions.taxonomyId))
      .where(and(eq(aiTaxonomyVersions.id, id), eq(aiTaxonomyVersions.state, 'ACTIVE')))
      .limit(1);
    if (!row) return undefined;
    return {
      key: row.taxonomy.key,
      version: row.version.version,
      allowedValues: Array.isArray(row.version.values)
        ? row.version.values.filter((value): value is string => typeof value === 'string')
        : [],
    };
  }

  async findReusableArtifact(
    _capability: CapabilityVersion,
    _request: ExecuteCapabilityRequest,
  ): Promise<GovernedIntelligenceArtifact | undefined> {
    // Reuse remains deliberately disabled until all freshness and policy dimensions can be proven.
    return undefined;
  }

  async persistExecution(input: {
    executionId: string;
    request: ExecuteCapabilityRequest;
    artifact: GovernedIntelligenceArtifact;
    state: 'SUCCESS' | 'FALLBACK_USED';
  }): Promise<string> {
    return this.database.db.transaction(async (tx) => {
      const [run] = await tx
        .insert(aiProcessingRuns)
        .values({
          id: input.executionId,
          capabilityVersionId: (await this.getActiveCapability(input.request.capabilityKey))!.id,
          sourceRecordId: input.request.executionContext.sourceRecordId,
          sourceRevisionId: input.request.executionContext.sourceRevisionId,
          correlationId: input.request.executionContext.correlationId,
          causationId: input.request.executionContext.causationId ?? null,
          state: input.state,
          completedAt: new Date(),
        })
        .returning();
      if (!run) throw new Error('AIOS processing run was not persisted');
      const [manifest] = await tx
        .insert(aiContextManifests)
        .values({
          processingRunId: run.id,
          policyVersionId: (await this.getActiveCapability(input.request.capabilityKey))!
            .contextPolicyVersionId,
          version: input.artifact.contextManifest.version,
          items: input.artifact.contextManifest.items.map(({ content: _content, ...item }) => item),
          excluded: input.artifact.contextManifest.excluded,
          totalTokenEstimate: input.artifact.contextManifest.totalTokenEstimate,
          checksum: createHash('sha256')
            .update(
              JSON.stringify(input.artifact.contextManifest.items.map((item) => item.checksum)),
            )
            .digest('hex'),
        })
        .returning();
      if (!manifest) throw new Error('AIOS context manifest was not persisted');
      const service = await this.getServiceVersion(
        (await this.getActiveCapability(input.request.capabilityKey))!.serviceVersionId,
      );
      const route = await this.database.db.query.aiRouteVersions.findFirst({
        where: eq(aiRouteVersions.id, input.artifact.routeVersionId),
      });
      if (!service || !route) throw new Error('Resolved AIOS governance was not found');
      const [artifact] = await tx
        .insert(aiArtifacts)
        .values({
          processingRunId: run.id,
          capabilityVersionId: run.capabilityVersionId,
          serviceVersionId: service.id,
          contextManifestId: manifest.id,
          pipelineVersionId: input.artifact.pipelineVersionId,
          routeVersionId: input.artifact.routeVersionId,
          promptVersionId: input.artifact.promptVersionId,
          schemaVersionId: input.artifact.schemaVersionId,
          taxonomyVersionId: input.artifact.taxonomyVersionId ?? null,
          providerKey: input.artifact.providerKey,
          providerRequestId: input.artifact.providerRequestId ?? null,
          modelId: route.modelId,
          resultState: input.state,
          result: input.artifact.result as Record<string, unknown>,
          intelligenceState: input.request.executionContext.intelligenceState,
          confidence:
            typeof (input.artifact.result as Record<string, unknown>)?.confidence === 'number'
              ? String((input.artifact.result as Record<string, unknown>).confidence)
              : null,
          fallbackUsed: input.state === 'FALLBACK_USED',
        })
        .returning();
      if (!artifact) throw new Error('AIOS artifact was not persisted');
      const evidenceRows = input.artifact.contextManifest.items
        .filter((item) => input.artifact.evidenceIds.includes(item.evidenceId))
        .map((item) => ({
          artifactId: artifact.id,
          evidenceId: item.evidenceId,
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          sourceVersion: item.sourceVersion,
          checksum: item.checksum,
          classification: item.classification,
        }));
      if (evidenceRows.length) await tx.insert(aiEvidenceReferences).values(evidenceRows);
      await tx.insert(aiUsageRecords).values({
        processingRunId: run.id,
        artifactId: artifact.id,
        providerConnectionId: input.artifact.providerConnectionId,
        modelId: route.modelId,
        capabilityKey: input.request.capabilityKey,
        inputTokens: input.artifact.usage.inputTokens ?? null,
        outputTokens: input.artifact.usage.outputTokens ?? null,
        cachedInputTokens: input.artifact.usage.cachedInputTokens ?? null,
        latencyMs: input.artifact.latencyMs,
        costMicros: input.artifact.usage.costMicros ?? null,
        synthetic: input.artifact.providerKey === 'SIMULATOR',
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'AIOS_ARTIFACT',
        aggregateId: artifact.id,
        eventType:
          input.state === 'FALLBACK_USED'
            ? 'AIOS_EXECUTION_COMPLETED_WITH_FALLBACK.v1'
            : 'AIOS_EXECUTION_COMPLETED.v1',
        event: {
          eventId: randomUUID(),
          schemaVersion: 1,
          correlationId: input.request.executionContext.correlationId,
          capabilityKey: input.request.capabilityKey,
          artifactId: artifact.id,
          state: input.state,
        },
      });
      return artifact.id;
    });
  }

  async persistFailure(input: {
    executionId: string;
    request: ExecuteCapabilityRequest;
    state: string;
    code: string;
    safeMessage: string;
  }): Promise<void> {
    const capability = await this.getActiveCapability(input.request.capabilityKey);
    if (!capability) return;
    await this.database.db.transaction(async (tx) => {
      await tx.insert(aiProcessingRuns).values({
        id: input.executionId,
        capabilityVersionId: capability.id,
        sourceRecordId: input.request.executionContext.sourceRecordId,
        sourceRevisionId: input.request.executionContext.sourceRevisionId,
        correlationId: input.request.executionContext.correlationId,
        causationId: input.request.executionContext.causationId ?? null,
        state: input.state as typeof aiProcessingRuns.$inferInsert.state,
        errorCode: input.code,
        safeError: input.safeMessage,
        completedAt: new Date(),
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'AIOS_EXECUTION',
        aggregateId: input.executionId,
        eventType: 'AIOS_EXECUTION_FAILED.v1',
        event: {
          eventId: randomUUID(),
          schemaVersion: 1,
          correlationId: input.request.executionContext.correlationId,
          capabilityKey: input.request.capabilityKey,
          state: input.state,
          code: input.code,
        },
      });
    });
  }

  async publish(event: AiosEventEnvelope): Promise<void> {
    await this.database.db.insert(outboxEvents).values({
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: `${event.eventType}.v${event.schemaVersion}`,
      event: event as unknown as Record<string, unknown>,
    });
  }

  private transcriptContextSource(): ContextSource {
    return {
      sourceType: 'TRANSCRIPT',
      resolve: async (sourceId, request) => {
        const [row] = await this.database.db
          .select({ turn: transcriptTurns, revision: transcriptRevisions })
          .from(transcriptTurns)
          .innerJoin(transcriptRevisions, eq(transcriptRevisions.id, transcriptTurns.revisionId))
          .where(eq(transcriptTurns.id, sourceId))
          .limit(1);
        if (!row) return { included: false, reason: 'TRANSCRIPT_TURN_NOT_FOUND' };
        if (row.revision.id !== request.executionContext.sourceRevisionId)
          return { included: false, reason: 'TRANSCRIPT_REVISION_MISMATCH' };
        return {
          included: true,
          item: {
            sourceType: 'TRANSCRIPT',
            sourceId: row.turn.id,
            sourceVersion: `${row.revision.revision}`,
            checksum: createHash('sha256').update(row.turn.content).digest('hex'),
            classification: row.turn.classification,
            verified: true,
            retrievedAt: new Date().toISOString(),
            content: `${row.turn.speaker}: ${row.turn.content}`,
            transformations:
              row.revision.revisionType === 'REDACTED' ? ['REDACTED'] : ['CANONICAL'],
          },
        };
      },
    };
  }

  private async resolveCredential(connectionId: string, providerKey: string): Promise<string> {
    const connection = await this.database.db.query.aiProviderConnections.findFirst({
      where: and(
        eq(aiProviderConnections.id, connectionId),
        eq(aiProviderConnections.enabled, true),
      ),
    });
    if (!connection?.credentialReferenceId) throw new Error('AI provider is not configured');
    const reference = await this.database.db.query.aiProviderCredentialReferences.findFirst({
      where: and(
        eq(aiProviderCredentialReferences.id, connection.credentialReferenceId),
        eq(aiProviderCredentialReferences.active, true),
      ),
    });
    if (!reference) throw new Error('AI credential reference is inactive');
    const encrypted = await this.database.db.query.encryptedProviderCredentials.findFirst({
      where: and(
        eq(encryptedProviderCredentials.secretReference, reference.secretReference),
        isNull(encryptedProviderCredentials.revokedAt),
      ),
    });
    if (!encrypted) throw new Error('AI credential is unavailable');
    return this.vault.decrypt(providerKey, encrypted);
  }

  private activeConnection(providerKey: string, environment: Environment) {
    return this.database.db.query.aiProviderConnections.findFirst({
      where: and(
        eq(aiProviderConnections.providerKey, providerKey),
        eq(aiProviderConnections.environment, environment),
        eq(aiProviderConnections.enabled, true),
        eq(aiProviderConnections.status, 'CONNECTED'),
      ),
      orderBy: [desc(aiProviderConnections.updatedAt)],
    });
  }

  private async isCapabilityProductionApproved(capabilityVersionId: string) {
    const row = await this.database.db.query.aiCapabilityVersions.findFirst({
      where: eq(aiCapabilityVersions.id, capabilityVersionId),
    });
    return row?.productionApproved === true;
  }

  private async isInvocationAllowed(caller: string, purpose: string, capabilityVersionId: string) {
    const row = await this.database.db.query.aiCapabilityVersions.findFirst({
      where: eq(aiCapabilityVersions.id, capabilityVersionId),
    });
    return (
      (row?.allowedCallers.includes(caller) ?? false) &&
      (row?.allowedPurposes.includes(purpose) ?? false)
    );
  }

  private environment(): Environment {
    const value = process.env.QP_ENVIRONMENT ?? 'development';
    return value === 'production' || value === 'staging' ? value : 'development';
  }

  private simulatorMode(): SimulatorMode {
    const value = process.env.AIOS_SIMULATOR_MODE ?? 'SUCCESS';
    const supported: SimulatorMode[] = [
      'SUCCESS',
      'AUTH_FAILURE',
      'MODEL_UNAVAILABLE',
      'MALFORMED_OUTPUT',
      'EVIDENCE_FREE',
      'FALSE_COMPLETION',
      'TIMEOUT',
      'RATE_LIMITED',
      'UNAVAILABLE',
      'PARTIAL',
    ];
    return supported.includes(value as SimulatorMode) ? (value as SimulatorMode) : 'SUCCESS';
  }

  private enforceValidationLimit(actorId: string) {
    const now = Date.now();
    const attempts = (this.validationAttempts.get(actorId) ?? []).filter(
      (attempt) => now - attempt < 60_000,
    );
    if (attempts.length >= 5) throw new Error('AI provider validation retry limit reached');
    attempts.push(now);
    this.validationAttempts.set(actorId, attempts);
  }

  private safeConnection(connection: typeof aiProviderConnections.$inferSelect) {
    return {
      id: connection.id,
      providerKey: connection.providerKey,
      connectionLabel: connection.connectionLabel,
      environment: connection.environment,
      status: connection.status,
      enabled: connection.enabled,
      region: connection.region,
      approvedDataRegion: connection.approvedDataRegion,
      organizationReference: connection.organizationReference,
      credentialReference: connection.credentialReferenceId
        ? safeCredentialReference(connection.providerKey, connection.credentialReferenceId)
        : null,
      capabilitySnapshot: connection.capabilitySnapshot,
      modelCount: connection.modelCount,
      lastVerifiedAt: connection.lastVerifiedAt,
      lastSuccessfulRequestAt: connection.lastSuccessfulRequestAt,
      lastErrorCode: connection.lastErrorCode,
      synthetic: connection.synthetic,
    };
  }
}
