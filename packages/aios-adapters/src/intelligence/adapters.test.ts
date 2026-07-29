import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicAdapter } from './anthropic.js';
import { GeminiAdapter } from './gemini.js';
import { OpenAICompatibleAdapter } from './openai-compatible.js';
import { createIntelligenceAdapter, PROVIDER_MODEL_REGISTRY } from './registry.js';
import { INTELLIGENCE_PROVIDERS, categoryIsFallbackEligible, redactSecrets } from './contract.js';

/** Recorded provider responses — shapes taken from each provider's documented API. */
const recorded = {
  openAiModels: { data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] },
  openAiCompletion: {
    id: 'chatcmpl-abc123',
    choices: [{ message: { content: 'ok' } }],
    usage: { prompt_tokens: 11, completion_tokens: 2 },
  },
  anthropicModels: {
    data: [{ id: 'claude-sonnet-4-5', display_name: 'Claude Sonnet 4.5' }],
  },
  anthropicMessage: {
    id: 'msg_01XYZ',
    content: [{ type: 'text', text: 'ok' }],
    usage: { input_tokens: 9, output_tokens: 2 },
  },
  geminiModels: {
    models: [
      {
        name: 'models/gemini-2.0-flash',
        displayName: 'Gemini 2.0 Flash',
        supportedGenerationMethods: ['generateContent'],
      },
      // Embedding models cannot answer generateContent and must be filtered out.
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
    ],
  },
  geminiGenerate: {
    responseId: 'resp-1',
    candidates: [{ content: { parts: [{ text: 'ok' }] } }],
    usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 2 },
  },
};

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fetchMock = vi.fn(
    async () =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', ...headers },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('registry', () => {
  it('provides an adapter for every supported provider', () => {
    for (const provider of INTELLIGENCE_PROVIDERS) {
      const adapter = createIntelligenceAdapter(provider);
      expect(adapter.provider).toBe(provider);
    }
  });

  it('carries a non-empty fallback model list for every provider', () => {
    for (const provider of INTELLIGENCE_PROVIDERS) {
      expect(PROVIDER_MODEL_REGISTRY[provider].length).toBeGreaterThan(0);
    }
  });
});

describe('OpenAI-compatible adapter', () => {
  const adapter = new OpenAICompatibleAdapter('OPENAI', 'https://example.invalid/v1');

  it('discovers models from the real list shape', async () => {
    mockFetch(200, recorded.openAiModels);
    const result = await adapter.discoverModels('sk-test');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.models.map((m) => m.id)).toEqual(['gpt-4o', 'gpt-4o-mini']);
  });

  it('sends the credential as a bearer token and never in the body', async () => {
    const fetchMock = mockFetch(200, recorded.openAiCompletion);
    await adapter.execute('sk-secret', { submodel: 'gpt-4o', prompt: 'hello' });
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer sk-secret');
    expect(String((init as RequestInit).body)).not.toContain('sk-secret');
  });

  it('returns text and normalised usage from a completion', async () => {
    mockFetch(200, recorded.openAiCompletion);
    const result = await adapter.execute('sk-test', { submodel: 'gpt-4o', prompt: 'hi' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.text).toBe('ok');
      expect(result.result.providerRequestId).toBe('chatcmpl-abc123');
      expect(result.result.usage).toEqual({ promptTokens: 11, completionTokens: 2 });
    }
  });

  it('maps 401 to AUTHENTICATION', async () => {
    mockFetch(401, { error: { message: 'Incorrect API key provided' } });
    const result = await adapter.validateCredential('bad');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('AUTHENTICATION');
      expect(result.error.message).toContain('Incorrect API key');
    }
  });

  it('maps 429 to a retryable RATE_LIMIT', async () => {
    mockFetch(429, { error: { message: 'Rate limit reached' } });
    const result = await adapter.execute('sk-test', { submodel: 'gpt-4o', prompt: 'hi' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('RATE_LIMIT');
      expect(result.error.retryable).toBe(true);
      expect(result.error.fallbackEligible).toBe(true);
    }
  });

  it('reports a missing model as MODEL_NOT_FOUND', async () => {
    mockFetch(404, { error: { message: 'The model does not exist' } });
    const result = await adapter.validateModel('sk-test', 'gpt-nope');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.category).toBe('MODEL_NOT_FOUND');
  });

  it('rejects a 200 response whose body has no readable text', async () => {
    mockFetch(200, { id: 'x', choices: [] });
    const result = await adapter.execute('sk-test', { submodel: 'gpt-4o', prompt: 'hi' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.category).toBe('INVALID_RESPONSE');
  });

  it('rejects a 200 response with empty completion text', async () => {
    mockFetch(200, { id: 'x', choices: [{ message: { content: '' } }] });
    const result = await adapter.execute('sk-test', { submodel: 'gpt-4o', prompt: 'hi' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.category).toBe('INVALID_RESPONSE');
  });
});

