import { createHash, randomUUID } from 'node:crypto';
import type {
  AiosEventEnvelope,
  AIOSEventBus,
  AiosResult,
  AIOSServiceGateway,
  CapabilityVersion,
  ContextItem,
  ContextManifest,
  ContextSourceType,
  ExecuteCapabilityRequest,
  GovernedIntelligenceArtifact,
  IntelligenceCapabilityKey,
  IntelligenceProvider,
  ResolvedIntelligenceRoute,
  ServiceVersion,
} from '@quantum-parks/aios-contracts';

export interface ContextSource {
  readonly sourceType: ContextSourceType;
  resolve(
    sourceId: string,
    request: ExecuteCapabilityRequest,
  ): Promise<
    | { included: true; item: Omit<ContextItem, 'evidenceId' | 'tokenEstimate'> }
    | { included: false; reason: string }
  >;
}

export interface AIOSGovernanceRepository {
  getActiveCapability(key: IntelligenceCapabilityKey): Promise<CapabilityVersion | undefined>;
  getServiceVersion(id: string): Promise<ServiceVersion | undefined>;
  getRoute(
    capability: CapabilityVersion,
    service: ServiceVersion,
    request: ExecuteCapabilityRequest,
  ): Promise<ResolvedIntelligenceRoute | undefined>;
  getPrompt(
    id: string,
  ): Promise<{ key: string; version: number; checksum: string; content: string }>;
  getSchema(id: string): Promise<{
    key: string;
    version: number;
    jsonSchema: Record<string, unknown>;
    validate(value: unknown): boolean;
  }>;
  getTaxonomy(id: string | undefined): Promise<
    | {
        key: string;
        version: number;
        allowedValues: string[];
      }
    | undefined
  >;
  findReusableArtifact(
    capability: CapabilityVersion,
    request: ExecuteCapabilityRequest,
  ): Promise<GovernedIntelligenceArtifact | undefined>;
  persistExecution(input: {
    executionId: string;
    request: ExecuteCapabilityRequest;
    artifact: GovernedIntelligenceArtifact;
    state: 'SUCCESS' | 'FALLBACK_USED';
  }): Promise<string>;
  persistFailure(input: {
    executionId: string;
    request: ExecuteCapabilityRequest;
    state: string;
    code: string;
    safeMessage: string;
    contextManifest?: ContextManifest;
  }): Promise<void>;
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function classificationRank(value: ContextItem['classification']): number {
  return ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'].indexOf(value);
}

export class AIOSContextBuilder {
  private readonly sources: Map<ContextSourceType, ContextSource>;

  constructor(sources: ContextSource[]) {
    this.sources = new Map(sources.map((source) => [source.sourceType, source]));
  }

  async build(
    capability: CapabilityVersion,
    request: ExecuteCapabilityRequest,
  ): Promise<AiosResult<ContextManifest>> {
    const items: ContextItem[] = [];
    const excluded: ContextManifest['excluded'] = [];
    let tokens = 0;
    for (const reference of request.contextSources) {
      const source = this.sources.get(reference.sourceType);
      if (!source) {
        excluded.push({ ...reference, reason: 'CONTEXT_SOURCE_NOT_REGISTERED' });
        continue;
      }
      const resolved = await source.resolve(reference.sourceId, request);
      if (!resolved.included) {
        excluded.push({ ...reference, reason: resolved.reason });
        continue;
      }
      if (
        !capability.allowedClassifications.includes(resolved.item.classification) ||
        classificationRank(resolved.item.classification) >
          Math.max(...capability.allowedClassifications.map(classificationRank))
      ) {
        excluded.push({ ...reference, reason: 'DATA_CLASSIFICATION_NOT_ALLOWED' });
        continue;
      }
      if (!resolved.item.verified) {
        excluded.push({ ...reference, reason: 'CONTEXT_NOT_VERIFIED' });
        continue;
      }
      if (resolved.item.expiresAt && new Date(resolved.item.expiresAt) <= new Date()) {
        excluded.push({ ...reference, reason: 'CONTEXT_EXPIRED' });
        continue;
      }
      const tokenEstimate = estimateTokens(resolved.item.content);
      if (tokens + tokenEstimate > capability.maximumContextTokens) {
        excluded.push({ ...reference, reason: 'CONTEXT_TOKEN_BUDGET_EXCEEDED' });
        continue;
      }
      tokens += tokenEstimate;
      items.push({
        ...resolved.item,
        evidenceId: `ev_${createHash('sha256')
          .update(
            `${resolved.item.sourceType}:${resolved.item.sourceId}:${resolved.item.sourceVersion}:${resolved.item.checksum}`,
          )
          .digest('hex')
          .slice(0, 24)}`,
        tokenEstimate,
      });
    }
    if (items.length === 0)
      return {
        state: 'EVIDENCE_INSUFFICIENT',
        code: 'AIOS_CONTEXT_EMPTY',
        safeMessage: 'No authorized evidence was available for this capability.',
        retryable: false,
      };
    return {
      state: 'SUCCESS',
      fallbackUsed: false,
      data: { id: randomUUID(), version: 1, items, totalTokenEstimate: tokens, excluded },
    };
  }
}

function collectEvidenceIds(value: unknown, result: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectEvidenceIds(item, result);
    return result;
  }
  if (!value || typeof value !== 'object') return result;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'evidence_ids' && Array.isArray(child)) {
      for (const id of child) if (typeof id === 'string') result.push(id);
    } else collectEvidenceIds(child, result);
  }
  return result;
}

