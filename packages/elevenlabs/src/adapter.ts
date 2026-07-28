import { createHash } from 'node:crypto';
import type { ProviderCapabilityState, Result } from '@quantum-parks/domain';
import { failure, success } from '@quantum-parks/domain';
import { z } from 'zod';

export type ProviderCapability =
  | 'agent_versioning'
  | 'knowledge_text'
  | 'knowledge_file'
  | 'knowledge_url'
  | 'voice_catalogue'
  | 'custom_voice'
  | 'agent_tests'
  | 'inbound_personalization'
  | 'webhook_tools'
  | 'post_call_webhooks'
  | 'conversation_retrieval'
  | 'native_twilio_transfer'
  | 'eu_residency'
  | 'zero_retention_mode';

export interface ProviderAgentMapping {
  agentId: string;
  branchId?: string;
  versionId?: string;
  checksum: string;
}

export interface ProviderKnowledgeMapping {
  documentId: string;
  checksum: string;
}

export interface ProviderTestRun {
  runId: string;
  repeatCount: number;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  testRuns: ProviderTestResult[];
}
export interface ProviderTestResult {
  testRunId: string;
  testInvocationId: string;
  testId: string;
  status: string;
  result?: string;
  rationale?: unknown;
}
export interface ProviderConversationSummary {
  conversationId: string;
  agentId: string;
  status: string;
  startTimeUnixSeconds?: number;
  durationSeconds?: number;
  branchId?: string | null;
  versionId?: string | null;
  direction?: string;
  initiationSource?: string;
  agentName?: string;
}

export interface ProviderConversationDetail extends ProviderConversationSummary {
  transcript: unknown[];
  metadata: Record<string, unknown>;
  analysis?: Record<string, unknown> | null;
  initiationClientData?: Record<string, unknown> | null;
  providerHasAudio: boolean;
  providerHasUserAudio: boolean;
  providerHasResponseAudio: boolean;
}

export interface ProviderConversationPage {
  conversations: ProviderConversationSummary[];
  has_more: boolean;
  next_cursor?: string | null;
}

export interface ElevenLabsPort {
  getWorkspace(): Promise<Result<{ workspaceId: string; subscription?: string }>>;
  listAgents(): Promise<Result<Array<Record<string, unknown>>>>;
  getCapabilities(): Promise<Record<ProviderCapability, ProviderCapabilityState>>;
  createAgent(configuration: Record<string, unknown>): Promise<Result<ProviderAgentMapping>>;
  getAgent(agentId: string, branchId?: string): Promise<Result<Record<string, unknown>>>;
  updateAgent(
    agentId: string,
    branchId: string | undefined,
    configuration: Record<string, unknown>,
  ): Promise<Result<ProviderAgentMapping>>;
  deployBranches(
    agentId: string,
    deployments: Array<{ branchId: string; percentage: number }>,
  ): Promise<Result<{ deploymentId: string }>>;
  createKnowledgeText(
    name: string,
    text: string,
    parentFolderId?: string,
  ): Promise<Result<ProviderKnowledgeMapping>>;
  getKnowledge(documentId: string): Promise<Result<Record<string, unknown>>>;
  listVoices(): Promise<Result<Array<Record<string, unknown>>>>;
  createTest(definition: Record<string, unknown>): Promise<Result<{ testId: string }>>;
  runTests(
    agentId: string,
    testIds: string[],
    repeatCount: number,
    branchId?: string,
  ): Promise<Result<ProviderTestRun>>;
  getTestInvocation(testInvocationId: string): Promise<Result<ProviderTestRun>>;
  getConversation(conversationId: string): Promise<Result<ProviderConversationDetail>>;
  listConversations(
    cursor?: string,
    startedAfterUnix?: number,
  ): Promise<Result<ProviderConversationPage>>;
  getSignedConversationUrl(agentId: string): Promise<Result<{ signedUrl: string }>>;
  getConversationToken(input: {
    agentId: string;
    environment?: string;
    branchId?: string;
    participantName?: string;
  }): Promise<Result<{ conversationToken: string; providerConversationId: string }>>;
}

