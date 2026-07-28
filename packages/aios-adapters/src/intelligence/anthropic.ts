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

const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Anthropic's Messages API: `x-api-key` auth, a required version header, a top-level
 * `system` string rather than a system message, and content returned as a block array.
 */
export class AnthropicAdapter implements IntelligenceProviderAdapter {
  readonly provider: IntelligenceProviderKey = 'ANTHROPIC';

  constructor(private readonly baseUrl = 'https://api.anthropic.com/v1') {}

  private headers(apiKey: string) {
    return {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
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
      `${this.baseUrl}/models?limit=100`,
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
        const record = entry as Record<string, unknown> | null;
        const id = record?.['id'];
        const displayName = record?.['display_name'];
        if (typeof id !== 'string') return null;
        return typeof displayName === 'string' ? { id, displayName } : { id };
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
    const response = await requestJson(
      `${this.baseUrl}/messages`,
      {
        method: 'POST',
        headers: this.headers(apiKey),
        body: JSON.stringify({
          model: input.submodel,
          max_tokens: input.maxOutputTokens ?? 1024,
          ...(input.system ? { system: input.system } : {}),
          ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
          messages: [{ role: 'user', content: input.prompt }],
        }),
      },
      input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    if (!response.ok) return { ok: false, error: response.error };
    if (response.status >= 400)
      return { ok: false, error: this.normaliseError(undefined, response.status, response.body) };

    const body = response.body as
      | { id?: string; content?: Array<{ type?: string; text?: unknown }>; usage?: unknown }
      | undefined;
    const text = (body?.content ?? [])
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('');
    if (!text)
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
        text,
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
      const message = messageFromBody(body, `The provider returned HTTP ${status}.`);
      // Anthropic reports an unknown model as a 404 on /models and a 400 on /messages.
      const looksLikeModelFault =
        /model/i.test(message) && /not.*(found|exist|support)/i.test(message);
      const category = looksLikeModelFault ? 'MODEL_NOT_FOUND' : categoryForStatus(status);
      return buildError(category, message, { status });
    }
    if (error instanceof Error) return buildError('UNKNOWN', error.message);
    return buildError('UNKNOWN', 'The provider request failed for an unknown reason.');
  }

  reportUsage(raw: unknown): TokenUsage | undefined {
    if (typeof raw !== 'object' || raw === null) return undefined;
    const usage = raw as Record<string, unknown>;
    const prompt = usage['input_tokens'];
    const completion = usage['output_tokens'];
    const result: TokenUsage = {};
    if (typeof prompt === 'number') result.promptTokens = prompt;
    if (typeof completion === 'number') result.completionTokens = completion;
    return result.promptTokens === undefined && result.completionTokens === undefined
      ? undefined
      : result;
  }
}
