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
  productionRoutingEnabled: boolean;
};

type TestResult = {
  status: ElevenLabsIntegrationStatus['status'];
  verified: boolean;
  message?: string;
  validationProof?: string;
  workspace?: { id: string; subscription: string | null };
  counts?: { agents: number; voices: number };
};

const endpoint = '/api/admin/integrations/elevenlabs';
const verifiedAtFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

function tone(status: ElevenLabsIntegrationStatus['status']) {
  if (status === 'CONNECTED') return 'good';
  if (status === 'DEGRADED' || status === 'VALIDATING') return 'warning';
  if (status === 'INVALID_CREDENTIALS' || status === 'ERROR') return 'danger';
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
  const [proof, setProof] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  useEffect(() => {
    if (!dialog.current?.open) return;
    setProof('');
    setTestResult(null);
  }, [apiKey, environment, label]);

  function open(nextMode: 'connect' | 'manage') {
    setMode(nextMode);
    setMessage('');
    setConfirmDisconnect(false);
    setApiKey('');
    setProof('');
    setTestResult(null);
    dialog.current?.showModal();
  }

  function close() {
    dialog.current?.close();
    setApiKey('');
    setProof('');
    setTestResult(null);
    setMessage('');
    setConfirmDisconnect(false);
  }

  async function testNewCredential() {
    setBusy(true);
    setMessage('');
    try {
      const result = await request<TestResult>('/test', 'POST', {
        apiKey,
        connectionLabel: label,
        environment,
      });
      setTestResult(result);
      setProof(result.validationProof ?? '');
      setMessage(
        result.verified
          ? `Verified workspace access. Found ${result.counts?.agents ?? 0} agents and ${result.counts?.voices ?? 0} voices.`
          : (result.message ?? 'Connection validation failed.'),
      );
    } catch (error) {
      setTestResult(null);
      setProof('');
      setMessage(error instanceof Error ? error.message : 'Connection validation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function saveConnection(rotation = false) {
    setBusy(true);
    setMessage('');
    try {
      const saved = await request<ElevenLabsIntegrationStatus & { saved?: boolean }>(
        rotation ? '/rotate' : '/connect',
        'POST',
        {
          apiKey,
          connectionLabel: label,
          environment,
          validationProof: proof,
          ...(rotation ? {} : { defaultAgentId: defaultAgentId || undefined }),
          ...(rotation ? {} : { defaultVoiceId: defaultVoiceId || undefined }),
        },
      );
      setStatus(saved);
      setApiKey('');
      setProof('');
      setTestResult(null);
      setMode('manage');
      setMessage(rotation ? 'Credential rotated and revalidated.' : 'Connection saved securely.');
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
              <>
                <button
                  className="button secondary"
                  type="button"
                  onClick={testNewCredential}
                  disabled={busy || apiKey.length < 8 || label.length < 2}
                >
                  <RefreshCcw size={15} />
                  {busy ? 'Validating…' : 'Test connection'}
                </button>
                <button
                  className="button primary"
                  type="button"
                  onClick={() => saveConnection(false)}
                  disabled={busy || !proof || !testResult?.verified}
                >
                  Save connection
                </button>
              </>
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
                <button
                  className="button secondary"
                  type="button"
                  onClick={verifyCurrent}
                  disabled={busy || apiKey.length > 0}
                >
                  Test stored connection
                </button>
                {apiKey ? (
                  <>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={testNewCredential}
                      disabled={busy || apiKey.length < 8}
                    >
                      Test new key
                    </button>
                    <button
                      className="button primary"
                      type="button"
                      onClick={() => saveConnection(true)}
                      disabled={busy || !proof || !testResult?.verified}
                    >
                      Rotate credential
                    </button>
                  </>
                ) : (
                  <button
                    className="button primary"
                    type="button"
                    onClick={updateConfiguration}
                    disabled={busy || label.length < 2}
                  >
                    Save settings
                  </button>
                )}
              </>
            )}
          </footer>
        </form>
      </dialog>
    </section>
  );
}
