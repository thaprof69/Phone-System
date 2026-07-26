'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, Link2Off, ShieldCheck } from 'lucide-react';
import { CheckboxField, Fieldset, FormActions, SelectField, TextField } from '@quantum-parks/ui';

export type ElevenLabsIntegrationStatus = {
  provider: 'ELEVENLABS';
  status:
    | 'NOT_CONFIGURED'
    | 'VALIDATING'
    | 'CONNECTED'
    | 'DEGRADED'
    | 'INVALID_CREDENTIALS'
    | 'AGENT_UNAVAILABLE'
    | 'RATE_LIMITED'
    | 'PROVIDER_UNAVAILABLE'
    | 'DISCONNECTED'
    | 'ERROR';
  integrationId?: string;
  connectionLabel?: string;
  environment?: 'SANDBOX' | 'PRODUCTION';
  workspace?: { id: string; subscription: string | null } | null;
  credentialReference?: string | null;
  defaultAgentId?: string | null;
  defaultVoiceId?: string | null;
  counts?: { agents: number; voices: number };
  capabilities?: Record<string, unknown>;
  lastVerifiedAt?: string | null;
  lastErrorCode?: string | null;
  verifiedAgentName?: string | null;
  agentVerifiedAt?: string | null;
  receptionistDisplayName?: string | null;
  greetingOverride?: string | null;
  language?: string | null;
  voiceTestingEnabled?: boolean;
  chatTestingEnabled?: boolean;
  transcriptCapture?: boolean;
  summaryGeneration?: boolean;
  escalationDetection?: boolean;
  voiceMode?: 'WEBRTC_PREFERRED' | 'WEBSOCKET_ONLY';
  productionRoutingEnabled: boolean;
};

type TestResult = {
  status: ElevenLabsIntegrationStatus['status'];
  verified: boolean;
  message?: string;
  validationProof?: string;
  workspace?: { id: string; subscription: string | null };
  counts?: { agents: number; voices: number };
  verifiedAgent?: { id: string; name: string | null };
};

type RuntimeConfig = {
  receptionistDisplayName: string;
  greetingOverride: string;
  language: string;
  voiceMode: 'WEBRTC_PREFERRED' | 'WEBSOCKET_ONLY';
  voiceTestingEnabled: boolean;
  chatTestingEnabled: boolean;
  transcriptCapture: boolean;
  summaryGeneration: boolean;
  escalationDetection: boolean;
};

function runtimeConfigFrom(status: ElevenLabsIntegrationStatus): RuntimeConfig {
  return {
    receptionistDisplayName: status.receptionistDisplayName ?? '',
    greetingOverride: status.greetingOverride ?? '',
    language: status.language ?? '',
    voiceMode: status.voiceMode ?? 'WEBRTC_PREFERRED',
    voiceTestingEnabled: status.voiceTestingEnabled ?? true,
    chatTestingEnabled: status.chatTestingEnabled ?? true,
    transcriptCapture: status.transcriptCapture ?? true,
    summaryGeneration: status.summaryGeneration ?? false,
    escalationDetection: status.escalationDetection ?? false,
  };
}

function runtimeConfigPayload(config: RuntimeConfig) {
  return {
    receptionistDisplayName: config.receptionistDisplayName.trim() || null,
    greetingOverride: config.greetingOverride.trim() || null,
    language: config.language.trim() || null,
    voiceMode: config.voiceMode,
    voiceTestingEnabled: config.voiceTestingEnabled,
    chatTestingEnabled: config.chatTestingEnabled,
    transcriptCapture: config.transcriptCapture,
    summaryGeneration: config.summaryGeneration,
    escalationDetection: config.escalationDetection,
  };
}

const endpoint = '/api/admin/integrations/elevenlabs';
const verifiedAtFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

function tone(status: ElevenLabsIntegrationStatus['status']) {
  if (status === 'CONNECTED') return 'good';
  if (status === 'DEGRADED' || status === 'VALIDATING' || status === 'RATE_LIMITED')
    return 'warning';
  if (
    status === 'INVALID_CREDENTIALS' ||
    status === 'AGENT_UNAVAILABLE' ||
    status === 'PROVIDER_UNAVAILABLE' ||
    status === 'ERROR'
  )
    return 'danger';
  return 'neutral';
}

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    cache: 'no-store',
    credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok)
    throw new Error(data.message ?? `Integration service returned ${response.status}`);
  return data;
}

