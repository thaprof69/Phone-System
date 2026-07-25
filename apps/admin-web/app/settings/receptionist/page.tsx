import Link from 'next/link';
import {
  DataTable,
  EmptyState,
  Panel,
  StatusPill,
  SyntheticBadge,
  formatDateTime,
  formatNumber,
  humaniseState,
  toneForState,
  type Column,
} from '@quantum-parks/ui';
import { SettingsPage as DomainPage, LoadFailure } from '../settings-page';
import { apiGet } from '../../../lib/api';
import type { AgentListRow, MissionControl } from '../../../lib/types';

export const dynamic = 'force-dynamic';

type AgentSummary = {
  id: string;
  name: string;
  purpose: string;
  synthetic: boolean;
  versionCount: number;
  activeVersion: number | null;
  activeState: string | null;
  draftVersion: number | null;
  latestCreatedAt: string | null;
};

export default async function AgentsPage() {
  const [agentsResponse, missionResponse] = await Promise.all([
    apiGet<{ items: AgentListRow[] }>('/agents', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<MissionControl>('/mission-control', { purpose: 'OPERATIONS' }),
  ]);

  if (!agentsResponse.ok) {
    return (
      <DomainPage
        eyebrow="Receptionist"
        title="Agents"
        description="Every receptionist agent with its live version, tests and drift state."
      >
        <LoadFailure subject="Agents" reason={agentsResponse.reason} />
      </DomainPage>
    );
  }

  // The endpoint returns one row per agent version; the list view is per agent.
  const byAgent = new Map<string, AgentSummary>();
  for (const row of agentsResponse.data.items) {
    const existing = byAgent.get(row.id);
    const summary: AgentSummary = existing ?? {
      id: row.id,
      name: row.name,
      purpose: row.purpose,
      synthetic: row.synthetic,
      versionCount: 0,
      activeVersion: null,
      activeState: null,
      draftVersion: null,
      latestCreatedAt: null,
    };
    if (row.versionId) summary.versionCount += 1;
    if (row.state === 'ACTIVE') {
      summary.activeVersion = row.version;
      summary.activeState = row.state;
    }
    if (row.state === 'DRAFT') summary.draftVersion = row.version;
    if (
      row.createdAt &&
      (!summary.latestCreatedAt || Date.parse(row.createdAt) > Date.parse(summary.latestCreatedAt))
    ) {
      summary.latestCreatedAt = row.createdAt;
    }
    byAgent.set(row.id, summary);
  }
  const agents = [...byAgent.values()];
  const mission = missionResponse.ok ? missionResponse.data : null;

  const columns: Column<AgentSummary>[] = [
    {
      key: 'name',
      header: 'Agent',
      render: (row) => (
        <>
          {row.name}
          <small className="cell-sub">{row.purpose}</small>
        </>
      ),
    },
    {
      key: 'active',
      header: 'Live version',
      render: (row) =>
        row.activeVersion !== null ? (
          <StatusPill tone="good">Version {row.activeVersion}</StatusPill>
        ) : (
          <StatusPill tone="danger">None published</StatusPill>
        ),
    },
    {
      key: 'draft',
      header: 'In progress',
      render: (row) =>
        row.draftVersion !== null ? (
          <StatusPill tone="warning">Version {row.draftVersion} draft</StatusPill>
        ) : (
          <span className="muted-cell">Nothing pending</span>
        ),
    },
    {
      key: 'sync',
      header: 'Provider sync',
      render: () =>
        mission ? (
          <StatusPill tone={toneForState(mission.receptionist.syncState)}>
            {humaniseState(mission.receptionist.syncState)}
          </StatusPill>
        ) : (
          <span className="muted-cell">Unknown</span>
        ),
    },
    {
      key: 'versions',
      header: 'Versions',
      align: 'end',
      render: (row) => formatNumber(row.versionCount),
      priority: 'secondary',
    },
    {
      key: 'updated',
      header: 'Last change',
      render: (row) => formatDateTime(row.latestCreatedAt),
      priority: 'secondary',
    },
    {
      key: 'origin',
      header: 'Origin',
      render: (row) => (row.synthetic ? <SyntheticBadge compact /> : 'Live'),
      priority: 'secondary',
    },
  ];

  return (
    <DomainPage
      eyebrow="Receptionist"
      title="Agents"
      description="The agent that answers the telephone. Quantum Parks holds the approved configuration; ElevenLabs runs a published copy of it."
      meta={<StatusPill tone="neutral">{formatNumber(agents.length)} agents</StatusPill>}
      actions={
        <Link className="button secondary" href="/settings/receptionist/releases">
          Release pipeline
        </Link>
      }
    >
      <Panel
        title={`${formatNumber(agents.length)} ${agents.length === 1 ? 'agent' : 'agents'}`}
        eyebrow="Local records are authoritative"
      >
        <DataTable
          caption="Agents with their live version, work in progress and provider synchronisation state"
          columns={columns}
          rows={agents}
          getRowKey={(row) => row.id}
          rowHref={(row) => `/receptionist/agents/${row.id}`}
          empty={
            <EmptyState
              title="No agents configured"
              detail="An agent is created here, versioned, approved, tested and then published to the voice runtime."
            />
          }
        />
      </Panel>
    </DomainPage>
  );
}
