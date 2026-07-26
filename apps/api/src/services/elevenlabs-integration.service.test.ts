import { describe, expect, it } from 'vitest';
import { buildDiagnosticChecks } from './elevenlabs-integration.service.js';

const baseInput = {
  hasCredential: true,
  workspaceStatus: 'SUCCESS' as const,
  defaultAgentId: 'agent-1',
  agentStatus: 'SUCCESS' as const,
  agentData: {
    conversation_config: {
      agent: { prompt: { prompt: 'You are a helpful receptionist.' }, first_message: 'Hello!' },
    },
  },
  voiceTestingEnabled: true,
  greetingOverride: null,
  webrtcTokenStatus: 'SUCCESS' as const,
  websocketSignedUrlStatus: 'SUCCESS' as const,
  voiceMode: 'WEBRTC_PREFERRED' as const,
};

function checkFor(checks: ReturnType<typeof buildDiagnosticChecks>['checks'], key: string) {
  const found = checks.find((check) => check.key === key);
  if (!found) throw new Error(`Expected a check with key "${key}"`);
  return found;
}

describe('buildDiagnosticChecks', () => {
  it('reports NOT_CONFIGURED with a single failing check when no credential is stored', () => {
    const result = buildDiagnosticChecks({
      hasCredential: false,
      workspaceStatus: 'FAILURE',
      defaultAgentId: null,
      agentStatus: 'NOT_ATTEMPTED',
      agentData: null,
      voiceTestingEnabled: false,
      greetingOverride: null,
      webrtcTokenStatus: 'NOT_ATTEMPTED',
      websocketSignedUrlStatus: 'NOT_ATTEMPTED',
      voiceMode: 'WEBSOCKET_ONLY',
    });
    expect(result.status).toBe('NOT_CONFIGURED');
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]).toMatchObject({ key: 'provider_status', status: 'FAIL' });
  });

  it('passes every check when every real provider call succeeds — overall status stays WARNING because turn_timeout is a permanent honest warning, never a fabricated PASS', () => {
    const result = buildDiagnosticChecks(baseInput);
    expect(result.status).toBe('WARNING');
    expect(checkFor(result.checks, 'provider_status').status).toBe('PASS');
    expect(checkFor(result.checks, 'agent_found').status).toBe('PASS');
    expect(checkFor(result.checks, 'llm_configured').status).toBe('PASS');
    expect(checkFor(result.checks, 'first_message_configured').status).toBe('PASS');
    expect(checkFor(result.checks, 'webrtc_available').status).toBe('PASS');
    expect(checkFor(result.checks, 'websocket_fallback').status).toBe('PASS');
    expect(checkFor(result.checks, 'fallback_policy_enabled').status).toBe('PASS');
  });

  it('agent_found fails when an agent ID is set but the real getAgent call fails — never a config-presence pass', () => {
    const result = buildDiagnosticChecks({
      ...baseInput,
      agentStatus: 'FAILURE',
      agentErrorMessage: 'agent not found',
      agentData: null,
    });
    expect(checkFor(result.checks, 'agent_found')).toMatchObject({
      status: 'FAIL',
      detail: expect.stringContaining('agent not found'),
    });
    expect(result.status).toBe('FAIL');
  });

  it('llm_configured is only a WARNING (not FAIL) when the agent is confirmed but has no readable prompt, and FAIL when no agent is confirmed at all', () => {
    const warningCase = buildDiagnosticChecks({ ...baseInput, agentData: {} });
    expect(checkFor(warningCase.checks, 'llm_configured').status).toBe('WARNING');

    const failCase = buildDiagnosticChecks({
      ...baseInput,
      agentStatus: 'FAILURE',
      agentData: null,
    });
    expect(checkFor(failCase.checks, 'llm_configured').status).toBe('FAIL');
  });

  it('a local greeting override never turns first_message_configured into a PASS — only a real provider first_message does', () => {
    const result = buildDiagnosticChecks({
      ...baseInput,
      agentData: { conversation_config: { agent: {} } },
      greetingOverride: 'Hi there, welcome!',
    });
    const check = checkFor(result.checks, 'first_message_configured');
    expect(check.status).toBe('WARNING');
    expect(check.detail).toContain('local note only');
  });

  it('webrtc_available and websocket_fallback are independent — one can pass while the other fails', () => {
    const result = buildDiagnosticChecks({
      ...baseInput,
      webrtcTokenStatus: 'FAILURE',
      webrtcErrorMessage: 'token endpoint unavailable',
      websocketSignedUrlStatus: 'SUCCESS',
    });
    expect(checkFor(result.checks, 'webrtc_available')).toMatchObject({
      status: 'FAIL',
      detail: expect.stringContaining('token endpoint unavailable'),
    });
    expect(checkFor(result.checks, 'websocket_fallback').status).toBe('PASS');
  });

  it('a passing bootstrap check is worded as reachability only, never as proof that audio works', () => {
    const result = buildDiagnosticChecks(baseInput);
    expect(checkFor(result.checks, 'webrtc_available').detail).toContain(
      'not evidence that browser audio works',
    );
    expect(checkFor(result.checks, 'websocket_fallback').detail).toContain(
      'not evidence that browser audio works',
    );
  });

  it('fallback_policy_enabled only appears when voice mode is WEBRTC_PREFERRED', () => {
    const preferred = buildDiagnosticChecks(baseInput);
    expect(preferred.checks.some((check) => check.key === 'fallback_policy_enabled')).toBe(true);

    const websocketOnly = buildDiagnosticChecks({ ...baseInput, voiceMode: 'WEBSOCKET_ONLY' });
    expect(websocketOnly.checks.some((check) => check.key === 'fallback_policy_enabled')).toBe(
      false,
    );
  });

  it('turn_timeout is always a WARNING, never fabricated as PASS — the provider API genuinely does not expose it', () => {
    const result = buildDiagnosticChecks(baseInput);
    expect(checkFor(result.checks, 'turn_timeout').status).toBe('WARNING');
  });

  it('overall status is FAIL if any check fails, else WARNING (turn_timeout keeps the best case at WARNING, never PASS)', () => {
    expect(buildDiagnosticChecks(baseInput).status).toBe('WARNING');
    expect(
      buildDiagnosticChecks({ ...baseInput, agentData: {} }).status, // llm/first_message warn too
    ).toBe('WARNING');
    expect(buildDiagnosticChecks({ ...baseInput, workspaceStatus: 'FAILURE' }).status).toBe('FAIL');
  });
});
