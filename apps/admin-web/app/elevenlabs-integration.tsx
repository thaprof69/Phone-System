'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, KeyRound, Link2Off, RefreshCcw, ShieldCheck, X } from 'lucide-react';

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

export function ElevenLabsIntegrationCard({
  initialStatus,
  authorized,
}: {
  initialStatus: ElevenLabsIntegrationStatus;
  authorized: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState(initialStatus);
  const [mode, setMode] = useState<'connect' | 'manage'>(
    initialStatus.status === 'CONNECTED' ? 'manage' : 'connect',
  );
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  function open(nextMode: 'connect' | 'manage') {
    setMode(nextMode);
    setMessage('');
    setConfirmDisconnect(false);
    setApiKey('');
    setTestResult(null);
    setRuntimeConfig(runtimeConfigFrom(status));
    dialog.current?.showModal();
  }

  function close() {
    dialog.current?.close();
    setApiKey('');
    setTestResult(null);
    setMessage('');
    setConfirmDisconnect(false);
  }

  /**
   * One primary action: test the credential (and the configured agent, if any),
   * then save only if that test succeeds. There is no separate "save without
   * testing" path for a new or rotated credential.
   */
  async function saveAndTestConnection(rotation: boolean) {
    setBusy(true);
    setMessage('');
    setTestResult(null);
    try {
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
        rotation ? '/rotate' : '/connect',
        'POST',
        {
          apiKey,
          connectionLabel: label,
          environment,
          validationProof: tested.validationProof,
          ...(rotation
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
      setMode('manage');
      setMessage(
        rotation
          ? 'Credential rotated and revalidated.'
          : tested.verifiedAgent
            ? `Connected and verified agent "${tested.verifiedAgent.name ?? tested.verifiedAgent.id}".`
            : 'Connection saved securely.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Connection could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function updateConfiguration() {
    setBusy(true);
    setMessage('');
    try {
      const updated = await request<ElevenLabsIntegrationStatus>('', 'PATCH', {
        connectionLabel: label,
        defaultAgentId: defaultAgentId || null,
        defaultVoiceId: defaultVoiceId || null,
        ...runtimeConfigPayload(runtimeConfig),
      });
      setStatus(updated);
      setMessage('Integration settings updated.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Settings could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCurrent() {
    setBusy(true);
    setMessage('');
    try {
      const verified = await request<ElevenLabsIntegrationStatus & { verified: boolean }>(
        '/verify',
        'POST',
      );
      setStatus(verified);
      setMessage(
        verified.verified
          ? 'The stored credential is healthy.'
          : 'The stored credential could not be verified.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Health check failed.');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
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
      setBusy(false);
    }
  }

  const connected = status.status === 'CONNECTED' || status.status === 'DEGRADED';
  return (
    <section
      className="panel integration-panel"
      id="integrations"
      aria-labelledby="elevenlabs-title"
    >
      <header className="panel-header">
        <div>
          <p className="eyebrow">Managed voice runtime</p>
          <h2 id="elevenlabs-title">ElevenLabs</h2>
        </div>
        <span className={`status-pill status-${tone(status.status)}`}>
          {status.status.replaceAll('_', ' ')}
        </span>
      </header>
      <div className="integration-body">
        <div className="integration-logo" aria-hidden="true">
          II
        </div>
        <div className="integration-copy">
          <strong>
            {connected
              ? (status.connectionLabel ?? 'ElevenLabs workspace')
              : 'Connect the ElevenLabs voice runtime'}
          </strong>
          <p>
            Quantum Parks keeps authoritative configuration and history. ElevenLabs receives only
            approved runtime copies.
          </p>
          {connected ? (
            <dl className="integration-facts">
              <div>
                <dt>Environment</dt>
                <dd>{status.environment}</dd>
              </div>
              <div>
                <dt>Credential</dt>
                <dd>{status.credentialReference ?? 'Protected reference'}</dd>
              </div>
              <div>
                <dt>Discovered</dt>
                <dd>
                  {status.counts?.agents ?? 0} agents · {status.counts?.voices ?? 0} voices
                </dd>
              </div>
              <div>
                <dt>Configured agent</dt>
                <dd>
                  {status.defaultAgentId
                    ? status.agentVerifiedAt
                      ? (status.verifiedAgentName ?? 'Verified (no name reported)')
                      : 'Not yet verified'
                    : 'None configured'}
                </dd>
              </div>
              <div>
                <dt>Last verified</dt>
                <dd>
                  {status.lastVerifiedAt
                    ? verifiedAtFormatter.format(new Date(status.lastVerifiedAt))
                    : 'Not verified'}
                </dd>
              </div>
            </dl>
          ) : null}
          <p className="integration-boundary">
            <ShieldCheck size={15} aria-hidden="true" />
            Connection status does not enable production routing.
          </p>
          {message && !dialog.current?.open ? (
            <p className="inline-feedback" role="status">
              {message}
            </p>
          ) : null}
        </div>
        <div className="integration-actions">
          {authorized ? (
            <button
              className="button primary"
              type="button"
              onClick={() => open(connected ? 'manage' : 'connect')}
            >
              {connected ? 'Manage' : 'Connect'}
            </button>
          ) : (
            <span className="capability-note">Administrator permission required</span>
          )}
        </div>
      </div>

      <dialog className="integration-dialog" ref={dialog} onClose={close}>
        <form method="dialog" className="dialog-shell" onSubmit={(event) => event.preventDefault()}>
          <header>
            <div>
              <p className="eyebrow">
                {mode === 'connect' ? 'Secure provider setup' : 'Provider management'}
              </p>
              <h2>{mode === 'connect' ? 'Connect ElevenLabs' : 'Manage ElevenLabs'}</h2>
            </div>
            <button className="icon-button" type="button" onClick={close} aria-label="Close dialog">
              <X size={17} />
            </button>
          </header>

          <div className="dialog-content">
            <div className="secret-notice">
              <KeyRound size={18} aria-hidden="true" />
              <div>
                <strong>Server-side secret storage</strong>
                <p>
                  The API key is used only for validation and encrypted storage. It is never shown
                  again or written to browser storage.
                </p>
              </div>
            </div>

            <div className="integration-form">
              <label>
                Connection label
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  maxLength={100}
                  autoComplete="off"
                  required
                />
              </label>
              <label>
                Environment
                <select
                  value={environment}
                  onChange={(event) =>
                    setEnvironment(event.target.value as 'SANDBOX' | 'PRODUCTION')
                  }
                  disabled={mode === 'manage'}
                >
                  <option value="SANDBOX">Sandbox</option>
                  <option value="PRODUCTION">Production</option>
                </select>
              </label>
              <label>
                Default agent ID <span>(optional)</span>
                <input
                  value={defaultAgentId}
                  onChange={(event) => setDefaultAgentId(event.target.value)}
                  autoComplete="off"
                  placeholder="agent_…"
                />
                <span>Retrieved and verified through the ElevenLabs API before it is saved.</span>
              </label>
              <label>
                Default voice ID <span>(optional)</span>
                <input
                  value={defaultVoiceId}
                  onChange={(event) => setDefaultVoiceId(event.target.value)}
                  autoComplete="off"
                  placeholder="voice_…"
                />
              </label>
              <label className="form-wide">
                {mode === 'manage' ? 'New API key for rotation' : 'ElevenLabs API key'}
                <input
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  minLength={8}
                  maxLength={512}
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder={mode === 'manage' ? 'Leave empty unless rotating' : 'Enter API key'}
                />
                <span>
                  Create a restricted key in ElevenLabs Workspace settings → API Keys. Grant only
                  the read and configuration scopes Quantum Parks needs.
                </span>
              </label>
            </div>

            {mode === 'connect' || !apiKey ? (
              <fieldset className="integration-form">
                <legend>Runtime configuration</legend>
                <label>
                  Receptionist display name <span>(optional)</span>
                  <input
                    value={runtimeConfig.receptionistDisplayName}
                    onChange={(event) =>
                      setRuntimeConfig((current) => ({
                        ...current,
                        receptionistDisplayName: event.target.value,
                      }))
                    }
                    maxLength={100}
                  />
                </label>
                <label>
                  Language override <span>(optional)</span>
                  <input
                    value={runtimeConfig.language}
                    onChange={(event) =>
                      setRuntimeConfig((current) => ({ ...current, language: event.target.value }))
                    }
                    placeholder="Use agent default"
                    maxLength={20}
                  />
                </label>
                <label className="form-wide">
                  Greeting override <span>(optional)</span>
                  <input
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
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={runtimeConfig.voiceTestingEnabled}
                    onChange={(event) =>
                      setRuntimeConfig((current) => ({
                        ...current,
                        voiceTestingEnabled: event.target.checked,
                      }))
                    }
                  />
                  Allow live voice calls from Simulation Lab
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={runtimeConfig.chatTestingEnabled}
                    onChange={(event) =>
                      setRuntimeConfig((current) => ({
                        ...current,
                        chatTestingEnabled: event.target.checked,
                      }))
                    }
                  />
                  Allow chat simulation from Simulation Lab
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={runtimeConfig.transcriptCapture}
                    onChange={(event) =>
                      setRuntimeConfig((current) => ({
                        ...current,
                        transcriptCapture: event.target.checked,
                      }))
                    }
                  />
                  Capture transcripts from live sessions
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={runtimeConfig.summaryGeneration}
                    onChange={(event) =>
                      setRuntimeConfig((current) => ({
                        ...current,
                        summaryGeneration: event.target.checked,
                      }))
                    }
                  />
                  Generate call summaries
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={runtimeConfig.escalationDetection}
                    onChange={(event) =>
                      setRuntimeConfig((current) => ({
                        ...current,
                        escalationDetection: event.target.checked,
                      }))
                    }
                  />
                  Detect escalation-worthy calls
                </label>
              </fieldset>
            ) : null}

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

            {mode === 'manage' && confirmDisconnect ? (
              <div className="disconnect-confirm" role="alert">
                <strong>Disconnect ElevenLabs?</strong>
                <p>
                  The credential will be revoked locally. No provider object or Quantum Parks
                  business record will be deleted.
                </p>
                <div>
                  <button
                    className="button danger-button"
                    type="button"
                    onClick={disconnect}
                    disabled={busy}
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
          </div>

          <footer>
            {mode === 'connect' ? (
              <button
                className="button primary"
                type="button"
                onClick={() => void saveAndTestConnection(false)}
                disabled={busy || apiKey.length < 8 || label.length < 2}
              >
                <RefreshCcw size={15} />
                {busy ? 'Testing and saving…' : 'Save and test connection'}
              </button>
            ) : (
              <>
                <button
                  className="button danger-link"
                  type="button"
                  onClick={() => setConfirmDisconnect(true)}
                  disabled={busy}
                >
                  <Link2Off size={15} />
                  Disconnect
                </button>
                <span className="footer-spacer" />
                {apiKey ? (
                  <button
                    className="button primary"
                    type="button"
                    onClick={() => void saveAndTestConnection(true)}
                    disabled={busy || apiKey.length < 8}
                  >
                    <RefreshCcw size={15} />
                    {busy ? 'Testing and rotating…' : 'Test and rotate credential'}
                  </button>
                ) : (
                  <>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => void verifyCurrent()}
                      disabled={busy}
                    >
                      Test stored connection
                    </button>
                    <button
                      className="button primary"
                      type="button"
                      onClick={() => void updateConfiguration()}
                      disabled={busy || label.length < 2}
                    >
                      Save settings
                    </button>
                  </>
                )}
              </>
            )}
          </footer>
        </form>
      </dialog>
    </section>
  );
}
