import {
  DEFAULT_TIMEOUT_MS,
  buildError,
  categoryForStatus,
  messageFromBody,
  requestJson,
  type AdapterResult,
  type DiscoveredModel,
  type ExecuteInput,
  type ExecuteResult,
  type IntelligenceProviderAdapter,
  type IntelligenceProviderKey,
  type NormalisedError,
  type TokenUsage,
} from './contract.js';

/**
 * OpenAI, DeepSeek, Kimi (Moonshot) and Qwen (DashScope compatible mode) all expose
 * the same `/models` and `/chat/completions` wire format with bearer auth, so they
 * share one implementation and differ only in base URL and default model registry.
 */
export class OpenAICompatibleAdapter implements IntelligenceProviderAdapter {
  constructor(
    readonly provider: IntelligenceProviderKey,
    private readonly baseUrl: string,
  ) {}

  private headers(apiKey: string) {
    return {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    };
  }

  async validateCredential(
    apiKey: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<AdapterResult<Record<never, never>>> {
    const discovered = await this.discoverModels(apiKey, timeoutMs);
    if (!discovered.ok) return discovered;
    return { ok: true };
  }

  async discoverModels(
    apiKey: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<AdapterResult<{ models: DiscoveredModel[]; discoverable: boolean }>> {
    const response = await requestJson(
      `${this.baseUrl}/models`,
      { method: 'GET', headers: this.headers(apiKey) },
      timeoutMs,
    );
    if (!response.ok) return { ok: false, error: response.error };
    if (response.status >= 400)
      return { ok: false, error: this.normaliseError(undefined, response.status, response.body) };

    const data = (response.body as { data?: unknown } | undefined)?.data;
    if (!Array.isArray(data))
      return {
        ok: false,
        error: buildError('INVALID_RESPONSE', 'The provider returned an unreadable model list.'),
      };

    const models: DiscoveredModel[] = data
      .map((entry) => {
        const id = (entry as Record<string, unknown> | null)?.['id'];
        return typeof id === 'string' ? { id } : null;
      })
      .filter((entry): entry is DiscoveredModel => entry !== null);

    return { ok: true, models, discoverable: true };
  }

  async validateModel(
    apiKey: string,
    submodel: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<AdapterResult<Record<never, never>>> {
    const response = await requestJson(
      `${this.baseUrl}/models/${encodeURIComponent(submodel)}`,
      { method: 'GET', headers: this.headers(apiKey) },
      timeoutMs,
    );
    if (!response.ok) return { ok: false, error: response.error };
    if (response.status === 404)
      return {
        ok: false,
        error: buildError(
          'MODEL_NOT_FOUND',
          `The model "${submodel}" is not available for this credential.`,
          {
            status: 404,
          },
        ),
      };
    if (response.status >= 400)
      return { ok: false, error: this.normaliseError(undefined, response.status, response.body) };
    return { ok: true };
  }

  async execute(
    apiKey: string,
    input: ExecuteInput,
  ): Promise<AdapterResult<{ result: ExecuteResult }>> {
    const messages: Array<{ role: string; content: string }> = [];
    if (input.system) messages.push({ role: 'system', content: input.system });
    messages.push({ role: 'user', content: input.prompt });

    const response = await requestJson(
      `${this.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: this.headers(apiKey),
        body: JSON.stringify({
          model: input.submodel,
          messages,
          ...(input.maxOutputTokens ? { max_tokens: input.maxOutputTokens } : {}),
          ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
        }),
      },
      input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    if (!response.ok) return { ok: false, error: response.error };
    if (response.status >= 400)
      return { ok: false, error: this.normaliseError(undefined, response.status, response.body) };

    const body = response.body as
      | { id?: string; choices?: Array<{ message?: { content?: unknown } }>; usage?: unknown }
      | undefined;
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string')
      return {
        ok: false,
        error: buildError(
          'INVALID_RESPONSE',
          'The provider response did not contain readable text.',
          {
            status: response.status,
          },
        ),
      };

    const usage = this.reportUsage(body?.usage);
    const providerRequestId = typeof body?.id === 'string' ? body.id : response.requestId;
    return {
      ok: true,
      result: {
        text: content,
        ...(providerRequestId ? { providerRequestId } : {}),
        ...(usage ? { usage } : {}),
      },
    };
  }

  async healthCheck(
    apiKey: string,
    submodel: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<AdapterResult<{ result: ExecuteResult }>> {
    return this.execute(apiKey, {
      submodel,
      prompt: 'Reply with the single word: ok',
      maxOutputTokens: 16,
      temperature: 0,
      timeoutMs,
    });
  }

  normaliseError(error: unknown, status?: number, body?: unknown): NormalisedError {
    if (status !== undefined) {
      const category = categoryForStatus(status);
      const message = messageFromBody(body, `The provider returned HTTP ${status}.`);
      // A 404 from chat/completions means the model, not the endpoint.
      return buildError(category, message, { status });
    }
    if (error instanceof Error) return buildError('UNKNOWN', error.message);
    return buildError('UNKNOWN', 'The provider request failed for an unknown reason.');
  }

  reportUsage(raw: unknown): TokenUsage | undefined {
    if (typeof raw !== 'object' || raw === null) return undefined;
    const usage = raw as Record<string, unknown>;
    const prompt = usage['prompt_tokens'];
    const completion = usage['completion_tokens'];
    const result: TokenUsage = {};
    if (typeof prompt === 'number') result.promptTokens = prompt;
    if (typeof completion === 'number') result.completionTokens = completion;
    return result.promptTokens === undefined && result.completionTokens === undefined
      ? undefined
      : result;
  }
}
