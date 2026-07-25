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
  encryptedProviderCredentials,
  outboxEvents,
  transcriptRevisions,
  transcriptTurns,
} from '@quantum-parks/db';
import { SummarySchema } from '@quantum-parks/intelligence';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DatabaseService } from './database.service.js';
import { AuditService } from './audit.service.js';
import { ProviderCredentialVaultService } from './provider-credential-vault.service.js';

type Environment = 'development' | 'staging' | 'production';
type ProviderInput = {
  providerKey: 'OPENAI';
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
      this.database.db.select().from(aiPromptVersions),
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
      prompts: prompts.map(({ content: _content, ...prompt }) => prompt),
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
        installedAdapters: [
          {
            key: 'OPENAI',
            label: 'OpenAI',
            support: 'SUPPORTED',
            description: 'First production-grade reference adapter.',
          },
          {
            key: 'SIMULATOR',
            label: 'Deterministic simulator',
            support: 'NON_PRODUCTION_ONLY',
            description: 'Synthetic validation adapter; never satisfies production readiness.',
          },
        ],
        unavailableAdapters: [
          'ANTHROPIC',
          'GOOGLE_GEMINI',
          'AZURE_OPENAI',
          'AWS_BEDROCK',
          'OPENAI_COMPATIBLE',
        ].map((key) => ({
          key,
          support: 'UNSUPPORTED',
          description: 'Adapter not installed.',
        })),
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

  async testProvider(input: ProviderInput, principal: Principal) {
    this.enforceValidationLimit(principal.subject);
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
      validate: (value: unknown) =>
        row.schema.key === 'CALL_SUMMARY' ? SummarySchema.safeParse(value).success : false,
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
