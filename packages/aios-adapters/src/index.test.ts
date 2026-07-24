import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAIIntelligenceProvider, SimulatorIntelligenceProvider } from './index.js';

const context = {
  id: 'manifest',
  version: 1 as const,
  items: [
    {
      evidenceId: 'ev_allowed',
      sourceType: 'TRANSCRIPT' as const,
      sourceId: 'turn-1',
      sourceVersion: '1',
      checksum: 'checksum',
      classification: 'CONFIDENTIAL' as const,
      verified: true,
      retrievedAt: new Date().toISOString(),
      content: 'user: What time do you open?',
      tokenEstimate: 8,
      transformations: ['REDACTED'],
    },
  ],
  totalTokenEstimate: 8,
  excluded: [],
};

afterEach(() => vi.unstubAllGlobals());

describe('AIOS provider adapters', () => {
  it('normalizes OpenAI model discovery without leaking a credential', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'configured-model', owned_by: 'provider' }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', request);
    const provider = new OpenAIIntelligenceProvider({
      resolveApiKey: async () => 'sk-private-never-returned',
    });
    const result = await provider.listModels();
    expect(result).toMatchObject({
      state: 'SUCCESS',
      data: [{ providerModelId: 'configured-model', structuredOutput: 'UNVERIFIED' }],
    });
    expect(JSON.stringify(result)).not.toContain('sk-private-never-returned');
  });

  it('parses Responses API output items and usage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: 'configured-model',
            output: [
              {
                content: [
                  {
                    type: 'output_text',
                    text: JSON.stringify({
                      purpose: { text: 'Opening hours', evidence_ids: ['ev_allowed'] },
                    }),
                  },
                ],
              },
            ],
            usage: { input_tokens: 10, output_tokens: 4 },
          }),
          { status: 200, headers: { 'x-request-id': 'req_123' } },
        ),
      ),
    );
    const provider = new OpenAIIntelligenceProvider({ resolveApiKey: async () => 'secret' });
    const result = await provider.generateStructuredOutput({
      modelId: 'configured-model',
      systemPrompt: 'Ground every claim.',
      schemaName: 'summary',
      jsonSchema: { type: 'object' },
      context,
      timeoutMs: 1_000,
    });
    expect(result).toMatchObject({
      state: 'SUCCESS',
      data: {
        providerRequestId: 'req_123',
        usage: { inputTokens: 10, outputTokens: 4 },
      },
    });
  });

  it('exposes deterministic simulator failure modes', async () => {
    const provider = new SimulatorIntelligenceProvider('RATE_LIMITED');
    const result = await provider.generateStructuredOutput({
      modelId: 'simulator-structured-v1',
      systemPrompt: 'Synthetic',
      schemaName: 'summary',
      jsonSchema: { type: 'object' },
      context,
      timeoutMs: 100,
    });
    expect(result).toEqual({
      state: 'RATE_LIMITED',
      code: 'SIMULATOR_RATE_LIMIT',
      safeMessage: 'Synthetic rate limit.',
      retryable: true,
    });
  });
});
