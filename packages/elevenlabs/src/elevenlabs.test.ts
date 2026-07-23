import { describe, expect, it } from 'vitest';
import {
  HttpElevenLabsAdapter,
  parsePostCallWebhook,
  signWebhook,
  verifyWebhookSignature,
} from './index.js';

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
});
