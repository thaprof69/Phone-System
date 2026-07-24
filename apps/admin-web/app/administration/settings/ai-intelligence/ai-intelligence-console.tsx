'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  Activity,
  Bot,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  DatabaseZap,
  GitBranch,
  KeyRound,
  Network,
  RefreshCcw,
  Route,
  ShieldAlert,
  X,
} from 'lucide-react';

export type AISection =
  'overview' | 'providers' | 'capabilities' | 'execution' | 'governance' | 'monitoring';

type Model = {
  id: string;
  providerModelId: string;
  displayName: string;
  structuredOutput: string;
  embeddingSupport: string;
  available: boolean;
  deprecated: boolean;
};
type Provider = {
  id: string;
  providerKey: string;
  connectionLabel: string;
  environment: string;
  status: string;
  enabled: boolean;
  credentialReference: string | null;
  modelCount: number;
  lastVerifiedAt: string | null;
  synthetic: boolean;
  productionEligible: boolean;
  models: Model[];
};
type RegistryRow = {
  id: string;
  key?: string;
  displayName?: string;
  purpose?: string;
  state?: string;
  version?: number;
  activeVersion?: {
    state: string | null;
    version: number | null;
    critical: boolean | null;
    productionApproved: boolean | null;
  } | null;
};

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
  providers: {
    installedAdapters: Array<{
      key: string;
      label: string;
      support: string;
      description: string;
    }>;
    unavailableAdapters: Array<{ key: string; support: string; description: string }>;
    connections: Provider[];
  };
  capabilities: RegistryRow[];
  execution: {
    services: RegistryRow[];
    routes: RegistryRow[];
    recentRuns: Array<{
      id: string;
      state: string;
      startedAt: string;
      errorCode?: string | null;
    }>;
  };
  governance: {
    prompts: RegistryRow[];
    schemas: RegistryRow[];
    taxonomies: RegistryRow[];
    budgets: RegistryRow[];
  };
  monitoring: {
    usage: { requests: number; inputTokens: number; outputTokens: number; costMicros: number };
    health: RegistryRow[];
    recentRuns: Array<{
      id: string;
      state: string;
      startedAt: string;
      errorCode?: string | null;
    }>;
  };
};

const sections: Array<{ key: AISection; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'providers', label: 'Providers' },
  { key: 'capabilities', label: 'Capabilities' },
  { key: 'execution', label: 'Execution' },
  { key: 'governance', label: 'Governance' },
  { key: 'monitoring', label: 'Monitoring' },
];

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

