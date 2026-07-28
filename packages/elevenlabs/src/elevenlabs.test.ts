import { describe, expect, it } from 'vitest';
import {
  HttpElevenLabsAdapter,
  parsePostCallWebhook,
  projectElevenLabsAgentConfiguration,
  signWebhook,
  toElevenLabsAgentConfiguration,
  verifyWebhookSignature,
} from './index.js';

describe('ElevenLabs agent configuration mapping', () => {
  it('maps the approved local fields into the official conversation_config shape', () => {
    const mapped = toElevenLabsAgentConfiguration({
      systemPrompt: 'You are the receptionist.',
      businessInstructions: 'Offer accessibility guidance.',
      disclosure: 'This call is handled by an automated assistant.',
      policyFragments: ['Never collect card data.'],
      firstMessage: 'Hello, how can I help?',
      defaultLanguage: 'en',
    });

    expect(mapped).toEqual({
      conversation_config: {
        agent: {
          prompt: {
            prompt:
              'You are the receptionist.\n\nBusiness instructions:\nOffer accessibility guidance.\n\nRequired disclosure:\nThis call is handled by an automated assistant.\n\nMandatory policies:\n- Never collect card data.',
          },
          first_message: 'Hello, how can I help?',
          language: 'en',
        },
      },
    });
  });

  it('projects provider-owned defaults out of the read-back comparison', () => {
    const expected = {
      conversation_config: {
        agent: {
          prompt: { prompt: 'Approved prompt' },
          first_message: 'Hello',
          language: 'en',
        },
      },
    };
    expect(
      projectElevenLabsAgentConfiguration(
        {
          agent_id: 'agent-1',
          conversation_config: {
            agent: {
              prompt: { prompt: 'Approved prompt', llm: 'provider-default' },
              first_message: 'Hello',
              language: 'en',
            },
            tts: { voice_id: 'provider-owned' },
          },
        },
        expected,
      ),
    ).toEqual(expected);
  });
});

describe('ElevenLabs webhook verification', () => {
  it('validates t/v0 HMAC over timestamp.rawBody', () => {
    const body = JSON.stringify({
      type: 'post_call_transcription',
      event_timestamp: 1_700_000_000,
      data: { agent_id: 'a', conversation_id: 'c', transcript: [], metadata: {} },
    });
    const signature = signWebhook(body, 'secret', 1_700_000_000);
    expect(verifyWebhookSignature(body, signature, 'secret', 1_700_000_001)).toEqual({
      valid: true,
      timestamp: 1_700_000_000,
    });
  });

  it('rejects stale signatures', () => {
    const signature = signWebhook('{}', 'secret', 1_700_000_000);
    expect(verifyWebhookSignature('{}', signature, 'secret', 1_700_001_000).reason).toBe('STALE');
  });

  it('accepts additive webhook fields', () => {
    const parsed = parsePostCallWebhook(
      JSON.stringify({
        type: 'post_call_transcription',
        event_timestamp: 1_700_000_000,
        additive: true,
        data: {
          agent_id: 'a',
          conversation_id: 'c',
          transcript: [],
          metadata: {},
          future_field: 'ok',
        },
      }),
    );
    expect(parsed.data.conversation_id).toBe('c');
  });
});