function containsFalseCompletion(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsFalseCompletion);
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.confirmed_actions) && record.confirmed_actions.length > 0) return true;
  const forbiddenKeys = [
    'payment_received',
    'booking_changed',
    'capacity_held',
    'customer_verified',
    'message_delivered',
    'transfer_completed',
    'callback_completed',
    'task_completed',
    'account_created',
  ];
  if (forbiddenKeys.some((key) => record[key] === true)) return true;
  return Object.values(record).some(containsFalseCompletion);
}

export class AIOSEvidenceResolver {
  validate(output: unknown, manifest: ContextManifest): AiosResult<string[]> {
    const ids = [...new Set(collectEvidenceIds(output))];
    const allowed = new Set(manifest.items.map((item) => item.evidenceId));
    if (ids.length === 0 || ids.some((id) => !allowed.has(id)))
      return {
        state: 'EVIDENCE_INSUFFICIENT',
        code: 'AIOS_EVIDENCE_INVALID',
        safeMessage: 'The generated result was not grounded in authorized evidence.',
        retryable: false,
      };
    if (containsFalseCompletion(output))
      return {
        state: 'POLICY_REJECTED',
        code: 'AIOS_FALSE_COMPLETION',
        safeMessage: 'The generated result attempted to establish an untrusted business outcome.',
        retryable: false,
      };
    return { state: 'SUCCESS', fallbackUsed: false, data: ids };
  }
}

export class AIOSDependencyPlanner {
  constructor(
    private readonly repository: AIOSGovernanceRepository,
    private readonly maximumDepth = 8,
  ) {}

  async plan(root: CapabilityVersion): Promise<AiosResult<CapabilityVersion[]>> {
    const ordered: CapabilityVersion[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = async (
      capability: CapabilityVersion,
      depth: number,
    ): Promise<AiosResult<true>> => {
      if (depth > this.maximumDepth)
        return {
          state: 'POLICY_REJECTED',
          code: 'AIOS_DEPENDENCY_DEPTH',
          safeMessage: 'The capability dependency graph exceeds the approved depth.',
          retryable: false,
        };
      if (visiting.has(capability.capabilityKey))
        return {
          state: 'POLICY_REJECTED',
          code: 'AIOS_DEPENDENCY_CYCLE',
          safeMessage: 'The capability dependency graph contains a cycle.',
          retryable: false,
        };
      if (visited.has(capability.capabilityKey))
        return { state: 'SUCCESS', fallbackUsed: false, data: true };
      visiting.add(capability.capabilityKey);
      for (const dependency of capability.dependencies) {
        const resolved = await this.repository.getActiveCapability(dependency.capabilityKey);
        if (!resolved) {
          if (dependency.required)
            return {
              state: 'MODEL_NOT_CONFIGURED',
              code: 'AIOS_DEPENDENCY_MISSING',
              safeMessage: `Required capability ${dependency.capabilityKey} is not active.`,
              retryable: false,
            };
          continue;
        }
        const result = await visit(resolved, depth + 1);
        if (result.state !== 'SUCCESS' && result.state !== 'FALLBACK_USED') return result;
      }
      visiting.delete(capability.capabilityKey);
      visited.add(capability.capabilityKey);
      ordered.push(capability);
      return { state: 'SUCCESS', fallbackUsed: false, data: true };
    };
    const result = await visit(root, 0);
    return 'code' in result
      ? {
          state: result.state,
          code: result.code,
          safeMessage: result.safeMessage,
          retryable: result.retryable,
        }
      : { state: 'SUCCESS', fallbackUsed: false, data: ordered };
  }
}

export class AIOSOrchestrator implements AIOSServiceGateway {
  private readonly providers: Map<string, IntelligenceProvider>;
  private readonly evidence = new AIOSEvidenceResolver();
  private readonly planner: AIOSDependencyPlanner;