describe('Anthropic adapter', () => {
  const adapter = new AnthropicAdapter('https://example.invalid/v1');

  it('authenticates with x-api-key and the version header', async () => {
    const fetchMock = mockFetch(200, recorded.anthropicMessage);
    await adapter.execute('sk-ant-secret', { submodel: 'claude-sonnet-4-5', prompt: 'hi' });
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-secret');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('joins text blocks and normalises Anthropic usage field names', async () => {
    mockFetch(200, recorded.anthropicMessage);
    const result = await adapter.execute('sk-ant', { submodel: 'claude-sonnet-4-5', prompt: 'hi' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.text).toBe('ok');
      expect(result.result.usage).toEqual({ promptTokens: 9, completionTokens: 2 });
    }
  });

  it('sends system prompts as a top-level field, not a message', async () => {
    const fetchMock = mockFetch(200, recorded.anthropicMessage);
    await adapter.execute('sk-ant', {
      submodel: 'claude-sonnet-4-5',
      prompt: 'hi',
      system: 'Be brief.',
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as {
      system?: string;
      messages: Array<{ role: string }>;
    };
    expect(body.system).toBe('Be brief.');
    expect(body.messages.every((m) => m.role !== 'system')).toBe(true);
  });

  it('discovers models with display names', async () => {
    mockFetch(200, recorded.anthropicModels);
    const result = await adapter.discoverModels('sk-ant');
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.models[0]).toEqual({
        id: 'claude-sonnet-4-5',
        displayName: 'Claude Sonnet 4.5',
      });
  });

  it('classifies a model-shaped 400 as MODEL_NOT_FOUND rather than INVALID_REQUEST', async () => {
    mockFetch(400, { error: { message: 'model: claude-nope not found' } });
    const result = await adapter.execute('sk-ant', { submodel: 'claude-nope', prompt: 'hi' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.category).toBe('MODEL_NOT_FOUND');
  });
});

describe('Gemini adapter', () => {
  const adapter = new GeminiAdapter('https://example.invalid/v1beta');

  it('authenticates with x-goog-api-key and keeps the key out of the URL', async () => {
    const fetchMock = mockFetch(200, recorded.geminiGenerate);
    await adapter.execute('goog-secret', { submodel: 'gemini-2.0-flash', prompt: 'hi' });
    const [url, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('goog-secret');
    expect(String(url)).not.toContain('goog-secret');
  });

  it('strips the models/ prefix and drops models that cannot generate content', async () => {
    mockFetch(200, recorded.geminiModels);
    const result = await adapter.discoverModels('goog');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.models.map((m) => m.id)).toEqual(['gemini-2.0-flash']);
    }
  });

  it('reads candidate parts and normalises Gemini usage field names', async () => {
    mockFetch(200, recorded.geminiGenerate);
    const result = await adapter.execute('goog', { submodel: 'gemini-2.0-flash', prompt: 'hi' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.text).toBe('ok');
      expect(result.result.usage).toEqual({ promptTokens: 7, completionTokens: 2 });
    }
  });

  it('treats an api-key-shaped 400 as AUTHENTICATION', async () => {
    mockFetch(400, { error: { message: 'API key not valid. Please pass a valid API key.' } });
    const result = await adapter.validateCredential('bad');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.category).toBe('AUTHENTICATION');
  });
});