describe('ElevenLabs test adapter contract', () => {
  it('maps the official user, agent, and voice discovery responses without exposing the key', async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; key: string | null }> = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      requests.push({ url, key: headers.get('xi-api-key') });
      if (url.endsWith('/v1/user'))
        return new Response(
          JSON.stringify({
            user_id: 'user-1',
            subscription: { tier: 'enterprise' },
            xi_api_key: 'must-not-leave-adapter',
          }),
          { status: 200 },
        );
      if (url.endsWith('/v1/convai/agents?page_size=100'))
        return new Response(JSON.stringify({ agents: [{ agent_id: 'agent-1' }] }), {
          status: 200,
        });
      if (url.endsWith('/v2/voices'))
        return new Response(JSON.stringify({ voices: [{ voice_id: 'voice-1' }] }), { status: 200 });
      throw new Error(`Unexpected request ${url}`);
    };
    try {
      const adapter = new HttpElevenLabsAdapter({
        baseUrl: 'https://api.elevenlabs.test',
        apiKeyReference: 'secret/ref',
        workspaceId: 'workspace-1',
        resolveSecret: async () => 'server-only-secret',
      });
      await expect(adapter.getWorkspace()).resolves.toEqual({
        status: 'SUCCESS',
        data: { workspaceId: 'user-1', subscription: 'enterprise' },
      });
      await expect(adapter.listAgents()).resolves.toMatchObject({
        status: 'SUCCESS',
        data: [{ agent_id: 'agent-1' }],
      });
      await expect(adapter.listVoices()).resolves.toMatchObject({
        status: 'SUCCESS',
        data: [{ voice_id: 'voice-1' }],
      });
      expect(requests).toHaveLength(3);
      expect(requests.every((request) => request.key === 'server-only-secret')).toBe(true);
      expect(JSON.stringify(await adapter.getWorkspace())).not.toContain('must-not-leave-adapter');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('publishes local tests before running provider test IDs and maps invocation results', async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; body?: unknown }> = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
      if (url.endsWith('/v1/convai/agent-testing/create'))
        return new Response(JSON.stringify({ id: 'provider-test-1' }), { status: 200 });
      if (url.endsWith('/v1/convai/agents/agent-1/run-tests'))
        return new Response(
          JSON.stringify({
            id: 'invocation-1',
            repeat_count: 1,
            test_runs: [
              {
                test_run_id: 'run-1',
                test_invocation_id: 'invocation-1',
                test_id: 'provider-test-1',
                status: 'completed',
                condition_result: { result: 'success' },
              },
            ],
          }),
          { status: 200 },
        );
      throw new Error(`Unexpected request ${url}`);
    };
    try {
      const adapter = new HttpElevenLabsAdapter({
        baseUrl: 'https://api.elevenlabs.test',
        apiKeyReference: 'secret/ref',
        workspaceId: 'workspace-1',
        resolveSecret: async () => 'secret',
      });
      await expect(adapter.createTest({ type: 'llm', name: 'Greeting' })).resolves.toEqual({
        status: 'SUCCESS',
        data: { testId: 'provider-test-1' },
      });
      const run = await adapter.runTests('agent-1', ['provider-test-1'], 1);
      expect(run).toMatchObject({
        status: 'SUCCESS',
        data: {
          runId: 'invocation-1',
          status: 'COMPLETED',
          testRuns: [{ testId: 'provider-test-1', result: 'success' }],
        },
      });
      expect(requests[1]?.body).toEqual({
        tests: [{ test_id: 'provider-test-1' }],
        repeat_count: 1,
        branch_id: null,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('requests a signed conversation URL for the real live-session endpoint and never leaks the key', async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; key: string | null }> = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      requests.push({ url, key: headers.get('xi-api-key') });
      if (url.endsWith('/v1/convai/conversation/get-signed-url?agent_id=agent-1'))
        return new Response(
          JSON.stringify({ signed_url: 'wss://api.elevenlabs.test/v1/convai/conversation?x=1' }),
          { status: 200 },
        );
      throw new Error(`Unexpected request ${url}`);
    };
    try {
      const adapter = new HttpElevenLabsAdapter({
        baseUrl: 'https://api.elevenlabs.test',
        apiKeyReference: 'secret/ref',
        workspaceId: 'workspace-1',
        resolveSecret: async () => 'server-only-secret',
      });
      const result = await adapter.getSignedConversationUrl('agent-1');
      expect(result).toEqual({
        status: 'SUCCESS',
        data: { signedUrl: 'wss://api.elevenlabs.test/v1/convai/conversation?x=1' },
      });
      expect(requests).toHaveLength(1);
      expect(requests[0]?.key).toBe('server-only-secret');
      expect(JSON.stringify(result)).not.toContain('server-only-secret');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('maps a 404 from the signed-url endpoint to an honest not-found failure, never a fabricated URL', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({}), { status: 404 });
    try {
      const adapter = new HttpElevenLabsAdapter({
        baseUrl: 'https://api.elevenlabs.test',
        apiKeyReference: 'secret/ref',
        workspaceId: 'workspace-1',
        resolveSecret: async () => 'secret',
      });
      const result = await adapter.getSignedConversationUrl('missing-agent');
      expect(result).toMatchObject({ status: 'NOT_FOUND', error: { code: 'EL_NOT_FOUND' } });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('requests a real WebRTC conversation token for the live-session endpoint and never leaks the key', async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; key: string | null }> = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      requests.push({ url, key: headers.get('xi-api-key') });
      if (url.endsWith('/v1/convai/conversation/token?agent_id=agent-1&branch_id=main'))
        return new Response(
          JSON.stringify({ token: 'webrtc-token-abc', conversation_id: 'conv-1' }),
          { status: 200 },
        );
      throw new Error(`Unexpected request ${url}`);
    };
    try {
      const adapter = new HttpElevenLabsAdapter({
        baseUrl: 'https://api.elevenlabs.test',
        apiKeyReference: 'secret/ref',
        workspaceId: 'workspace-1',
        resolveSecret: async () => 'server-only-secret',
      });
      const result = await adapter.getConversationToken({ agentId: 'agent-1', branchId: 'main' });
      expect(result).toEqual({
        status: 'SUCCESS',
        data: { conversationToken: 'webrtc-token-abc', providerConversationId: 'conv-1' },
      });
      expect(requests).toHaveLength(1);
      expect(requests[0]?.key).toBe('server-only-secret');
      expect(JSON.stringify(result)).not.toContain('server-only-secret');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('maps a failure from the token endpoint to an honest failure, never a fabricated token', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({}), { status: 404 });
    try {
      const adapter = new HttpElevenLabsAdapter({
        baseUrl: 'https://api.elevenlabs.test',
        apiKeyReference: 'secret/ref',
        workspaceId: 'workspace-1',
        resolveSecret: async () => 'secret',
      });
      const result = await adapter.getConversationToken({ agentId: 'missing-agent' });
      expect(result).toMatchObject({ status: 'NOT_FOUND', error: { code: 'EL_NOT_FOUND' } });
      expect(JSON.stringify(result)).not.toContain('token');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