  constructor(
    private readonly repository: AIOSGovernanceRepository,
    private readonly contextBuilder: AIOSContextBuilder,
    providers: IntelligenceProvider[],
    private readonly events: AIOSEventBus,
  ) {
    this.providers = new Map(providers.map((provider) => [provider.providerKey, provider]));
    this.planner = new AIOSDependencyPlanner(repository);
  }

  async executeCapability(
    request: ExecuteCapabilityRequest,
  ): Promise<AiosResult<GovernedIntelligenceArtifact>> {
    const executionId = randomUUID();
    const capability = await this.repository.getActiveCapability(request.capabilityKey);
    if (!capability)
      return {
        state: 'MODEL_NOT_CONFIGURED',
        code: 'AIOS_CAPABILITY_NOT_ACTIVE',
        safeMessage: 'The requested AI capability is not active.',
        retryable: false,
      };
    const dependencyPlan = await this.planner.plan(capability);
    if ('code' in dependencyPlan)
      return {
        state: dependencyPlan.state,
        code: dependencyPlan.code,
        safeMessage: dependencyPlan.safeMessage,
        retryable: dependencyPlan.retryable,
      };
    const reusable = await this.repository.findReusableArtifact(capability, request);
    if (reusable) return { state: 'SUCCESS', fallbackUsed: false, data: reusable };
    const service = await this.repository.getServiceVersion(capability.serviceVersionId);
    if (!service || service.state !== 'ACTIVE')
      return {
        state: 'MODEL_NOT_CONFIGURED',
        code: 'AIOS_SERVICE_NOT_ACTIVE',
        safeMessage: 'The AIOS service for this capability is not active.',
        retryable: false,
      };
    const contextResult = await this.contextBuilder.build(capability, request);
    if ('code' in contextResult)
      return {
        state: contextResult.state,
        code: contextResult.code,
        safeMessage: contextResult.safeMessage,
        retryable: contextResult.retryable,
      };
    const route = await this.repository.getRoute(capability, service, request);
    if (!route)
      return {
        state: 'MODEL_NOT_CONFIGURED',
        code: 'AIOS_ROUTE_MISSING',
        safeMessage: 'No approved route exists for this AI capability.',
        retryable: false,
      };
    const [prompt, schema, taxonomy] = await Promise.all([
      this.repository.getPrompt(service.promptVersionId),
      this.repository.getSchema(service.schemaVersionId),
      this.repository.getTaxonomy(service.taxonomyVersionId),
    ]);
    const startedEvent = this.event('AIOSExecutionStarted', executionId, request, {
      capabilityKey: request.capabilityKey,
      capabilityVersion: capability.version,
    });
    await this.events.publish(startedEvent);
    const primary = this.providers.get(route.providerKey);
    if (!primary)
      return {
        state: 'PROVIDER_NOT_CONFIGURED',
        code: 'AIOS_PROVIDER_NOT_REGISTERED',
        safeMessage: 'The selected AI provider adapter is not registered.',
        retryable: false,
      };
    const execute = (provider: IntelligenceProvider, modelId: string) =>
      provider.generateStructuredOutput({
        modelId,
        systemPrompt: prompt.content,
        schemaName: schema.key.replaceAll(/[^A-Za-z0-9_-]/g, '_'),
        jsonSchema: schema.jsonSchema,
        context: contextResult.data,
        timeoutMs: route.timeoutMs,
      });
    let generated = await execute(primary, route.modelId);
    let effectiveProvider = route.providerKey;
    let effectiveConnection = route.providerConnectionId;
    let effectiveModel = route.modelId;
    let fallbackUsed = false;
    if ('code' in generated && generated.retryable && route.fallback) {
      const fallback = this.providers.get(route.fallback.providerKey);
      if (fallback) {
        generated = await execute(fallback, route.fallback.modelId);
        effectiveProvider = route.fallback.providerKey;
        effectiveConnection = route.fallback.providerConnectionId;
        effectiveModel = route.fallback.modelId;
        fallbackUsed = generated.state === 'SUCCESS' || generated.state === 'FALLBACK_USED';
        await this.events.publish(
          this.event('AIOSFallbackUsed', executionId, request, {
            fromProvider: route.providerKey,
            toProvider: effectiveProvider,
          }),
        );
      }
    }
    if ('code' in generated) {
      await this.repository.persistFailure({
        executionId,
        request,
        state: generated.state,
        code: generated.code,
        safeMessage: generated.safeMessage,
        contextManifest: contextResult.data,
      });
      await this.events.publish(
        this.event('AIOSExecutionFailed', executionId, request, {
          state: generated.state,
          code: generated.code,
        }),
      );
      return {
        state: generated.state,
        code: generated.code,
        safeMessage: generated.safeMessage,
        retryable: generated.retryable,
      };
    }
    if (!schema.validate(generated.data.output)) {
      const failure = {
        state: 'SCHEMA_REJECTED' as const,
        code: 'AIOS_SCHEMA_REJECTED',
        safeMessage: 'The generated result did not match the approved schema.',
        retryable: false,
      };
      await this.repository.persistFailure({
        executionId,
        request,
        ...failure,
        contextManifest: contextResult.data,
      });
      return failure;
    }
    const grounded = this.evidence.validate(generated.data.output, contextResult.data);
    if ('code' in grounded) {
      await this.repository.persistFailure({
        executionId,
        request,
        state: grounded.state,
        code: grounded.code,
        safeMessage: grounded.safeMessage,
        contextManifest: contextResult.data,
      });
      return {
        state: grounded.state,
        code: grounded.code,
        safeMessage: grounded.safeMessage,
        retryable: grounded.retryable,
      };
    }
    const artifact: GovernedIntelligenceArtifact = {
      capabilityKey: capability.capabilityKey,
      capabilityVersion: capability.version,
      serviceKey: service.serviceKey,
      serviceVersion: service.version,
      pipelineVersionId: service.pipelineVersionId,
      routeVersionId: route.routeVersionId,
      contextManifest: contextResult.data,
      providerKey: effectiveProvider,
      providerConnectionId: effectiveConnection,
      modelId: effectiveModel,
      ...(generated.data.providerRequestId
        ? { providerRequestId: generated.data.providerRequestId }
        : {}),
      promptVersionId: service.promptVersionId,
      schemaVersionId: service.schemaVersionId,
      ...(service.taxonomyVersionId ? { taxonomyVersionId: service.taxonomyVersionId } : {}),
      result: generated.data.output,
      evidenceIds: grounded.data,
      usage: generated.data.usage,
      latencyMs: generated.data.latencyMs,
      dependencyArtifacts: Object.fromEntries(
        dependencyPlan.data
          .filter((item) => item.id !== capability.id)
          .map((item) => [item.capabilityKey, item.id]),
      ),
    };
    const artifactId = await this.repository.persistExecution({
      executionId,
      request,
      artifact,
      state: fallbackUsed ? 'FALLBACK_USED' : 'SUCCESS',
    });
    artifact.artifactId = artifactId;
    await this.events.publish(
      this.event(
        fallbackUsed ? 'AIOSExecutionCompletedWithFallback' : 'AIOSExecutionCompleted',
        artifactId,
        request,
        {
          capabilityKey: capability.capabilityKey,
          state: fallbackUsed ? 'FALLBACK_USED' : 'SUCCESS',
        },
      ),
    );
    return {
      state: fallbackUsed ? 'FALLBACK_USED' : 'SUCCESS',
      fallbackUsed,
      data: artifact,
    };
  }

