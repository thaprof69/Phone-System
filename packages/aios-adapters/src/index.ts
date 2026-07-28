import type {
  AiosResult,
  IntelligenceProvider,
  ModelCapability,
  StructuredGenerationRequest,
  StructuredGenerationResult,
} from '@quantum-parks/aios-contracts';

function providerFailure(
  status: number,
  requestId?: string,
): Exclude<AiosResult<never>, { state: 'SUCCESS' | 'FALLBACK_USED' }> {
  if (status === 401 || status === 403)
    return {
      state: 'PROVIDER_NOT_CONFIGURED',
      code: 'AI_PROVIDER_AUTH',
      safeMessage: 'The AI provider credential was rejected or lacks permission.',
      retryable: false,
    };
  if (status === 404)
    return {
      state: 'MODEL_NOT_AVAILABLE',
      code: 'AI_MODEL_NOT_AVAILABLE',
      safeMessage: 'The configured model is not available to this provider connection.',
      retryable: false,
    };
  if (status === 429)
    return {
      state: 'RATE_LIMITED',
      code: 'AI_PROVIDER_RATE_LIMIT',
      safeMessage: 'The AI provider rate limit was reached.',
      retryable: true,
    };
  return {
    state: status >= 500 ? 'UNAVAILABLE' : 'UNKNOWN_FAILURE',
    code: status >= 500 ? 'AI_PROVIDER_UNAVAILABLE' : 'AI_PROVIDER_REJECTED',
    safeMessage:
      status >= 500
        ? 'The AI provider is temporarily unavailable.'
        : 'The AI provider rejected the request.',
    retryable: status >= 500,
    ...(requestId ? {} : {}),
  };
}

function extractOutputText(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const response = payload as { output?: unknown[] };
  for (const item of response.output ?? []) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as { content?: unknown[] }).content;
    for (const part of content ?? []) {
      if (
        part &&
        typeof part === 'object' &&
        (part as { type?: unknown }).type === 'output_text' &&
        typeof (part as { text?: unknown }).text === 'string'
      )
        return (part as { text: string }).text;
    }
  }
  return undefined;
}

export class OpenAIIntelligenceProvider implements IntelligenceProvider {
  readonly providerKey = 'OPENAI';
  private readonly baseUrl = 'https://api.openai.com/v1';

  constructor(
    private readonly options: {
      resolveApiKey: () => Promise<string>;
      timeoutMs?: number;
    },
  ) {}