const VOICE_MODE_OPTIONS = [
  { value: 'WEBRTC_PREFERRED', label: 'WebRTC preferred' },
  { value: 'WEBSOCKET_ONLY', label: 'WebSocket only' },
];

/**
 * A direct inline form — never a modal — so the operator sees the whole ElevenLabs
 * configuration and its state in one place. "Save ElevenLabs" persists only; "Save & test
 * provider" persists and then runs a real credential/agent verification before the save is
 * considered successful.
 */
export function ElevenLabsIntegrationCard({
  initialStatus,
  authorized,
}: {
  initialStatus: ElevenLabsIntegrationStatus;
  authorized: boolean;
}) {
  const [status, setStatus] = useState(initialStatus);
  const connected = status.status === 'CONNECTED' || status.status === 'DEGRADED';
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState(initialStatus.connectionLabel ?? 'Quantum Parks');
  const [environment, setEnvironment] = useState<'SANDBOX' | 'PRODUCTION'>(
    initialStatus.environment ?? 'SANDBOX',
  );
  const [defaultAgentId, setDefaultAgentId] = useState(initialStatus.defaultAgentId ?? '');
  const [defaultVoiceId, setDefaultVoiceId] = useState(initialStatus.defaultVoiceId ?? '');
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>(
    runtimeConfigFrom(initialStatus),
  );
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [busy, setBusy] = useState<'save' | 'test' | 'disconnect' | null>(null);
  const [message, setMessage] = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const readyForLiveTest = Boolean(
    status.status === 'CONNECTED' && status.defaultAgentId && status.agentVerifiedAt,
  );

  /** Persist only — no provider round trip. Requires an existing connection. */
  async function saveWithoutTesting() {
    setBusy('save');
    setMessage('');
    try {
      const updated = await request<ElevenLabsIntegrationStatus>('', 'PATCH', {
        connectionLabel: label,
        defaultAgentId: defaultAgentId || null,
        defaultVoiceId: defaultVoiceId || null,
        ...runtimeConfigPayload(runtimeConfig),
      });
      setStatus(updated);
      setMessage('Settings saved. The stored credential was not re-verified.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Settings could not be saved.');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Tests the credential (and the configured agent, if any) first, then saves only if that
   * test succeeds — never a false "saved" state for an unverified connection.
   */
  async function saveAndTest() {
    setBusy('test');
    setMessage('');
    setTestResult(null);
    try {
      if (!apiKey && connected) {
        const verified = await request<ElevenLabsIntegrationStatus & { verified: boolean }>(
          '/verify',
          'POST',
        );
        setStatus(verified);
        if (verified.verified) {
          const updated = await request<ElevenLabsIntegrationStatus>('', 'PATCH', {
            connectionLabel: label,
            defaultAgentId: defaultAgentId || null,
            defaultVoiceId: defaultVoiceId || null,
            ...runtimeConfigPayload(runtimeConfig),
          });
          setStatus(updated);
          setMessage('The stored connection is healthy and settings were saved.');
        } else {
          setMessage('The stored credential could not be verified — settings were not saved.');
        }
        return;
      }

      const tested = await request<TestResult>('/test', 'POST', {
        apiKey,
        connectionLabel: label,
        environment,
        ...(defaultAgentId ? { defaultAgentId } : {}),
      });
      setTestResult(tested);
      if (!tested.verified) {
        setMessage(tested.message ?? 'Connection validation failed.');
        return;
      }
      const saved = await request<ElevenLabsIntegrationStatus & { saved?: boolean }>(
        connected ? '/rotate' : '/connect',
        'POST',
        {
          apiKey,
          connectionLabel: label,
          environment,
          validationProof: tested.validationProof,
          ...(connected
            ? {}
            : {
                defaultAgentId: defaultAgentId || undefined,
                defaultVoiceId: defaultVoiceId || undefined,
                ...runtimeConfigPayload(runtimeConfig),
              }),
        },
      );
      setStatus(saved);
      setApiKey('');
      setMessage(
        connected
          ? 'Credential rotated and revalidated.'
          : tested.verifiedAgent
            ? `Connected and verified agent "${tested.verifiedAgent.name ?? tested.verifiedAgent.id}".`
            : 'Connection saved and verified.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Connection could not be saved.');
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy('disconnect');
    setMessage('');
    try {
      const disconnected = await request<ElevenLabsIntegrationStatus>('', 'DELETE');
      setStatus(disconnected);
      setConfirmDisconnect(false);
      setMessage(
        'Disconnected. Local agents, transcripts, releases, and audit history were preserved.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Disconnect failed.');
    } finally {
      setBusy(null);
    }
  }

  if (!authorized) {
    return (
      <section className="panel" aria-labelledby="elevenlabs-title">
        <header className="panel-header">
          <div>
            <p className="eyebrow">Managed voice runtime</p>
            <h2 id="elevenlabs-title">ElevenLabs</h2>
          </div>
        </header>
        <p className="capability-note">Administrator permission required.</p>
      </section>
    );
  }

  return (
    <section className="panel" id="elevenlabs-provider-form" aria-labelledby="elevenlabs-title">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Managed voice runtime</p>
          <h2 id="elevenlabs-title">ElevenLabs Provider</h2>
        </div>
        <span className={`status-pill status-${tone(status.status)}`}>
          {status.status.replaceAll('_', ' ')}
        </span>
      </header>

      <p className="panel-description">
        ElevenLabs gives the browser voice and chat interface. Quantum Parks keeps the business
        brain: approved configuration, business knowledge, policy, routing, escalation and audit
        evidence — never the other way round.
      </p>

      {connected ? (
        <dl className="definition-list columns-2" style={{ margin: '14px 0' }}>
          <div className="definition-item">
            <dt>Environment</dt>
            <dd>{status.environment}</dd>
          </div>
          <div className="definition-item">
            <dt>Credential</dt>
            <dd>{status.credentialReference ?? 'Protected reference'}</dd>
          </div>
          <div className="definition-item">
            <dt>Discovered</dt>
            <dd>
              {status.counts?.agents ?? 0} agents · {status.counts?.voices ?? 0} voices
            </dd>
          </div>
          <div className="definition-item">
            <dt>Configured agent</dt>
            <dd>
              {status.defaultAgentId
                ? status.agentVerifiedAt
                  ? (status.verifiedAgentName ?? 'Verified (no name reported)')
                  : 'Not yet verified'
                : 'None configured'}
            </dd>
          </div>
          <div className="definition-item">
            <dt>Last verified</dt>
            <dd>
              {status.lastVerifiedAt
                ? verifiedAtFormatter.format(new Date(status.lastVerifiedAt))
                : 'Not verified'}
            </dd>
          </div>
        </dl>
      ) : null}

      <Fieldset legend="Connection">
        <TextField
          id="el-label"
          label="Connection label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={100}
          autoComplete="off"
          required
        />
        <SelectField
          id="el-environment"
          label="Environment"
          value={environment}
          onChange={(event) => setEnvironment(event.target.value as 'SANDBOX' | 'PRODUCTION')}
          disabled={connected}
          options={[
            { value: 'SANDBOX', label: 'Sandbox' },
            { value: 'PRODUCTION', label: 'Production' },
          ]}
        />
        <TextField
          id="el-api-key"
          label={connected ? 'New API key for rotation' : 'ElevenLabs API key'}
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          minLength={8}
          maxLength={512}
          autoComplete="new-password"
          spellCheck={false}
          placeholder={connected ? 'Leave empty unless rotating' : 'sk_...'}
          hint="Stored securely on the server. Used only to validate ElevenLabs and create short-lived conversation sessions. Never exposed to the browser."
        />
      </Fieldset>

      <div
        className="form-grid"
        style={{ display: 'grid', gap: '0 20px', gridTemplateColumns: '1fr 1fr' }}
      >
        <Fieldset legend="Voice and behaviour">
          <SelectField
            id="el-voice-mode"
            label="Voice mode"
            value={runtimeConfig.voiceMode}
            onChange={(event) =>
              setRuntimeConfig((current) => ({
                ...current,
                voiceMode: event.target.value as RuntimeConfig['voiceMode'],
              }))
            }
            options={VOICE_MODE_OPTIONS}
            hint="WebRTC preferred uses a real ElevenLabs conversation token as the primary live voice path, with a real WebSocket fallback on transport-recoverable browser failures. WebSocket only uses the signed-URL path exclusively."
          />
          <TextField
            id="el-display-name"
            label="Receptionist display name"
            value={runtimeConfig.receptionistDisplayName}
            onChange={(event) =>
              setRuntimeConfig((current) => ({
                ...current,
                receptionistDisplayName: event.target.value,
              }))
            }
            maxLength={100}
          />
          <CheckboxField
            id="el-voice-testing"
            label="Enable voice test"
            checked={runtimeConfig.voiceTestingEnabled}
            onChange={(event) =>
              setRuntimeConfig((current) => ({
                ...current,
                voiceTestingEnabled: event.target.checked,
              }))
            }
            hint="Governs real voice-session authorisation in Simulation Lab — disabling this blocks Start Voice Call, not merely hides it."
          />
          <CheckboxField
            id="el-transcripts"
            label="Capture transcripts"
            checked={runtimeConfig.transcriptCapture}
            onChange={(event) =>
              setRuntimeConfig((current) => ({
                ...current,
                transcriptCapture: event.target.checked,
              }))
            }
          />
          <CheckboxField
            id="el-escalations"
            label="Detect escalations"
            checked={runtimeConfig.escalationDetection}
            onChange={(event) =>
              setRuntimeConfig((current) => ({
                ...current,
                escalationDetection: event.target.checked,
              }))
            }
          />
        </Fieldset>

        <Fieldset legend="Agent">
          <TextField
            id="el-agent-id"
            label="ElevenLabs Agent ID"
            value={defaultAgentId}
            onChange={(event) => setDefaultAgentId(event.target.value)}
            autoComplete="off"
            placeholder="agent_..."
            hint="Retrieved and verified through the real ElevenLabs API before it is saved."
          />
          <TextField
            id="el-voice-id"
            label="Default voice ID (optional)"
            value={defaultVoiceId}
            onChange={(event) => setDefaultVoiceId(event.target.value)}
            autoComplete="off"
            placeholder="voice_..."
          />
          <TextField
            id="el-language"
            label="Language"
            value={runtimeConfig.language}
            onChange={(event) =>
              setRuntimeConfig((current) => ({ ...current, language: event.target.value }))
            }
            placeholder="Use agent default"
            maxLength={20}
          />
          <TextField
            id="el-greeting"
            label="Greeting override"
            value={runtimeConfig.greetingOverride}
            onChange={(event) =>
              setRuntimeConfig((current) => ({
                ...current,
                greetingOverride: event.target.value,
              }))
            }
            placeholder="Use agent default"
            maxLength={500}
          />
          <CheckboxField
            id="el-chat-testing"
            label="Enable chat test"
            checked={runtimeConfig.chatTestingEnabled}
            onChange={(event) =>
              setRuntimeConfig((current) => ({
                ...current,
                chatTestingEnabled: event.target.checked,
              }))
            }
          />
          <CheckboxField
            id="el-summaries"
            label="Generate summaries"
            checked={runtimeConfig.summaryGeneration}
            onChange={(event) =>
              setRuntimeConfig((current) => ({
                ...current,
                summaryGeneration: event.target.checked,
              }))
            }
          />
        </Fieldset>
      </div>

      {message ? (
        <div
          className={`test-result ${testResult?.verified ? 'success' : ''}`}
          role="status"
          aria-live="polite"
        >
          {testResult?.verified ? <CheckCircle2 size={17} /> : null}
          <span>{message}</span>
        </div>
      ) : null}

      {confirmDisconnect ? (
        <div className="disconnect-confirm" role="alert">
          <strong>Disconnect ElevenLabs?</strong>
          <p>
            The credential will be revoked locally. No provider object or Quantum Parks business
            record will be deleted.
          </p>
          <div>
            <button
              className="button danger-button"
              type="button"
              onClick={disconnect}
              disabled={busy !== null}
            >
              Confirm disconnect
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => setConfirmDisconnect(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <FormActions>
        <button
          className="button secondary"
          type="button"
          onClick={() => void saveWithoutTesting()}
          disabled={busy !== null || !connected || label.length < 2}
          title={
            connected
              ? 'Persist configuration without re-testing the connection.'
              : 'Save & test provider first to establish a connection.'
          }
        >
          {busy === 'save' ? 'Saving…' : 'Save ElevenLabs'}
        </button>
        <button
          className="button primary"
          type="button"
          onClick={() => void saveAndTest()}
          disabled={busy !== null || label.length < 2 || (!connected && apiKey.length < 8)}
        >
          {busy === 'test' ? 'Testing and saving…' : 'Save & test provider'}
        </button>
        {readyForLiveTest ? (
          <Link className="button ghost" href="/settings/simulation">
            Test receptionist
          </Link>
        ) : null}
        <span style={{ flex: 1 }} />
        {connected ? (
          <button
            className="button danger-link"
            type="button"
            onClick={() => setConfirmDisconnect(true)}
            disabled={busy !== null}
          >
            <Link2Off size={15} />
            Disconnect
          </button>
        ) : null}
      </FormActions>

      <p className="integration-boundary">
        <ShieldCheck size={15} aria-hidden="true" />
        Connection status does not enable production routing.
      </p>
    </section>
  );
}
