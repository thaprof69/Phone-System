import Link from 'next/link';
import { RefreshCcw } from 'lucide-react';
import { EmptyState, Panel, StatusPill } from '@quantum-parks/ui';
import { apiGet } from '../../lib/api';
import { AppShell, PageHeading } from '../shell';
import { RecordActions, SectionActions } from '../section-actions';

const sections = {
  'agent-studio': {
    active: 'Agent Studio',
    eyebrow: 'Configuration & release',
    title: 'Agent Studio',
    description:
      'Author, test, approve, publish, verify, and roll back locally governed agent releases.',
    action: 'New agent draft',
    tabs: ['Agents', 'Releases', 'Prompt policies', 'Tools & transfers'],
    empty: 'No locally governed agent release exists',
    detail:
      'Create a draft to begin. Publication stays blocked until approvals, mandatory tests, provider capabilities, and read-back verification pass.',
  },
  knowledge: {
    active: 'Knowledge Hub',
    eyebrow: 'Approved company truth',
    title: 'Knowledge Hub',
    description:
      'Manage versioned, effective, park-specific knowledge published as runtime copies.',
    action: 'Create knowledge',
    tabs: ['Documents', 'Review queue', 'Releases', 'Knowledge gaps'],
    empty: 'No approved company knowledge',
    detail:
      'Draft facts, policies, schedules, and SOPs here. High-risk content requires independent approval.',
  },
  voices: {
    active: 'Voice Library',
    eyebrow: 'Voice governance',
    title: 'Voice Library',
    description:
      'Discover, compare, approve, and assign voices without exposing provider credentials.',
    action: 'Refresh catalogue',
    tabs: ['Available voices', 'Assignments', 'Approvals', 'Capability status'],
    empty: 'Provider voice catalogue unavailable',
    detail:
      'Connect a verified workspace to discover API-supported voices. Custom voices remain disabled.',
  },
  tests: {
    active: 'Test Studio',
    eyebrow: 'Release evidence',
    title: 'Test Studio',
    description:
      'Run factual, behavioural, tool, safety, multilingual, injection, and regression suites.',
    action: 'New test case',
    tabs: ['Test cases', 'Suites', 'Runs', 'Release gates'],
    empty: 'No test evidence yet',
    detail:
      'Every publication requires passing mandatory scenarios and exact provider-run mappings.',
  },
  calls: {
    active: 'Calls',
    eyebrow: 'Canonical history',
    title: 'Calls',
    description:
      'Search signed provider evidence, canonical transcripts, intelligence, outcomes, and corrections.',
    action: 'Reconcile history',
    tabs: ['All calls', 'Partial processing', 'Failed ingestion', 'Corrections'],
    empty: 'No canonical calls found',
    detail:
      'Calls appear after signed evidence is durably stored. Provider analysis remains metadata, never authoritative intelligence.',
  },
  operations: {
    active: 'Operations',
    eyebrow: 'Trusted workflows',
    title: 'Operations',
    description: 'Own handoffs, callbacks, staff tasks, messages, failures, and SLA escalation.',
    action: 'Create task',
    tabs: ['Handoffs', 'Callbacks', 'Staff tasks', 'Message delivery'],
    empty: 'No operational work is open',
    detail:
      'Only deterministic provider, workflow, delivery, or business-system events create completed outcomes.',
  },
  analytics: {
    active: 'Analytics',
    eyebrow: 'Evidence-linked insight',
    title: 'Analytics',
    description:
      'Explore call demand, intent, language, knowledge gaps, release quality, and provider performance.',
    action: 'Configure view',
    tabs: ['Demand', 'Knowledge', 'Quality', 'Provider & cost'],
    empty: 'Not enough canonical history',
    detail: 'Aggregates become available after eligible, redacted call records are processed.',
  },
  reports: {
    active: 'Reports',
    eyebrow: 'Governed exports',
    title: 'Reports',
    description:
      'Schedule operational, strategic, quality, cost, and restricted reports with full lineage.',
    action: 'New report',
    tabs: ['Scheduled', 'Completed', 'Templates', 'Delivery'],
    empty: 'No reports have run',
    detail: 'Exports require purpose, masking, authorization, lineage, and audited delivery.',
  },
} as const;