export type SecretResolver = (reference: string) => Promise<string>;

export interface HttpAdapterOptions {
  baseUrl: string;
  apiKeyReference: string;
  workspaceId: string;
  resolveSecret: SecretResolver;
  timeoutMs?: number;
}

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

const ProviderConversationSummarySchema = z.looseObject({
  conversation_id: z.string().min(1),
  agent_id: z.string().min(1),
  status: z.string().min(1),
  start_time_unix_secs: z.number().nonnegative().optional(),
  call_duration_secs: z.number().nonnegative().optional(),
  branch_id: z.string().nullable().optional(),
  version_id: z.string().nullable().optional(),
  direction: z.string().nullable().optional(),
  conversation_initiation_source: z.string().nullable().optional(),
  agent_name: z.string().nullable().optional(),
});

const ProviderConversationPageSchema = z.looseObject({
  conversations: z.array(ProviderConversationSummarySchema),
  has_more: z.boolean(),
  next_cursor: z.string().nullable().optional(),
});

const ProviderConversationDetailSchema = ProviderConversationSummarySchema.extend({
  transcript: z.array(z.unknown()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  analysis: z.record(z.string(), z.unknown()).nullable().optional(),
  conversation_initiation_client_data: z.record(z.string(), z.unknown()).nullable().optional(),
  has_audio: z.boolean().optional(),
  has_user_audio: z.boolean().optional(),
  has_response_audio: z.boolean().optional(),
});

function mapConversationSummary(
  value: z.infer<typeof ProviderConversationSummarySchema>,
): ProviderConversationSummary {
  return {
    conversationId: value.conversation_id,
    agentId: value.agent_id,
    status: value.status,
    ...(value.start_time_unix_secs === undefined
      ? {}
      : { startTimeUnixSeconds: value.start_time_unix_secs }),
    ...(value.call_duration_secs === undefined
      ? {}
      : { durationSeconds: value.call_duration_secs }),
    ...(value.branch_id === undefined ? {} : { branchId: value.branch_id }),
    ...(value.version_id === undefined ? {} : { versionId: value.version_id }),
    ...(value.direction ? { direction: value.direction } : {}),
    ...(value.conversation_initiation_source
      ? { initiationSource: value.conversation_initiation_source }
      : {}),
    ...(value.agent_name ? { agentName: value.agent_name } : {}),
  };
}

export class HttpElevenLabsAdapter implements ElevenLabsPort {
  private readonly timeoutMs: number;
  constructor(private readonly options: HttpAdapterOptions) {
    this.timeoutMs = options.timeoutMs ?? 8_000;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<Result<T>> {
    const apiKey = await this.options.resolveSecret(this.options.apiKeyReference);
    try {
      const response = await fetch(`${this.options.baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { 'content-type': 'application/json', 'xi-api-key': apiKey, ...init.headers },
      });
      const providerRequestId = response.headers.get('request-id') ?? undefined;
      const data: unknown = await response.json().catch(() => ({}));
      if (response.ok) return success(data as T, providerRequestId);
      /*
       * ElevenLabs returns 401 — not 403 — when a valid key lacks a required permission,
       * distinguishing the two only via `detail.status === 'missing_permissions'`. Treating
       * every 401 as an authentication failure reported a correct, working key as
       * "Invalid API key" and gave the operator nothing to act on. The provider's own
       * message names the missing permission, so it is surfaced verbatim.
       */
      if (response.status === 401 || response.status === 403) {
        const detail = (data as { detail?: unknown })?.detail;
        const record =
          typeof detail === 'object' && detail !== null ? (detail as Record<string, unknown>) : {};
        const providerStatus = record['status'];
        const providerMessage = record['message'];
        if (providerStatus === 'missing_permissions')
          return failure(
            'FORBIDDEN',
            'EL_MISSING_PERMISSION',
            typeof providerMessage === 'string'
              ? providerMessage
              : 'The API key is missing a permission required for this operation',
          );
        if (response.status === 403)
          return failure(
            'FORBIDDEN',
            'EL_FORBIDDEN',
            'Provider capability or scope is unavailable',
          );
        return failure('UNAUTHORIZED', 'EL_AUTH', 'Provider authentication failed');
      }
      if (response.status === 404)
        return failure('NOT_FOUND', 'EL_NOT_FOUND', 'Provider object was not found');
      if (response.status === 409)
        return failure('CONFLICT', 'EL_CONFLICT', 'Provider state conflicts with this request');
      if (response.status === 429)
        return failure('RATE_LIMITED', 'EL_RATE_LIMIT', 'Provider rate limit reached', true);
      if (response.status >= 500)
        return failure(
          'UNAVAILABLE',
          'EL_UNAVAILABLE',
          'Provider is temporarily unavailable',
          true,
        );
      return failure('PROVIDER_ERROR', 'EL_ERROR', 'Provider rejected the request');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        return failure('TIMEOUT', 'EL_TIMEOUT', 'Provider request timed out', true);
      }
      return failure('UNAVAILABLE', 'EL_NETWORK', 'Provider connection is unavailable', true);
    }
  }

  async getWorkspace(): Promise<Result<{ workspaceId: string; subscription?: string }>> {
    const result = await this.request<{
      workspaceId?: string;
      user_id?: string;
      subscription?: string | { tier?: string };
    }>('/v1/user');
    if (result.status !== 'SUCCESS') return result;
    const workspaceId = result.data.workspaceId ?? result.data.user_id;
    if (!workspaceId)
      return failure(
        'PROVIDER_ERROR',
        'EL_WORKSPACE_ID_MISSING',
        'Provider identity response did not include an identifier',
      );
    const subscription =
      typeof result.data.subscription === 'string'
        ? result.data.subscription
        : result.data.subscription?.tier;
    return success(
      {
        workspaceId,
        ...(subscription ? { subscription } : {}),
      },
      result.requestId,
    );
  }

  async listAgents(): Promise<Result<Array<Record<string, unknown>>>> {
    const result = await this.request<{ agents: Array<Record<string, unknown>> }>(
      '/v1/convai/agents?page_size=100',
    );
    if (result.status !== 'SUCCESS') return result;
    return success(result.data.agents, result.requestId);
  }

  async getCapabilities(): Promise<Record<ProviderCapability, ProviderCapabilityState>> {
    const workspace = await this.getWorkspace();
    const baseState: ProviderCapabilityState =
      workspace.status === 'SUCCESS' ? 'SUPPORTED' : 'TEMPORARILY_UNAVAILABLE';
    return {
      agent_versioning: baseState,
      knowledge_text: baseState,
      knowledge_file: baseState,
      knowledge_url: baseState,
      voice_catalogue: baseState,
      custom_voice: 'ACCOUNT_RESTRICTED',
      agent_tests: baseState,
      inbound_personalization: baseState,
      webhook_tools: baseState,
      post_call_webhooks: baseState,
      conversation_retrieval: baseState,
      native_twilio_transfer: 'NOT_CONFIGURED',
      eu_residency: this.options.baseUrl.includes('.eu.') ? baseState : 'NOT_CONFIGURED',
      zero_retention_mode: 'ACCOUNT_RESTRICTED',
    };
  }

  async createAgent(configuration: Record<string, unknown>): Promise<Result<ProviderAgentMapping>> {
    const result = await this.request<{
      agent_id: string;
      branch_id?: string;
      version_id?: string;
    }>('/v1/convai/agents/create', { method: 'POST', body: JSON.stringify(configuration) });
    if (result.status !== 'SUCCESS') return result;
    return success({
      agentId: result.data.agent_id,
      ...(result.data.branch_id ? { branchId: result.data.branch_id } : {}),
      ...(result.data.version_id ? { versionId: result.data.version_id } : {}),
      checksum: checksum(configuration),
    });
  }

  getAgent(agentId: string, branchId?: string) {
    const query = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
    return this.request<Record<string, unknown>>(
      `/v1/convai/agents/${encodeURIComponent(agentId)}${query}`,
    );
  }

  async updateAgent(
    agentId: string,
    branchId: string | undefined,
    configuration: Record<string, unknown>,
  ): Promise<Result<ProviderAgentMapping>> {
    const query = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
    const result = await this.request<{
      agent_id?: string;
      branch_id?: string;
      version_id?: string;
    }>(`/v1/convai/agents/${encodeURIComponent(agentId)}${query}`, {
      method: 'PATCH',
      body: JSON.stringify(configuration),
    });
    if (result.status !== 'SUCCESS') return result;
    const resolvedBranchId = result.data.branch_id ?? branchId;
    return success({
      agentId,
      ...(resolvedBranchId ? { branchId: resolvedBranchId } : {}),
      ...(result.data.version_id ? { versionId: result.data.version_id } : {}),
      checksum: checksum(configuration),
    });
  }

  deployBranches(agentId: string, deployments: Array<{ branchId: string; percentage: number }>) {
    return this.request<{ deploymentId: string }>(
      `/v1/convai/agents/${encodeURIComponent(agentId)}/deployments`,
      {
        method: 'POST',
        body: JSON.stringify({
          deployments: deployments.map((entry) => ({
            branch_id: entry.branchId,
            percentage: entry.percentage,
          })),
        }),
      },
    );
  }

  async createKnowledgeText(
    name: string,
    text: string,
    parentFolderId?: string,
  ): Promise<Result<ProviderKnowledgeMapping>> {
    const result = await this.request<{ id: string }>('/v1/convai/knowledge-base/text', {
      method: 'POST',
      body: JSON.stringify({
        name,
        text,
        ...(parentFolderId ? { parent_folder_id: parentFolderId } : {}),
      }),
    });
    if (result.status !== 'SUCCESS') return result;
    return success({
      documentId: result.data.id,
      checksum: createHash('sha256').update(text).digest('hex'),
    });
  }

  getKnowledge(documentId: string) {
    return this.request<Record<string, unknown>>(
      `/v1/convai/knowledge-base/${encodeURIComponent(documentId)}`,
    );
  }

  async listVoices(): Promise<Result<Array<Record<string, unknown>>>> {
    const result = await this.request<{ voices: Array<Record<string, unknown>> }>('/v2/voices');
    return result.status === 'SUCCESS' ? success(result.data.voices) : result;
  }

  async createTest(definition: Record<string, unknown>): Promise<Result<{ testId: string }>> {
    const result = await this.request<{ id: string }>('/v1/convai/agent-testing/create', {
      method: 'POST',
      body: JSON.stringify(definition),
    });
    return result.status === 'SUCCESS' ? success({ testId: result.data.id }) : result;
  }

  async runTests(
    agentId: string,
    testIds: string[],
    repeatCount: number,
    branchId?: string,
  ): Promise<Result<ProviderTestRun>> {
    if (!Number.isInteger(repeatCount) || repeatCount < 1 || repeatCount > 50) {
      return failure(
        'VALIDATION_FAILED',
        'TEST_REPEAT_COUNT',
        'Repeat count must be between 1 and 50',
      );
    }
    const result = await this.request<ProviderTestInvocationDto>(
      `/v1/convai/agents/${encodeURIComponent(agentId)}/run-tests`,
      {
        method: 'POST',
        body: JSON.stringify({
          tests: testIds.map((testId) => ({ test_id: testId })),
          repeat_count: repeatCount,
          branch_id: branchId ?? null,
        }),
      },
    );
    return result.status === 'SUCCESS'
      ? success(mapTestInvocation(result.data, repeatCount))
      : result;
  }

  async getTestInvocation(testInvocationId: string): Promise<Result<ProviderTestRun>> {
    const result = await this.request<ProviderTestInvocationDto>(
      `/v1/convai/test-invocations/${encodeURIComponent(testInvocationId)}`,
    );
    return result.status === 'SUCCESS'
      ? success(mapTestInvocation(result.data, result.data.repeat_count ?? 1))
      : result;
  }

  async getConversation(conversationId: string): Promise<Result<ProviderConversationDetail>> {
    const result = await this.request<unknown>(
      `/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
    );
    if (result.status !== 'SUCCESS') return result;
    const parsed = ProviderConversationDetailSchema.safeParse(result.data);
    if (!parsed.success)
      return failure(
        'PROVIDER_ERROR',
        'EL_CONVERSATION_SCHEMA',
        'Provider conversation response did not match the supported schema',
      );
    return success(
      {
        ...mapConversationSummary(parsed.data),
        transcript: parsed.data.transcript,
        metadata: parsed.data.metadata,
        ...(parsed.data.analysis === undefined ? {} : { analysis: parsed.data.analysis }),
        ...(parsed.data.conversation_initiation_client_data === undefined
          ? {}
          : { initiationClientData: parsed.data.conversation_initiation_client_data }),
        providerHasAudio: parsed.data.has_audio ?? false,
        providerHasUserAudio: parsed.data.has_user_audio ?? false,
        providerHasResponseAudio: parsed.data.has_response_audio ?? false,
      },
      result.requestId,
    );
  }

  async listConversations(
    cursor?: string,
    startedAfterUnix?: number,
  ): Promise<Result<ProviderConversationPage>> {
    const query = new URLSearchParams({ page_size: '100', summary_mode: 'exclude' });
    if (cursor) query.set('cursor', cursor);
    if (startedAfterUnix !== undefined)
      query.set('call_start_after_unix', String(startedAfterUnix));
    const result = await this.request<unknown>(`/v1/convai/conversations?${query.toString()}`);
    if (result.status !== 'SUCCESS') return result;
    const parsed = ProviderConversationPageSchema.safeParse(result.data);
    if (!parsed.success)
      return failure(
        'PROVIDER_ERROR',
        'EL_CONVERSATION_LIST_SCHEMA',
        'Provider conversation list response did not match the supported schema',
      );
    return success(
      {
        conversations: parsed.data.conversations.map(mapConversationSummary),
        has_more: parsed.data.has_more,
        ...(parsed.data.next_cursor === undefined ? {} : { next_cursor: parsed.data.next_cursor }),
      },
      result.requestId,
    );
  }

  async getSignedConversationUrl(agentId: string): Promise<Result<{ signedUrl: string }>> {
    const result = await this.request<{ signed_url: string }>(
      `/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    );
    if (result.status !== 'SUCCESS') return result;
    return success({ signedUrl: result.data.signed_url }, result.requestId);
  }

  async getConversationToken(input: {
    agentId: string;
    environment?: string;
    branchId?: string;
    participantName?: string;
  }): Promise<Result<{ conversationToken: string; providerConversationId: string }>> {
    const query = new URLSearchParams({ agent_id: input.agentId });
    if (input.branchId) query.set('branch_id', input.branchId);
    if (input.environment) query.set('environment', input.environment);
    if (input.participantName) query.set('participant_name', input.participantName);
    const result = await this.request<{ token: string; conversation_id: string }>(
      `/v1/convai/conversation/token?${query.toString()}`,
    );
    if (result.status !== 'SUCCESS') return result;
    return success(
      { conversationToken: result.data.token, providerConversationId: result.data.conversation_id },
      result.requestId,
    );
  }
}

interface ProviderTestInvocationDto {
  id: string;
  repeat_count?: number;
  bucketing_status?: string | null;
  test_runs?: Array<{
    test_run_id?: string;
    test_invocation_id?: string;
    test_id?: string;
    status?: string;
    condition_result?: { result?: string; rationale?: unknown } | null;
  }>;
}

function mapTestInvocation(dto: ProviderTestInvocationDto, repeatCount: number): ProviderTestRun {
  const testRuns = (dto.test_runs ?? []).map((run) => ({
    testRunId: run.test_run_id ?? '',
    testInvocationId: run.test_invocation_id ?? dto.id,
    testId: run.test_id ?? '',
    status: run.status ?? 'pending',
    ...(run.condition_result?.result ? { result: run.condition_result.result } : {}),
    ...(run.condition_result?.rationale ? { rationale: run.condition_result.rationale } : {}),
  }));
  const statuses = testRuns.map((run) => run.status.toLowerCase());
  const hasFailed = statuses.some((status) => ['failed', 'error'].includes(status));
  const allTerminal =
    testRuns.length > 0 &&
    statuses.every((status) => ['completed', 'passed', 'failed', 'error'].includes(status));
  return {
    runId: dto.id,
    repeatCount,
    status: hasFailed ? 'FAILED' : allTerminal ? 'COMPLETED' : 'PENDING',
    testRuns,
  };
}

export function canonicalProviderChecksum(value: unknown): string {
  const canonicalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(canonicalize);
    if (candidate && typeof candidate === 'object') {
      return Object.fromEntries(
        Object.entries(candidate)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, canonicalize(entry)]),
      );
    }
    return candidate;
  };
  return checksum(canonicalize(value));
}

/**
 * Converts the code-owned receptionist configuration into the narrow provider DTO that
 * Quantum Parks owns. ElevenLabs may add model, voice and UI defaults around these
 * fields; those provider-owned values are deliberately not copied into local state.
 */
export function toElevenLabsAgentConfiguration(
  configuration: Record<string, unknown>,
): Record<string, unknown> {
  const text = (key: string) =>
    typeof configuration[key] === 'string' ? (configuration[key] as string).trim() : '';
  const list = (key: string) =>
    Array.isArray(configuration[key])
      ? (configuration[key] as unknown[]).filter(
          (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
        )
      : [];

  const prompt = [
    text('systemPrompt'),
    text('businessInstructions') ? `Business instructions:\n${text('businessInstructions')}` : '',
    text('disclosure') ? `Required disclosure:\n${text('disclosure')}` : '',
    list('policyFragments').length
      ? `Mandatory policies:\n${list('policyFragments')
          .map((entry) => `- ${entry}`)
          .join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const agent: Record<string, unknown> = {};
  if (prompt) agent.prompt = { prompt };
  if (text('firstMessage')) agent.first_message = text('firstMessage');
  if (text('defaultLanguage')) agent.language = text('defaultLanguage');

  return { conversation_config: { agent } };
}

/**
 * Projects a provider read-back onto the exact shape Quantum Parks published. This keeps
 * checksum comparison stable when ElevenLabs returns additional provider-owned defaults.
 */
export function projectElevenLabsAgentConfiguration(
  remote: Record<string, unknown>,
  expected: Record<string, unknown>,
): Record<string, unknown> {
  const project = (candidate: unknown, shape: unknown): unknown => {
    if (!shape || typeof shape !== 'object' || Array.isArray(shape)) return candidate;
    const source =
      candidate && typeof candidate === 'object' && !Array.isArray(candidate)
        ? (candidate as Record<string, unknown>)
        : {};
    return Object.fromEntries(
      Object.entries(shape as Record<string, unknown>).map(([key, value]) => [
        key,
        project(source[key], value),
      ]),
    );
  };
  return project(remote, expected) as Record<string, unknown>;
}