  private async request(path: string, init: RequestInit = {}) {
    const apiKey = await this.options.resolveApiKey();
    return fetch(`${this.baseUrl}${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(this.options.timeoutMs ?? 20_000),
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        ...init.headers,
      },
    });
  }

  async testConnection(): Promise<
    AiosResult<{ accountId?: string; metadata: Record<string, unknown> }>
  > {
    const result = await this.listModels();
    if ('code' in result)
      return {
        state: result.state,
        code: result.code,
        safeMessage: result.safeMessage,
        retryable: result.retryable,
      };
    return {
      state: 'SUCCESS' as const,
      fallbackUsed: false,
      data: { metadata: { discoveredModels: result.data.length } },
    };
  }

  async listModels(): Promise<AiosResult<ModelCapability[]>> {
    try {
      const response = await this.request('/models');
      const requestId = response.headers.get('x-request-id') ?? undefined;
      if (!response.ok) return providerFailure(response.status, requestId);
      const payload = (await response.json()) as {
        data?: Array<{ id?: unknown; created?: unknown; owned_by?: unknown }>;
      };
      return {
        state: 'SUCCESS',
        fallbackUsed: false,
        data: (payload.data ?? []).flatMap((model) =>
          typeof model.id === 'string'
            ? [
                {
                  providerModelId: model.id,
                  displayName: model.id,
                  structuredOutput: 'UNVERIFIED' as const,
                  embeddings: 'UNVERIFIED' as const,
                  available: true,
                  providerMetadata: {
                    ...(typeof model.created === 'number' ? { created: model.created } : {}),
                    ...(typeof model.owned_by === 'string' ? { ownedBy: model.owned_by } : {}),
                  },
                },
              ]
            : [],
        ),
      };
    } catch (error) {
      return {
        state:
          error instanceof DOMException && error.name === 'TimeoutError'
            ? 'TIMEOUT'
            : 'UNAVAILABLE',
        code: 'AI_PROVIDER_NETWORK',
        safeMessage: 'The AI provider could not be reached.',
        retryable: true,
      };
    }
  }

  async generateStructuredOutput(
    request: StructuredGenerationRequest,
  ): Promise<AiosResult<StructuredGenerationResult>> {
    const started = Date.now();
    try {
      const response = await this.request('/responses', {
        method: 'POST',
        signal: AbortSignal.timeout(request.timeoutMs),
        body: JSON.stringify({
          model: request.modelId,
          store: false,
          input: [
            { role: 'system', content: request.systemPrompt },
            {
              role: 'user',
              content: JSON.stringify(
                request.context.items.map((item) => ({
                  evidence_id: item.evidenceId,
                  source_type: item.sourceType,
                  content: item.content,
                })),
              ),
            },
          ],
          ...(request.maximumOutputTokens
            ? { max_output_tokens: request.maximumOutputTokens }
            : {}),
          text: {
            format: {
              type: 'json_schema',
              name: request.schemaName,
              strict: true,
              schema: request.jsonSchema,
            },
          },
        }),
      });
      const providerRequestId = response.headers.get('x-request-id') ?? undefined;
      if (!response.ok) return providerFailure(response.status, providerRequestId);
      const payload = (await response.json()) as {
        model?: string;
        output?: unknown[];
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          input_tokens_details?: { cached_tokens?: number };
        };
      };
      const outputText = extractOutputText(payload);
      if (!outputText)
        return {
          state: 'VALIDATION_FAILED',
          code: 'AI_PROVIDER_EMPTY_OUTPUT',
          safeMessage: 'The AI provider returned no structured output.',
          retryable: false,
        };
      let output: unknown;
      try {
        output = JSON.parse(outputText);
      } catch {
        return {
          state: 'SCHEMA_REJECTED',
          code: 'AI_PROVIDER_MALFORMED_OUTPUT',
          safeMessage: 'The AI provider returned malformed structured output.',
          retryable: false,
        };
      }
      return {
        state: 'SUCCESS',
        fallbackUsed: false,
        data: {
          output,
          ...(providerRequestId ? { providerRequestId } : {}),
          ...(payload.model ? { providerModelVersion: payload.model } : {}),
          usage: {
            ...(payload.usage?.input_tokens !== undefined
              ? { inputTokens: payload.usage.input_tokens }
              : {}),
            ...(payload.usage?.output_tokens !== undefined
              ? { outputTokens: payload.usage.output_tokens }
              : {}),
            ...(payload.usage?.input_tokens_details?.cached_tokens !== undefined
              ? { cachedInputTokens: payload.usage.input_tokens_details.cached_tokens }
              : {}),
          },
          latencyMs: Date.now() - started,
        },
      };
    } catch (error) {
      return {
        state:
          error instanceof DOMException && error.name === 'TimeoutError'
            ? 'TIMEOUT'
            : 'UNAVAILABLE',
        code: 'AI_PROVIDER_NETWORK',
        safeMessage: 'The AI provider could not be reached.',
        retryable: true,
      };
    }
  }

  async createEmbeddings(request: { modelId: string; inputs: string[]; timeoutMs: number }) {
    try {
      const response = await this.request('/embeddings', {
        method: 'POST',
        signal: AbortSignal.timeout(request.timeoutMs),
        body: JSON.stringify({ model: request.modelId, input: request.inputs }),
      });
      const providerRequestId = response.headers.get('x-request-id') ?? undefined;
      if (!response.ok) return providerFailure(response.status, providerRequestId);
      const payload = (await response.json()) as {
        data?: Array<{ embedding?: unknown }>;
        usage?: { prompt_tokens?: number };
      };
      const vectors = (payload.data ?? []).flatMap((item) =>
        Array.isArray(item.embedding) &&
        item.embedding.every((value): value is number => typeof value === 'number')
          ? [item.embedding]
          : [],
      );
      return {
        state: 'SUCCESS' as const,
        fallbackUsed: false,
        data: {
          vectors,
          usage: {
            ...(payload.usage?.prompt_tokens !== undefined
              ? { inputTokens: payload.usage.prompt_tokens }
              : {}),
          },
          ...(providerRequestId ? { providerRequestId } : {}),
        },
      };
    } catch {
      return {
        state: 'UNAVAILABLE' as const,
        code: 'AI_PROVIDER_NETWORK',
        safeMessage: 'The AI provider could not be reached.',
        retryable: true,
      };
    }
  }
}

export type SimulatorMode =
  | 'SUCCESS'
  | 'AUTH_FAILURE'
  | 'MODEL_UNAVAILABLE'
  | 'MALFORMED_OUTPUT'
  | 'EVIDENCE_FREE'
  | 'FALSE_COMPLETION'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'PARTIAL';

export class SimulatorIntelligenceProvider implements IntelligenceProvider {
  readonly providerKey = 'SIMULATOR';
  constructor(private readonly mode: SimulatorMode = 'SUCCESS') {}

  async testConnection() {
    if (this.mode === 'AUTH_FAILURE')
      return {
        state: 'PROVIDER_NOT_CONFIGURED' as const,
        code: 'SIMULATOR_AUTH',
        safeMessage: 'Synthetic credential rejected.',
        retryable: false,
      };
    return {
      state: 'SUCCESS' as const,
      fallbackUsed: false,
      data: { accountId: 'synthetic-aios', metadata: { synthetic: true } },
    };
  }

  async listModels(): Promise<AiosResult<ModelCapability[]>> {
    return {
      state: 'SUCCESS',
      fallbackUsed: false,
      data: [
        {
          providerModelId: 'simulator-structured-v1',
          displayName: 'Deterministic structured simulator',
          structuredOutput: true,
          embeddings: false,
          available: this.mode !== 'MODEL_UNAVAILABLE',
          providerMetadata: { synthetic: true },
        },
      ],
    };
  }

  async generateStructuredOutput(
    request: StructuredGenerationRequest,
  ): Promise<AiosResult<StructuredGenerationResult>> {
    if (this.mode === 'RATE_LIMITED')
      return {
        state: 'RATE_LIMITED' as const,
        code: 'SIMULATOR_RATE_LIMIT',
        safeMessage: 'Synthetic rate limit.',
        retryable: true,
      };
    if (this.mode === 'TIMEOUT')
      return {
        state: 'TIMEOUT' as const,
        code: 'SIMULATOR_TIMEOUT',
        safeMessage: 'Synthetic timeout.',
        retryable: true,
      };
    if (this.mode === 'UNAVAILABLE')
      return {
        state: 'UNAVAILABLE' as const,
        code: 'SIMULATOR_UNAVAILABLE',
        safeMessage: 'Synthetic provider unavailable.',
        retryable: true,
      };
    if (this.mode === 'MODEL_UNAVAILABLE')
      return {
        state: 'MODEL_NOT_AVAILABLE' as const,
        code: 'SIMULATOR_MODEL_UNAVAILABLE',
        safeMessage: 'Synthetic model unavailable.',
        retryable: false,
      };
    const first = request.context.items[0];
    const evidenceIds = first ? [first.evidenceId] : [];
    const output =
      this.mode === 'MALFORMED_OUTPUT'
        ? 'not-an-object'
        : this.mode === 'EVIDENCE_FREE'
          ? request.schemaName === 'INTERACTION_ANALYSIS'
            ? { intent: 'unknown', evidence_ids: [] }
            : { purpose: { text: 'Synthetic purpose', evidence_ids: [] } }
          : this.mode === 'FALSE_COMPLETION'
            ? request.schemaName === 'INTERACTION_ANALYSIS'
              ? // The Evidence Pack schema has no field capable of representing a completed
                // business action at all — an attempted false completion is rejected as an
                // invalid shape (SCHEMA_REJECTED) rather than needing a dedicated guard.
                { intent: 'booking', evidence_ids: evidenceIds, booking_changed: true }
              : {
                  purpose: { text: 'Synthetic purpose', evidence_ids: evidenceIds },
                  confirmed_actions: [
                    {
                      text: 'Payment received',
                      result_status: 'SUCCESS',
                      evidence_ids: evidenceIds,
                    },
                  ],
                }
            : request.schemaName === 'INTERACTION_ANALYSIS'
              ? this.interactionEvidencePack(first?.content, evidenceIds)
              : {
                  purpose: {
                    text: first?.content ?? 'Synthetic call intelligence',
                    evidence_ids: evidenceIds,
                    confidence: 1,
                  },
                  caller_requests: [],
                  information_provided: [],
                  confirmed_actions: [],
                  unconfirmed_requests: [],
                  unresolved_items: [],
                  handoff: null,
                  quality_flags: ['SYNTHETIC_AI_PROVIDER'],
                  evidence_coverage: first ? 1 : 0,
                };
    if (this.mode === 'PARTIAL')
      return {
        state: 'PARTIAL',
        code: 'SIMULATOR_PARTIAL',
        safeMessage: 'Synthetic partial result.',
        retryable: false,
      };
    return {
      state: 'SUCCESS',
      fallbackUsed: false,
      data: {
        output,
        providerRequestId: 'simulator-request',
        providerModelVersion: 'simulator-structured-v1',
        usage: { inputTokens: request.context.totalTokenEstimate, outputTokens: 32 },
        latencyMs: 1,
      },
    };
  }

  /**
   * Deterministic stand-in for the `INTERACTION_ANALYSIS` capability, used only when no real
   * provider connection is configured (dev/CI). Every field is an observation grounded in the
   * real transcript content passed in, never a routing or business decision — those are computed
   * downstream by the deterministic policy/routing engines from `possible_routes`/`risk_signals`.
   */
  private interactionEvidencePack(content: string | undefined, evidenceIds: string[]) {
    const text = (content ?? '').toLowerCase();
    const riskSignal = (signal: string) => ({ text: signal, evidence_ids: evidenceIds });
    const riskSignals = [
      /complain|unhappy|angry|awful|terrible/.test(text) ? riskSignal('complaint') : null,
      /refund|money back|chargeback/.test(text) ? riskSignal('refund_request') : null,
      /hurt|unsafe|injury|accident|safety/.test(text) ? riskSignal('safety_concern') : null,
      /legal|lawyer|solicitor|sue/.test(text) ? riskSignal('legal_threat') : null,
    ].filter((item): item is { text: string; evidence_ids: string[] } => item !== null);
    const bookingIntent = /book|booking|availability|birthday|party|school group/.test(text);
    const pricingIntent = /price|pricing|cost|package/.test(text);
    const callbackIntent = /call me back|callback|phone me/.test(text);
    const intent = riskSignals.length
      ? riskSignals[0]!.text
      : bookingIntent
        ? 'booking_enquiry'
        : pricingIntent
          ? 'pricing_question'
          : callbackIntent
            ? 'callback_request'
            : 'general_enquiry';
    return {
      intent,
      entities: [],
      sentiment: riskSignals.length ? 'NEGATIVE' : 'NEUTRAL',
      urgency: riskSignals.length ? 'HIGH' : 'LOW',
      requested_actions: bookingIntent
        ? [{ text: 'check_availability', evidence_ids: evidenceIds }]
        : [],
      knowledge_requests: pricingIntent
        ? [{ text: 'approved_pricing', evidence_ids: evidenceIds }]
        : [],
      possible_routes: [
        riskSignals.length
          ? { text: 'ESCALATION_QUEUE', evidence_ids: evidenceIds }
          : bookingIntent
            ? { text: 'BOOKING_TEAM', evidence_ids: evidenceIds }
            : callbackIntent
              ? { text: 'CALLBACK_QUEUE', evidence_ids: evidenceIds }
              : { text: 'AI_RECEPTIONIST', evidence_ids: evidenceIds },
      ],
      risk_signals: riskSignals,
      confidence: content ? 0.8 : 0,
      evidence_ids: evidenceIds,
    };
  }
}

export * from './intelligence/contract.js';
export * from './intelligence/openai-compatible.js';
export * from './intelligence/anthropic.js';
export * from './intelligence/gemini.js';
export * from './intelligence/registry.js';