export default async function SectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ result?: string; detail?: string }>;
}) {
  const { section: key } = await params;
  const result = await searchParams;
  const section = sections[key as keyof typeof sections];
  if (!section)
    return (
      <AppShell>
        <PageHeading
          eyebrow="Not found"
          title="Unknown workspace"
          description="This control-plane area is not registered."
        />
      </AppShell>
    );
  const records = await loadSectionRecords(key);
  return (
    <AppShell active={section.active}>
      <PageHeading
        eyebrow={section.eyebrow}
        title={section.title}
        description={section.description}
        actions={
          <Link className="button primary" href={`/${key}`} title="Refresh authoritative records">
            <RefreshCcw size={16} />
            Refresh records
          </Link>
        }
      />
      {result.result ? (
        <div
          className={
            result.result === 'SUCCESS' || result.result === 'CREATED'
              ? 'notice success'
              : 'notice warning'
          }
          role="status"
        >
          <div>
            <strong>{result.result.replaceAll('_', ' ')}</strong>
            {result.detail ? <p>{result.detail}</p> : null}
          </div>
        </div>
      ) : null}
      <SectionActions section={key} />
      <div className="section-toolbar">
        <div className="tabs" aria-label={`${section.title} record categories`}>
          {section.tabs.map((tab, index) => (
            <span key={tab} className={index === 0 ? 'active' : undefined}>
              {tab}
            </span>
          ))}
        </div>
      </div>
      {records && records.length > 0 ? (
        <Panel title={section.tabs[0]} eyebrow="Authoritative local records">
          <div className="record-list">
            {records.map((record) => (
              <article className="record-row" key={record.id}>
                <div>
                  <strong>{record.label}</strong>
                  <p>{record.detail}</p>
                </div>
                <div className="record-controls">
                  <StatusPill tone={record.tone}>{record.state}</StatusPill>
                  <RecordActions
                    section={key}
                    id={record.id}
                    state={record.state}
                    {...(record.kind ? { kind: record.kind } : {})}
                  />
                </div>
              </article>
            ))}
          </div>
        </Panel>
      ) : (
        <Panel title={section.tabs[0]} eyebrow="Authoritative local records">
          <EmptyState
            title={section.empty}
            detail={section.detail}
            action={
              <span className="capability-note">
                {section.action} · use the governed API workflow when authorized
              </span>
            }
          />
        </Panel>
      )}
    </AppShell>
  );
}

type RecordRow = {
  id: string;
  label: string;
  detail: string;
  state: string;
  tone: 'good' | 'warning' | 'danger' | 'info' | 'neutral';
  kind?: string;
};

