import { createHash } from 'node:crypto';
import type { ProviderCapabilityState, Result } from '@quantum-parks/domain';
import { failure, success } from '@quantum-parks/domain';

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
export interface ProviderConversationPage {
  conversations: Array<{
    conversation_id: string;
    agent_id: string;
    status: string;
    start_time_unix_secs?: number;
    branch_id?: string | null;
    version_id?: string | null;
  }>;
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
  getConversation(conversationId: string): Promise<Result<Record<string, unknown>>>;
  listConversations(
    cursor?: string,
    startedAfterUnix?: number,
  ): Promise<Result<ProviderConversationPage>>;
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
      if (response.status === 401)
        return failure('UNAUTHORIZED', 'EL_AUTH', 'Provider authentication failed');
      if (response.status === 403)
        return failure('FORBIDDEN', 'EL_FORBIDDEN', 'Provider capability or scope is unavailable');
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

  getConversation(conversationId: string) {
    return this.request<Record<string, unknown>>(
      `/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
    );
  }

  listConversations(cursor?: string, startedAfterUnix?: number) {
    const query = new URLSearchParams({ page_size: '100', summary_mode: 'exclude' });
    if (cursor) query.set('cursor', cursor);
    if (startedAfterUnix !== undefined)
      query.set('call_start_after_unix', String(startedAfterUnix));
    return this.request<ProviderConversationPage>(`/v1/convai/conversations?${query.toString()}`);
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
