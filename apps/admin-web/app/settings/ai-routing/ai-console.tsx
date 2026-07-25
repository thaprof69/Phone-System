'use client';

import { useState } from 'react';
import { Activity, Bot, DatabaseZap, Network, RefreshCcw, ShieldAlert } from 'lucide-react';

export type AIWorkspace = {
  generatedAt: string;
  overview: {
    readiness: {
      status: string;
      blockers: Array<{ code: string; description: string }>;
      evaluatedAt: string;
    };
    connectedProductionProviderCount: number;
    activeCapabilityCount: number;
    governedModelCount: number;
    recentRunCount: number;
    usage: { requests: number; inputTokens: number; outputTokens: number; costMicros: number };
  };
  execution: {
    services: unknown[];
    routes: unknown[];
  };
};

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/admin/ai/${path}`, {
    method,
    cache: 'no-store',
    headers: body ? { 'content-type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Error(payload.message ?? `AIOS returned ${response.status}`);
  return payload;
}

/**
 * The Overview area of AI Routing: readiness, governed counts and usage. Provider
 * connection, model, capability, route, prompt/schema/budget and execution/monitoring
 * detail each live on their own route now (see the sibling page.tsx files in this
 * directory and in ../ai-providers) rather than behind a query-param switch here.
 */
export function AIIntelligenceConsole({
  initialWorkspace,
  unavailableReason,
  voiceRuntimeStatus,
  platformStatus,
}: {
  initialWorkspace: AIWorkspace | null;
  unavailableReason: string | null;
  voiceRuntimeStatus: string;
  platformStatus: string;
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(unavailableReason ?? '');

  async function refresh(messageText = 'AI Intelligence read model refreshed.') {
    setBusy(true);
    try {
      setWorkspace(await api<AIWorkspace>('workspace'));
      setMessage(messageText);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI Intelligence refresh failed.');
    } finally {
      setBusy(false);
    }
  }

  async function evaluateReadiness() {
    setBusy(true);
    try {
      await api('readiness/evaluate', 'POST', {});
      await refresh('AI Intelligence readiness was evaluated by the server.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Readiness evaluation failed.');
      setBusy(false);
    }
  }

  return (
    <div className="aios-console">
      <div className="aios-toolbar">
        <div className="heading-actions">
          <button className="button secondary" onClick={() => refresh()} disabled={busy}>
            <RefreshCcw size={16} /> Refresh
          </button>
          <button className="button primary" onClick={evaluateReadiness} disabled={busy}>
            <ShieldAlert size={16} /> Evaluate readiness
          </button>
        </div>
      </div>
      {message ? (
        <div className="notice warning" role="status">
          <ShieldAlert />
          <div>{message}</div>
        </div>
      ) : null}
      <Overview
        workspace={workspace}
        voiceRuntimeStatus={voiceRuntimeStatus}
        platformStatus={platformStatus}
      />
    </div>
  );
}

function Overview({
  workspace,
  voiceRuntimeStatus,
  platformStatus,
}: {
  workspace: AIWorkspace | null;
  voiceRuntimeStatus: string;
  platformStatus: string;
}) {
  if (!workspace) return <Unavailable />;
  const { overview } = workspace;
  return (
    <>
      <div className="aios-status-strip">
        <Status label="Voice Runtime" value={voiceRuntimeStatus} />
        <Status label="AI Intelligence" value={overview.readiness.status} />
        <Status label="Platform" value={platformStatus} />
        <Status label="Production routing" value="BLOCKED" />
      </div>
      <div className="metric-grid">
        <Metric
          label="Verified production providers"
          value={overview.connectedProductionProviderCount}
          icon={<Network />}
        />
        <Metric
          label="Governed models"
          value={overview.governedModelCount}
          icon={<DatabaseZap />}
        />
        <Metric label="Active capabilities" value={overview.activeCapabilityCount} icon={<Bot />} />
        <Metric label="Recent runs" value={overview.recentRunCount} icon={<Activity />} />
      </div>
      <div className="admin-grid">
        <section className="panel wide-panel">
          <header className="panel-header">
            <div>
              <p className="eyebrow">Business capability control plane</p>
              <h2>What AI Intelligence powers</h2>
            </div>
          </header>
          <p className="panel-copy">
            Calls, reports, analytics, and future products invoke stable capabilities through this
            routing layer. Providers, models, prompts, and pipelines remain governed implementation
            details.
          </p>
        </section>
        <section className="panel">
          <header className="panel-header">
            <div>
              <p className="eyebrow">Server computed</p>
              <h2>Readiness blockers</h2>
            </div>
          </header>
          {overview.readiness.blockers.length ? (
            <div className="blocker-cards">
              {overview.readiness.blockers.map((blocker) => (
                <article key={blocker.code}>
                  <strong>{blocker.code.replaceAll('_', ' ')}</strong>
                  <p>{blocker.description}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="panel-copy">No AI Intelligence blocker was reported.</p>
          )}
        </section>
      </div>
    </>
  );
}

function Unavailable() {
  return (
    <section className="panel">
      <div className="empty-state">
        <strong>AI Intelligence read model unavailable</strong>
        <p>No configuration or readiness claim can be made until the API responds.</p>
      </div>
    </section>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value.replaceAll('_', ' ')}</strong>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="metric-card metric-good">
      <div>
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
    </div>
  );
}