async function loadSectionRecords(key: string): Promise<RecordRow[] | null> {
  if (key === 'agent-studio') {
    const response = await apiGet<{
      items: Array<{
        id: string;
        name: string;
        state?: string;
        version?: number;
        versionId?: string;
      }>;
    }>('/agents');
    return response.ok
      ? response.data.items.map((item) => ({
          id: item.versionId ?? item.id,
          label: item.name,
          detail: `Local version ${item.version ?? 'draft'} · provider mappings remain subordinate`,
          state: item.state ?? 'DRAFT',
          tone: item.state === 'ACTIVE' ? 'good' : 'warning',
        }))
      : null;
  }
  if (key === 'knowledge') {
    const response = await apiGet<{
      items: Array<{
        id: string;
        title: string;
        language: string;
        state?: string;
        versionId?: string;
      }>;
    }>('/knowledge');
    return response.ok
      ? response.data.items.map((item) => ({
          id: item.versionId ?? item.id,
          label: item.title,
          detail: `${item.language} · approved company truth only`,
          state: item.state ?? 'DRAFT',
          tone: item.state === 'ACTIVE' ? 'good' : 'warning',
        }))
      : null;
  }
  if (key === 'voices') {
    const response = await apiGet<{
      status: string;
      data?: Array<{
        id: string;
        providerVoiceId: string;
        name: string;
        approved: boolean;
        available: boolean;
      }>;
    }>('/voices');
    return response.ok && response.data.status === 'SUCCESS'
      ? (response.data.data ?? []).map((item) => ({
          id: item.id,
          label: item.name,
          detail: `${item.providerVoiceId} · mapped remote runtime voice`,
          state: item.approved ? 'APPROVED' : item.available ? 'AVAILABLE' : 'UNAVAILABLE',
          tone: item.approved ? 'good' : item.available ? 'info' : 'warning',
        }))
      : null;
  }
  if (key === 'calls') {
    const response = await apiGet<{
      items: Array<{ id: string; providerConversationId: string; processingState: string }>;
    }>('/calls?limit=50');
    return response.ok
      ? response.data.items.map((item) => ({
          id: item.id,
          label: item.providerConversationId,
          detail: 'Signed provider evidence with separate canonical records',
          state: item.processingState,
          tone: item.processingState === 'COMPLETED' ? 'good' : 'warning',
        }))
      : null;
  }
  if (key === 'tests') {
    const response = await apiGet<{
      tests: Array<{ id: string; name: string; testType: string; riskLevel: string }>;
      runs: Array<{ id: string; status: string; passCount: number; failCount: number }>;
    }>('/test-suites');
    return response.ok
      ? [
          ...response.data.tests.map((item) => ({
            id: item.id,
            label: item.name,
            detail: `${item.testType} · ${item.riskLevel} risk`,
            state: 'VERSIONED',
            tone: 'info' as const,
          })),
          ...response.data.runs.map((item) => ({
            id: item.id,
            label: `Test run ${item.id.slice(0, 8)}`,
            detail: `${item.passCount} passed · ${item.failCount} failed`,
            state: item.status,
            tone:
              item.status === 'COMPLETED' && item.failCount === 0
                ? ('good' as const)
                : ('warning' as const),
            kind: 'run',
          })),
        ]
      : null;
  }
  if (key === 'operations') {
    const response = await apiGet<{
      transfers: Array<{ id: string; status: string; routeKey: string }>;
      callbacks: Array<{ id: string; status: string; reason: string }>;
      tasks: Array<{ id: string; status: string; reason: string }>;
      deliveries: Array<{ id: string; status: string; channel: string }>;
    }>('/operations');
    return response.ok
      ? [
          ...response.data.transfers.map((item) => ({
            id: item.id,
            label: `Handoff · ${item.routeKey}`,
            detail: 'Provider transfer evidence',
            state: item.status,
            tone: item.status === 'COMPLETED' ? ('good' as const) : ('warning' as const),
          })),
          ...response.data.callbacks.map((item) => ({
            id: item.id,
            label: item.reason,
            detail: 'Persisted callback request',
            state: item.status,
            tone: item.status === 'COMPLETED' ? ('good' as const) : ('warning' as const),
          })),
          ...response.data.tasks.map((item) => ({
            id: item.id,
            label: item.reason,
            detail: 'Persisted staff task',
            state: item.status,
            tone: item.status === 'COMPLETED' ? ('good' as const) : ('warning' as const),
            kind: 'task',
          })),
          ...response.data.deliveries.map((item) => ({
            id: item.id,
            label: `${item.channel} delivery`,
            detail: 'Provider delivery receipt',
            state: item.status,
            tone: item.status === 'DELIVERED' ? ('good' as const) : ('warning' as const),
          })),
        ]
      : null;
  }
  if (key === 'analytics') {
    const response = await apiGet<{
      eligibleConversationCount: number;
      syntheticConversationCount: number;
      intentCounts: Array<{ intent: string; count: number }>;
    }>('/analytics/summary');
    return response.ok
      ? response.data.intentCounts.map((item) => ({
          id: item.intent,
          label: item.intent,
          detail: `${item.count} eligible classifications · synthetic records remain excluded from production claims`,
          state: 'EVIDENCE LINKED',
          tone: 'info',
        }))
      : null;
  }
  if (key === 'reports') {
    const response = await apiGet<{
      definitions: Array<{ id: string; key: string; active: boolean; classification: string }>;
      runs: Array<{ id: string; status: string; checksum?: string }>;
    }>('/reports');
    return response.ok
      ? [
          ...response.data.definitions.map((item) => ({
            id: item.id,
            label: item.key,
            detail: `${item.classification} governed report definition`,
            state: item.active ? 'ACTIVE' : 'INACTIVE',
            tone: item.active ? ('good' as const) : ('neutral' as const),
          })),
          ...response.data.runs.map((item) => ({
            id: item.id,
            label: `Report run ${item.id.slice(0, 8)}`,
            detail: item.checksum
              ? `Checksum ${item.checksum.slice(0, 12)}…`
              : 'No export artifact',
            state: item.status,
            tone: item.status === 'COMPLETED' ? ('good' as const) : ('warning' as const),
          })),
        ]
      : null;
  }
  return null;
}
