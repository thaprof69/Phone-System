export const intelligenceCapabilityKeys = [
  'CALL_SUMMARY',
  'CALL_PURPOSE',
  'INTERACTION_ANALYSIS',
  'PRIMARY_INTENT_CLASSIFICATION',
  'SECONDARY_TOPIC_CLASSIFICATION',
  'ENTITY_EXTRACTION',
  'ADVISORY_OUTCOME_DETECTION',
  'UNRESOLVED_ITEM_DETECTION',
  'COMMITMENT_DETECTION',
  'FOLLOW_UP_DETECTION',
  'CUSTOMER_LINK_SUGGESTION',
  'BOOKING_LINK_SUGGESTION',
  'SUPPORT_LINK_SUGGESTION',
  'KNOWLEDGE_GAP_DETECTION',
  'QUALITY_EVALUATION',
  'FRUSTRATION_SIGNAL',
  'TREND_ANALYSIS',
  'TEST_EVALUATION',
  'REPORT_RECOMMENDATION',
  'REPORT_AUTHORING',
  'EMBEDDING_GENERATION',
] as const;
export type IntelligenceCapabilityKey = (typeof intelligenceCapabilityKeys)[number];

export const aiosResultStates = [
  'SUCCESS',
  'PARTIAL',
  'VALIDATION_FAILED',
  'SCHEMA_REJECTED',
  'EVIDENCE_INSUFFICIENT',
  'POLICY_REJECTED',
  'MODEL_NOT_CONFIGURED',
  'PROVIDER_NOT_CONFIGURED',
  'MODEL_NOT_AVAILABLE',
  'RATE_LIMITED',
  'TIMEOUT',
  'UNAVAILABLE',
  'COST_LIMIT_REACHED',
  'FALLBACK_USED',
  'UNKNOWN_FAILURE',
] as const;
export type AiosResultState = (typeof aiosResultStates)[number];

export type DataClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
export type AiosEnvironment = 'development' | 'staging' | 'production';
export type ContextSourceType =
  | 'TRANSCRIPT'
  | 'APPROVED_KNOWLEDGE'
  | 'TRUSTED_EVENT'
  | 'CUSTOMER_SNAPSHOT'
  | 'BOOKING_SNAPSHOT'
  | 'SUPPORT_SNAPSHOT'
  | 'RUNTIME_METADATA'
  | 'PRIOR_ARTIFACT'
  | 'AGGREGATE_FACT';

export interface AiosFailure {
  state: Exclude<AiosResultState, 'SUCCESS' | 'FALLBACK_USED'>;
  code: string;
  safeMessage: string;
  retryable: boolean;
}

export type AiosResult<T> =
  { state: 'SUCCESS' | 'FALLBACK_USED'; data: T; fallbackUsed: boolean } | AiosFailure;

export interface CapabilityDependency {
  capabilityKey: IntelligenceCapabilityKey;
  required: boolean;
  minimumVersion?: number;
  maximumStalenessSeconds?: number;
  parallelizable: boolean;
}

export interface CapabilityVersion {
  id: string;
  capabilityKey: IntelligenceCapabilityKey;
  version: number;
  serviceVersionId: string;
  contextPolicyVersionId: string;
  dependencies: CapabilityDependency[];
  allowedClassifications: DataClassification[];
  maximumContextTokens: number;
  confidenceThreshold: number;
  critical: boolean;
  state: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'ACTIVE' | 'SUPERSEDED' | 'ROLLED_BACK' | 'ARCHIVED';
}

export interface ServiceVersion {
  id: string;
  serviceKey: string;
  version: number;
  pipelineVersionId: string;
  routeVersionId: string;
  promptVersionId: string;
  schemaVersionId: string;
  taxonomyVersionId?: string;
  evaluationSuiteId?: string;
  state: CapabilityVersion['state'];
}

