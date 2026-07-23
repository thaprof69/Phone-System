import Link from 'next/link';
import { ArrowRight, CircleAlert, CloudCog, RefreshCcw } from 'lucide-react';
import { MetricCard, Panel, ProgressBar, StatusPill } from '@quantum-parks/ui';
import { apiGet } from '../lib/api';
import { AppShell, PageHeading } from './shell';

type Readiness = {
  state: string;
  blockers: string[];
  checks?: Array<{ label: string; passed: boolean }>;
};
type Calls = {
  items: Array<{
    id: string;
    providerConversationId?: string;
    processingState?: string;
    receivedAt?: string;
    synthetic?: boolean;
  }>;
};
type Operations = {
  transfers: Array<{ status: string }>;
  callbacks: Array<{ status: string }>;
  tasks: Array<{ status: string }>;
  deliveries: Array<{ status: string }>;
};

export default async function OverviewPage() {
  const [readiness, calls, provider, operations] = await Promise.all([
    apiGet<Readiness>('/readiness'),
    apiGet<Calls>('/calls?limit=5'),
    apiGet<{ result?: { status: string } }>('/provider-connections/health'),
    apiGet<Operations>('/operations'),
  ]);
  const blockers = readiness.ok
    ? readiness.data.blockers
    : [
        'API connectivity',
        'Live provider credentials',
        'Approved company content',
        'Legal and native-language approval',
      ];
  const recentCalls = calls.ok ? calls.data.items : [];
  const providerConnected = provider.ok && provider.data.result?.status === 'SUCCESS';
  const openOperations = operations.ok
    ? [
        ...operations.data.transfers,
        ...operations.data.callbacks,
        ...operations.data.tasks,
        ...operations.data.deliveries,
      ].filter((item) => !['COMPLETED', 'DELIVERED', 'CANCELLED'].includes(item.status)).length
    : null;
  const activationScore =
    readiness.ok && readiness.data.state === 'PRODUCTION_DEPLOYMENT_READY' ? 100 : 0;
  const today = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Lisbon',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  return (
    <AppShell>
      <PageHeading
        eyebrow={today}
        title="Good afternoon"
        description="The receptionist control plane is available for engineering review. Production activation remains intentionally blocked."
        actions={
          <>
            <Link href="/" className="button secondary">
              <RefreshCcw size={16} /> Refresh health
            </Link>
            <Link href="/administration" className="button primary">
              Review readiness <ArrowRight size={16} />
            </Link>
          </>
        }
      />
      <div className="notice warning" role="status">
        <CircleAlert size={20} aria-hidden="true" />
        <div>
          <strong>Production is externally blocked</strong>
          <p>
            {blockers.length} onboarding gates remain. Simulator evidence never counts as production
            approval.
          </p>
        </div>
        <Link href="/administration">View blockers</Link>
      </div>
      <div className="metric-grid">
        <MetricCard
          label="Provider runtime"
          value={providerConnected ? 'Connected' : 'Unavailable'}
          detail="ElevenLabs · EU workspace"
          tone={providerConnected ? 'good' : 'warning'}
        />
        <MetricCard
          label="Recent calls"
          value={String(recentCalls.length)}
          detail="Latest five transcript-only records"
        />
        <MetricCard
          label="Post-call pipeline"
          value={
            !calls.ok
              ? 'Unavailable'
              : recentCalls.some((item) => item.processingState === 'PARTIAL')
                ? 'Partial'
                : 'Nominal'
          }
          detail="Enrichment is non-blocking"
          tone={calls.ok ? 'good' : 'warning'}
        />
        <MetricCard
          label="Open operations"
          value={openOperations === null ? 'Unavailable' : String(openOperations)}
          detail="Authoritative workflow records"
          tone={openOperations === null ? 'warning' : 'good'}
        />
      </div>
      <div className="dashboard-grid">
        <Panel
          eyebrow="Runtime boundary"
          title="Receptionist status"
          action={
            <StatusPill tone={providerConnected ? 'good' : 'warning'}>
              {providerConnected ? 'IN SYNC' : 'NOT CONNECTED'}
            </StatusPill>
          }
        >
          <div className="agent-card">
            <div className="agent-orb">
              <CloudCog size={28} />
            </div>
            <div>
              <strong>Quantum Parks Receptionist</strong>
              <p>Managed voice runtime · local release authority</p>
            </div>
            <span className="version-chip">No active live release</span>
          </div>
          <div className="divider" />
          <div className="health-list">
            <div>
              <span>Provider mappings</span>
              <strong>Awaiting live workspace</strong>
            </div>
            <div>
              <span>Knowledge release</span>
              <strong>No approved content</strong>
            </div>
            <div>
              <span>Transcript webhook</span>
              <strong>Configured locally</strong>
            </div>
          </div>
        </Panel>
        <Panel
          eyebrow="Activation"
          title="Readiness score"
          action={
            <Link className="text-link" href="/administration">
              Full checklist
            </Link>
          }
        >
          <div className="score">
            <strong>{activationScore}</strong>
            <span>/ 100</span>
          </div>
          <ProgressBar value={activationScore} label="Production activation" />
          <ul className="compact-list">
            {blockers.slice(0, 3).map((blocker) => (
              <li key={blocker}>
                <span className="list-dot" />
                {blocker}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel
          eyebrow="Call intelligence"
          title="Recent conversations"
          className="wide-panel"
          action={
            <Link className="text-link" href="/calls">
              View all calls
            </Link>
          }
        >
          {recentCalls.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Conversation</th>
                    <th>Processing</th>
                    <th>Evidence</th>
                    <th>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCalls.map((call) => (
                    <tr key={call.id}>
                      <td>
                        <Link href={`/calls/${call.id}`}>
                          {call.providerConversationId ?? call.id.slice(0, 12)}
                        </Link>
                      </td>
                      <td>
                        <StatusPill tone={call.processingState === 'COMPLETED' ? 'good' : 'info'}>
                          {call.processingState ?? 'RAW STORED'}
                        </StatusPill>
                      </td>
                      <td>{call.synthetic ? 'Synthetic' : 'Live'}</td>
                      <td>
                        {call.receivedAt
                          ? new Intl.DateTimeFormat('en-GB', {
                              timeZone: 'Europe/Lisbon',
                              hour: '2-digit',
                              minute: '2-digit',
                            }).format(new Date(call.receivedAt))
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-inline">
              <ActivityIcon />
              <div>
                <strong>No calls have been ingested</strong>
                <p>Signed post-call transcripts appear here after immutable evidence storage.</p>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}

function ActivityIcon() {
  return (
    <span className="empty-activity" aria-hidden="true">
      ↳
    </span>
  );
}