describe('fallback eligibility', () => {
  it('does not burn a fallback on a malformed application request', () => {
    expect(categoryIsFallbackEligible('INVALID_REQUEST')).toBe(false);
  });

  it('allows a fallback for provider-side and transport faults', () => {
    for (const category of [
      'AUTHENTICATION',
      'RATE_LIMIT',
      'TIMEOUT',
      'NETWORK',
      'PROVIDER_ERROR',
    ] as const) {
      expect(categoryIsFallbackEligible(category)).toBe(true);
    }
  });
});

describe('transport faults', () => {
  it('reports an unreachable provider as NETWORK rather than throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    const adapter = new OpenAICompatibleAdapter('OPENAI', 'https://example.invalid/v1');
    const result = await adapter.validateCredential('sk-test');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.category).toBe('NETWORK');
  });

  it('reports a timeout honestly instead of reporting success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        throw error;
      }),
    );
    const adapter = new OpenAICompatibleAdapter('OPENAI', 'https://example.invalid/v1');
    const result = await adapter.execute('sk-test', {
      submodel: 'gpt-4o',
      prompt: 'hi',
      timeoutMs: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.category).toBe('TIMEOUT');
  });
});

describe('base URL overrides', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  /**
   * Regression: an override written as a bare host (no version segment) previously
   * produced ".../models" instead of ".../v1/models" and 404'd every call.
   */
  it('appends the version segment when a host-only override is supplied', async () => {
    process.env['ANTHROPIC_BASE_URL'] = 'https://api.anthropic.com';
    const fetchMock = mockFetch(200, recorded.anthropicModels);
    await createIntelligenceAdapter('ANTHROPIC').discoverModels('sk-ant');
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/v1/models');
  });

  it('does not double the version segment when the override already has it', async () => {
    process.env['ANTHROPIC_BASE_URL'] = 'https://api.anthropic.com/v1';
    const fetchMock = mockFetch(200, recorded.anthropicModels);
    await createIntelligenceAdapter('ANTHROPIC').discoverModels('sk-ant');
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('/v1/models');
    expect(url).not.toContain('/v1/v1');
  });

  it('preserves the compatible-mode path for a host-only Qwen override', async () => {
    process.env['QWEN_BASE_URL'] = 'https://dashscope.aliyuncs.com';
    const fetchMock = mockFetch(200, recorded.openAiModels);
    await createIntelligenceAdapter('QWEN').discoverModels('sk-qwen');
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/compatible-mode/v1/models');
  });

  it('tolerates a trailing slash', async () => {
    process.env['GEMINI_BASE_URL'] = 'https://generativelanguage.googleapis.com/';
    const fetchMock = mockFetch(200, recorded.geminiModels);
    await createIntelligenceAdapter('GEMINI').discoverModels('goog');
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('/v1beta/models');
    expect(url).not.toContain('//v1beta');
  });
});

describe('credential redaction', () => {
  it('strips a provider-echoed key from an error message', () => {
    expect(
      redactSecrets('Incorrect API key provided: sk-abcd1234wxyz. You can find...'),
    ).not.toContain('sk-abcd1234wxyz');
  });

  it('strips a partially masked key, which is still key material', () => {
    const redacted = redactSecrets('Incorrect API key provided: sk-secre******************gged.');
    expect(redacted).not.toContain('sk-secre');
    expect(redacted).not.toContain('gged');
  });

  it('strips a Google-style key', () => {
    expect(redactSecrets('API key not valid: AIzaSyD-1234567890abcdef')).not.toContain('AIzaSyD');
  });

  it('leaves an ordinary message intact', () => {
    expect(redactSecrets('The model does not exist')).toBe('The model does not exist');
  });

  it('redacts through the adapter error path, not just the helper', async () => {
    const adapter = new OpenAICompatibleAdapter('OPENAI', 'https://example.invalid/v1');
    mockFetch(401, { error: { message: 'Incorrect API key provided: sk-live-abcdef123456.' } });
    const result = await adapter.validateCredential('sk-live-abcdef123456');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).not.toContain('sk-live-abcdef123456');
  });
});