export interface ResolvedIntelligenceRoute {
  routeVersionId: string;
  providerKey: string;
  providerConnectionId: string;
  modelId: string;
  fallback?: {
    providerKey: string;
    providerConnectionId: string;
    modelId: string;
  };
  timeoutMs: number;
  maximumRetries: number;
  maximumCostMicros?: number;
  explanation: Array<{ layer: string; value: string; reason: string }>;
}

export interface ContextItem {
  evidenceId: string;
  sourceType: ContextSourceType;
  sourceId: string;
  sourceVersion: string;
  checksum: string;
  classification: DataClassification;
  verified: boolean;
  retrievedAt: string;
  expiresAt?: string;
  content: string;
  tokenEstimate: number;
  transformations: string[];
}

export interface ContextManifest {
  id: string;
  version: 1;
  items: ContextItem[];
  totalTokenEstimate: number;
  excluded: Array<{ sourceType: ContextSourceType; sourceId: string; reason: string }>;
}

export interface AIOSExecutionContext {
  environment: AiosEnvironment;
  callerService: string;
  actorId: string;
  purpose: string;
  correlationId: string;
  causationId?: string;
  sourceRecordId: string;
  sourceRevisionId: string;
  language?: string;
  park?: string;
  agentVersionId?: string;
}

export interface StructuredGenerationRequest {
  modelId: string;
  systemPrompt: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  context: ContextManifest;
  timeoutMs: number;
  maximumOutputTokens?: number;
}

export interface ProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  costMicros?: number;
}

export interface StructuredGenerationResult {
  output: unknown;
  providerRequestId?: string;
  providerModelVersion?: string;
  usage: ProviderUsage;
  latencyMs: number;
}

export interface ModelCapability {
  providerModelId: string;
  displayName: string;
  structuredOutput: boolean | 'UNVERIFIED';
  embeddings: boolean | 'UNVERIFIED';
  available: boolean;
  providerMetadata: Record<string, unknown>;
}

export interface IntelligenceProvider {
  readonly providerKey: string;
  testConnection(): Promise<AiosResult<{ accountId?: string; metadata: Record<string, unknown> }>>;
  listModels(): Promise<AiosResult<ModelCapability[]>>;
  generateStructuredOutput(
    request: StructuredGenerationRequest,
  ): Promise<AiosResult<StructuredGenerationResult>>;
  createEmbeddings?(request: {
    modelId: string;
    inputs: string[];
    timeoutMs: number;
  }): Promise<
    AiosResult<{ vectors: number[][]; usage: ProviderUsage; providerRequestId?: string }>
  >;
}

export interface GovernedIntelligenceArtifact {
  artifactId?: string;
  capabilityKey: IntelligenceCapabilityKey;
  capabilityVersion: number;
  serviceKey: string;
  serviceVersion: number;
  pipelineVersionId: string;
  routeVersionId: string;
  contextManifest: ContextManifest;
  providerKey: string;
  providerConnectionId: string;
  modelId: string;
  providerRequestId?: string;
  promptVersionId: string;
  schemaVersionId: string;
  taxonomyVersionId?: string;
  result: unknown;
  evidenceIds: string[];
  usage: ProviderUsage;
  latencyMs: number;
  dependencyArtifacts: Record<string, string>;
}

export interface ExecuteCapabilityRequest {
  capabilityKey: IntelligenceCapabilityKey;
  executionContext: AIOSExecutionContext;
  contextSources: Array<{ sourceType: ContextSourceType; sourceId: string }>;
}

export interface AIOSServiceGateway {
  executeCapability(
    request: ExecuteCapabilityRequest,
  ): Promise<AiosResult<GovernedIntelligenceArtifact>>;
}

export interface AiosEventEnvelope {
  eventId: string;
  schemaVersion: 1;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  causationId?: string;
  occurredAt: string;
  recordedAt: string;
  actor: { type: 'USER' | 'SYSTEM' | 'WORKFLOW'; id: string };
  purpose: string;
  classification: DataClassification;
  payload: Record<string, unknown>;
}

export interface AIOSEventBus {
  publish(event: AiosEventEnvelope): Promise<void>;
}