export function AIIntelligenceConsole({
  initialWorkspace,
  active,
  unavailableReason,
  voiceRuntimeStatus,
  platformStatus,
}: {
  initialWorkspace: AIWorkspace | null;
  active: AISection;
  unavailableReason: string | null;
  voiceRuntimeStatus: string;
  platformStatus: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(unavailableReason ?? '');
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('Quantum Parks OpenAI');
  const [environment, setEnvironment] = useState<'development' | 'staging' | 'production'>(
    'development',
  );
  const [proof, setProof] = useState('');

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

  async function testCredential() {
    setBusy(true);
    setProof('');
    try {
      const result = await api<{ verified: boolean; validationProof?: string }>(
        'providers/test',
        'POST',
        { providerKey: 'OPENAI', apiKey, connectionLabel: label, environment },
      );
      setProof(result.validationProof ?? '');
      setMessage(
        result.verified ? 'Credential verified. It has not been saved.' : 'Validation failed.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Validation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function saveCredential() {
    setBusy(true);
    try {
      await api('providers/connect', 'POST', {
        providerKey: 'OPENAI',
        apiKey,
        connectionLabel: label,
        environment,
        validationProof: proof,
      });
      setApiKey('');
      setProof('');
      dialog.current?.close();
      await refresh('OpenAI was saved in the encrypted AIOS credential vault.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Provider could not be saved.');
      setBusy(false);
    }
  }

  return (
    <div className="aios-console">
      <div className="aios-toolbar">
        <nav className="ai-primary-nav" aria-label="AI Intelligence sections">
          {sections.map((section) => (
            <Link
              key={section.key}
              href={
                section.key === 'overview'
                  ? '/administration/settings/ai-intelligence'
                  : `/administration/settings/ai-intelligence/${section.key}`
              }
              className={section.key === active ? 'active' : undefined}
              aria-current={section.key === active ? 'page' : undefined}
            >
              {section.label}
            </Link>
          ))}
        </nav>
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
      {active === 'overview' ? (
        <Overview
          workspace={workspace}
          voiceRuntimeStatus={voiceRuntimeStatus}
          platformStatus={platformStatus}
        />
      ) : active === 'providers' ? (
        <Providers
          workspace={workspace}
          open={() => dialog.current?.showModal()}
          discover={async (id) => {
            setBusy(true);
            try {
              await api(`providers/${id}/discover-models`, 'POST', {});
              await refresh('Provider models were rediscovered.');
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'Model discovery failed.');
              setBusy(false);
            }
          }}
        />
      ) : active === 'capabilities' ? (
        <Capabilities rows={workspace?.capabilities ?? []} />
      ) : active === 'execution' ? (
        <Execution workspace={workspace} />
      ) : active === 'governance' ? (
        <Governance workspace={workspace} />
      ) : (
        <Monitoring workspace={workspace} />
      )}
      <dialog className="integration-dialog" ref={dialog}>
        <div className="dialog-shell">
          <header>
            <div>
              <p className="eyebrow">Supported AIOS adapter</p>
              <h2>Connect OpenAI</h2>
            </div>
            <button
              className="icon-button"
              aria-label="Close provider dialog"
              onClick={() => dialog.current?.close()}
            >
              <X size={18} />
            </button>
          </header>
          <div className="dialog-content">
            <p className="dialog-intro">
              OpenAI is the first production reference adapter, not an architectural dependency.
            </p>
            <label className="field">
              <span>Connection label</span>
              <input
                value={label}
                onChange={(event) => {
                  setLabel(event.target.value);
                  setProof('');
                }}
              />
            </label>
            <label className="field">
              <span>Environment</span>
              <select
                value={environment}
                onChange={(event) => {
                  setEnvironment(event.target.value as typeof environment);
                  setProof('');
                }}
              >
                <option value="development">Development</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </select>
            </label>
            <label className="field">
              <span>API key</span>
              <input
                type="password"
                autoComplete="new-password"
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setProof('');
                }}
                placeholder="Stored server-side only"
              />
            </label>
            <div className="security-note">
              <KeyRound size={18} />
              <span>The browser receives only a safe credential reference after save.</span>
            </div>
          </div>
          <footer>
            <button
              className="button secondary"
              onClick={testCredential}
              disabled={busy || apiKey.length < 20}
            >
              Test connection
            </button>
            <button className="button primary" onClick={saveCredential} disabled={busy || !proof}>
              <CheckCircle2 size={16} /> Save verified provider
            </button>
          </footer>
        </div>
      </dialog>
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
            Calls, reports, analytics, and future products invoke stable capabilities through AIOS.
            Providers, models, prompts, and pipelines remain governed implementation details.
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

function Providers({
  workspace,
  open,
  discover,
}: {
  workspace: AIWorkspace | null;
  open: () => void;
  discover: (id: string) => void;
}) {
  if (!workspace) return <Unavailable />;
  return (
    <div className="section-stack">
      <section className="panel">
        <header className="panel-header">
          <div>
            <p className="eyebrow">Verified connections and governed models</p>
            <h2>Providers</h2>
          </div>
          <button className="button primary" onClick={open}>
            <KeyRound size={16} /> Connect OpenAI
          </button>
        </header>
        <div className="registry-grid padded-grid">
          {workspace.providers.connections.map((provider) => (
            <article
              className={provider.synthetic ? 'registry-card simulator-card' : 'registry-card'}
              key={provider.id}
            >
              <div className="provider-card-heading">
                <strong>{provider.providerKey}</strong>
                <span className="status-pill status-neutral">{provider.status}</span>
              </div>
              <h3>{provider.connectionLabel}</h3>
              <p>
                {provider.environment} ·{' '}
                {provider.synthetic
                  ? 'Synthetic — non-production only'
                  : provider.lastVerifiedAt
                    ? 'Verified vault-backed connection'
                    : 'Not verified'}
              </p>
              <dl className="integration-facts">
                <div>
                  <dt>Credential</dt>
                  <dd>{provider.credentialReference ?? 'Not required'}</dd>
                </div>
                <div>
                  <dt>Production eligibility</dt>
                  <dd>{provider.productionEligible ? 'ELIGIBLE' : 'BLOCKED'}</dd>
                </div>
              </dl>
              <button className="button secondary" onClick={() => discover(provider.id)}>
                Discover models
              </button>
              <ModelList models={provider.models} />
            </article>
          ))}
          {!workspace.providers.connections.length ? (
            <div className="empty-state">
              <strong>No verified provider connection</strong>
              <p>
                Connect OpenAI only when a real credential and processing approval are available.
              </p>
            </div>
          ) : null}
        </div>
      </section>
      <section className="panel">
        <header className="panel-header">
          <div>
            <p className="eyebrow">Provider truth</p>
            <h2>Adapter availability</h2>
          </div>
        </header>
        <div className="record-list">
          {[
            ...workspace.providers.installedAdapters,
            ...workspace.providers.unavailableAdapters.map((adapter) => ({
              ...adapter,
              label: adapter.key.replaceAll('_', ' '),
            })),
          ].map((adapter) => (
            <article className="record-row" key={adapter.key}>
              <div>
                <strong>{adapter.label}</strong>
                <p>{adapter.description}</p>
              </div>
              <span className="status-pill status-neutral">{adapter.support}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Capabilities({ rows }: { rows: RegistryRow[] }) {
  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Stable business-facing contract</p>
          <h2>AI Capabilities</h2>
        </div>
        <Bot />
      </header>
      <div className="record-list">
        {rows.map((row) => (
          <article className="record-row" key={row.id}>
            <div>
              <strong>{row.displayName ?? row.key}</strong>
              <p>{row.purpose}</p>
            </div>
            <div className="record-controls">
              <span className="status-pill status-info">
                {row.activeVersion?.state ?? 'NOT ACTIVE'}
              </span>
              <small>
                v{row.activeVersion?.version ?? '—'} ·{' '}
                {row.activeVersion?.productionApproved ? 'production approved' : 'not approved'}
              </small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Execution({ workspace }: { workspace: AIWorkspace | null }) {
  if (!workspace) return <Unavailable />;
  return (
    <GroupedArea
      title="Execution"
      description="Services, routes, pipelines, dependencies, context, memory, evidence, fallbacks, retries, and runs."
      icon={<GitBranch />}
      groups={[
        ['Services', workspace.execution.services.length],
        ['Routes & fallbacks', workspace.execution.routes.length],
        ['Recent execution runs', workspace.execution.recentRuns.length],
      ]}
    />
  );
}

function Governance({ workspace }: { workspace: AIWorkspace | null }) {
  if (!workspace) return <Unavailable />;
  return (
    <GroupedArea
      title="Governance"
      description="Prompts, schemas, taxonomies, policies, approvals, evaluations, and rollback evidence."
      icon={<Boxes />}
      groups={[
        ['Prompt versions', workspace.governance.prompts.length],
        ['Output schemas', workspace.governance.schemas.length],
        ['Taxonomies', workspace.governance.taxonomies.length],
        ['Budget policies', workspace.governance.budgets.length],
      ]}
    />
  );
}

function Monitoring({ workspace }: { workspace: AIWorkspace | null }) {
  if (!workspace) return <Unavailable />;
  const usage = workspace.monitoring.usage;
  return (
    <>
      <div className="metric-grid">
        <Metric label="Requests" value={usage.requests} icon={<Activity />} />
        <Metric label="Input tokens" value={usage.inputTokens} icon={<Route />} />
        <Metric label="Output tokens" value={usage.outputTokens} icon={<Boxes />} />
        <Metric
          label="Recorded cost (micros)"
          value={usage.costMicros}
          icon={<CircleDollarSign />}
        />
      </div>
      <GroupedArea
        title="Monitoring"
        description="Usage, cost, health transitions, runs, errors, incidents, and AI lifecycle activity."
        icon={<Activity />}
        groups={[
          ['Health checks', workspace.monitoring.health.length],
          ['Recent runs', workspace.monitoring.recentRuns.length],
          [
            'Failed or partial runs',
            workspace.monitoring.recentRuns.filter(
              (run) => run.state !== 'SUCCESS' && run.state !== 'FALLBACK_USED',
            ).length,
          ],
        ]}
      />
    </>
  );
}

function GroupedArea({
  title,
  description,
  icon,
  groups,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  groups: Array<[string, number]>;
}) {
  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Grouped operator workspace</p>
          <h2>{title}</h2>
        </div>
        {icon}
      </header>
      <p className="panel-copy">{description}</p>
      <div className="grouped-area-grid">
        {groups.map(([label, count]) => (
          <article key={label}>
            <strong>{count}</strong>
            <span>{label}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function ModelList({ models }: { models: Model[] }) {
  return (
    <div className="nested-models">
      <strong>Models</strong>
      {models.length ? (
        models.map((model) => (
          <span key={model.id}>
            {model.displayName} · {model.available && !model.deprecated ? 'available' : 'blocked'}
          </span>
        ))
      ) : (
        <span>No discovered models</span>
      )}
    </div>
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
