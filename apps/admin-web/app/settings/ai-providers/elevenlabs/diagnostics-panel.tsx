'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatDateTime, StatusPill, toneForState } from '@quantum-parks/ui';

type DiagnosticCheck = {
  key: string;
  label: string;
  status: 'PASS' | 'WARNING' | 'FAIL';
  detail: string;
};

type DiagnosticsResult = {
  status: 'PASS' | 'WARNING' | 'FAIL' | 'NOT_CONFIGURED';
  checks: DiagnosticCheck[];
  warnings: string[];
  errors: string[];
  checkedAt: string;
};

type MediaVerificationFact = {
  status: 'PASS' | 'FAILED' | 'NOT_VERIFIED';
  verifiedAt: string | null;
};

const endpoint = '/api/admin/integrations/elevenlabs';

async function request<T>(path: string, method: string): Promise<T> {
  const response = await fetch(`${endpoint}${path}`, { method, cache: 'no-store' });
  const data = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok)
    throw new Error(data.message ?? `Diagnostics service returned ${response.status}`);
  return data;
}

/**
 * A bootstrap check (real token/signed-URL round trip) proves server-side reachability only —
 * never that browser audio actually works. The two "media session" facts are sourced separately
 * from real Simulation Lab session events, never inferred from a passing bootstrap check.
 */
export function DiagnosticsPanel({
  initialDiagnostics,
  initialMediaVerification,
}: {
  initialDiagnostics: DiagnosticsResult | null;
  initialMediaVerification: {
    webrtc: MediaVerificationFact;
    websocket: MediaVerificationFact;
  } | null;
}) {
  const [diagnostics, setDiagnostics] = useState(initialDiagnostics);
  const [mediaVerification] = useState(initialMediaVerification);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function runDiagnostics() {
    setBusy(true);
    setError('');
    try {
      const result = await request<DiagnosticsResult>('/diagnostics', 'POST');
      setDiagnostics(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Diagnostics could not be run.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="diagnostics-title">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Checks provider readiness without exposing the API key</p>
          <h2 id="diagnostics-title">Diagnostics</h2>
        </div>
        <button
          className="button secondary"
          type="button"
          onClick={() => void runDiagnostics()}
          disabled={busy}
        >
          {busy ? 'Running…' : 'Run diagnostics'}
        </button>
      </header>

      {diagnostics ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <StatusPill tone={toneForState(diagnostics.status)}>{diagnostics.status}</StatusPill>
            <span className="panel-description" style={{ margin: 0 }}>
              Last checked {formatDateTime(diagnostics.checkedAt)}
            </span>
          </div>
          <div className="card-grid card-grid-2">
            {diagnostics.checks.map((check) => (
              <div className="control-card" key={check.key}>
                <div>
                  <strong>{check.label}</strong>
                  <StatusPill tone={toneForState(check.status)}>{check.status}</StatusPill>
                </div>
                <p>{check.detail}</p>
              </div>
            ))}
          </div>
          {mediaVerification ? (
            <div className="card-grid card-grid-2" style={{ marginTop: 12 }}>
              <div className="control-card">
                <div>
                  <strong>WebRTC media session</strong>
                  <StatusPill tone={toneForState(mediaVerification.webrtc.status)}>
                    {mediaVerification.webrtc.status}
                  </StatusPill>
                </div>
                <p>
                  {mediaVerification.webrtc.status === 'NOT_VERIFIED'
                    ? 'No completed browser voice session over WebRTC yet — a passing bootstrap check above does not imply this.'
                    : `Real browser session verified ${formatDateTime(mediaVerification.webrtc.verifiedAt!)}.`}
                </p>
              </div>
              <div className="control-card">
                <div>
                  <strong>WebSocket media session</strong>
                  <StatusPill tone={toneForState(mediaVerification.websocket.status)}>
                    {mediaVerification.websocket.status}
                  </StatusPill>
                </div>
                <p>
                  {mediaVerification.websocket.status === 'NOT_VERIFIED'
                    ? 'No completed browser voice session over WebSocket yet — a passing bootstrap check above does not imply this.'
                    : `Real browser session verified ${formatDateTime(mediaVerification.websocket.verifiedAt!)}.`}
                </p>
              </div>
            </div>
          ) : null}
          <Link
            className="button ghost small"
            href="/settings/ai-providers/elevenlabs/diagnostics"
            style={{ marginTop: 14 }}
          >
            View diagnostics history
          </Link>
        </div>
      ) : (
        <p className="panel-description" style={{ marginTop: 12 }}>
          Not configured. Save the ElevenLabs provider, then run diagnostics.
        </p>
      )}
      {error ? (
        <p className="field-error" role="alert" style={{ marginTop: 10 }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