  private event(
    eventType: string,
    aggregateId: string,
    request: ExecuteCapabilityRequest,
    payload: Record<string, unknown>,
  ): AiosEventEnvelope {
    const now = new Date().toISOString();
    return {
      eventId: randomUUID(),
      schemaVersion: 1,
      eventType,
      aggregateType: 'AIOS_EXECUTION',
      aggregateId,
      correlationId: request.executionContext.correlationId,
      ...(request.executionContext.causationId
        ? { causationId: request.executionContext.causationId }
        : {}),
      occurredAt: now,
      recordedAt: now,
      actor: { type: 'SYSTEM', id: request.executionContext.actorId },
      purpose: request.executionContext.purpose,
      classification: 'INTERNAL',
      payload,
    };
  }
}

export class HttpAIOSServiceGateway implements AIOSServiceGateway {
  constructor(
    private readonly options: {
      baseUrl: string;
      resolveServiceToken: () => Promise<string>;
      timeoutMs?: number;
    },
  ) {}

  async executeCapability(
    request: ExecuteCapabilityRequest,
  ): Promise<AiosResult<GovernedIntelligenceArtifact>> {
    try {
      const token = await this.options.resolveServiceToken();
      const response = await fetch(`${this.options.baseUrl}/v1/internal/aios/execute`, {
        method: 'POST',
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 60_000),
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
          'x-qp-purpose': request.executionContext.purpose,
        },
        body: JSON.stringify(request),
      });
      const payload = (await response.json()) as AiosResult<GovernedIntelligenceArtifact>;
      return response.ok
        ? payload
        : {
            state: 'UNAVAILABLE',
            code: 'AIOS_SERVICE_UNAVAILABLE',
            safeMessage: 'The AIOS platform service is unavailable.',
            retryable: true,
          };
    } catch {
      return {
        state: 'UNAVAILABLE',
        code: 'AIOS_SERVICE_UNAVAILABLE',
        safeMessage: 'The AIOS platform service is unavailable.',
        retryable: true,
      };
    }
  }
}
