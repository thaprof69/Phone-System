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
 * Google's Generative Language API: `x-goog-api-key` auth, model ids namespaced as
 * `models/<id>`, a `contents` request shape and `candidates[].content.parts[].text`
 * in the response.
 */
export class GeminiAdapter implements IntelligenceProviderAdapter {
  readonly provider: IntelligenceProviderKey = 'GEMINI';

  constructor(private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta') {}

  private headers(apiKey: string) {
    return {
      'x-goog-api-key': apiKey,
      'content-type': 'application/json',
    };
  }

  /** Gemini ids appear as `models/gemini-2.0-flash`; the platform stores the bare id. */
  private bareId(id: string) {
    return id.startsWith('models/') ? id.slice('models/'.length) : id;
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
      `${this.baseUrl}/models?pageSize=200`,
      { method: 'GET', headers: this.headers(apiKey) },
      timeoutMs,
    );
    if (!response.ok) return { ok: false, error: response.error };
    if (response.status >= 400)
      return { ok: false, error: this.normaliseError(undefined, response.status, response.body) };

    const models = (response.body as { models?: unknown } | undefined)?.models;
    if (!Array.isArray(models))
      return {
        ok: false,
        error: buildError('INVALID_RESPONSE', 'The provider returned an unreadable model list.'),
      };

    const discovered: DiscoveredModel[] = models
      .map((entry) => {
        const record = entry as Record<string, unknown> | null;
        const name = record?.['name'];
        const displayName = record?.['displayName'];
        const methods = record?.['supportedGenerationMethods'];
        if (typeof name !== 'string') return null;
        // Only models that can actually answer a generateContent call are selectable.
        if (Array.isArray(methods) && !methods.includes('generateContent')) return null;
        const id = this.bareId(name);
        return typeof displayName === 'string' ? { id, displayName } : { id };
      })
      .filter((entry): entry is DiscoveredModel => entry !== null);

    return { ok: true, models: discovered, discoverable: true };
  }

  async validateModel(
    apiKey: string,
    submodel: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<AdapterResult<Record<never, never>>> {
    const response = await requestJson(
      `${this.baseUrl}/models/${encodeURIComponent(this.bareId(submodel))}`,
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
      `${this.baseUrl}/models/${encodeURIComponent(this.bareId(input.submodel))}:generateContent`,
      {
        method: 'POST',
        headers: this.headers(apiKey),
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
          ...(input.system ? { systemInstruction: { parts: [{ text: input.system }] } } : {}),
          generationConfig: {
            ...(input.maxOutputTokens ? { maxOutputTokens: input.maxOutputTokens } : {}),
            ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
          },
        }),
      },
      input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    if (!response.ok) return { ok: false, error: response.error };
    if (response.status >= 400)
      return { ok: false, error: this.normaliseError(undefined, response.status, response.body) };

    const body = response.body as
      | {
          candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
          usageMetadata?: unknown;
          responseId?: string;
        }
      | undefined;
    const text = (body?.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part?.text)
      .filter((value): value is string => typeof value === 'string')
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

    const usage = this.reportUsage(body?.usageMetadata);
    const providerRequestId =
      typeof body?.responseId === 'string' ? body.responseId : response.requestId;
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
      // Google reports both a bad key and a bad project as 400 INVALID_ARGUMENT.
      const looksLikeAuth = /api[_ ]?key/i.test(message);
      const category = looksLikeAuth ? 'AUTHENTICATION' : categoryForStatus(status);
      return buildError(category, message, { status });
    }
    if (error instanceof Error) return buildError('UNKNOWN', error.message);
    return buildError('UNKNOWN', 'The provider request failed for an unknown reason.');
  }

  reportUsage(raw: unknown): TokenUsage | undefined {
    if (typeof raw !== 'object' || raw === null) return undefined;
    const usage = raw as Record<string, unknown>;
    const prompt = usage['promptTokenCount'];
    const completion = usage['candidatesTokenCount'];
    const result: TokenUsage = {};
    if (typeof prompt === 'number') result.promptTokens = prompt;
    if (typeof completion === 'number') result.completionTokens = completion;
    return result.promptTokens === undefined && result.completionTokens === undefined
      ? undefined
      : result;
  }
}
