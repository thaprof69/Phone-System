import {
  DataTable,
  EmptyState,
  Panel,
  StatusPill,
  formatNumber,
  formatRelativeTime,
  humaniseState,
  toneForState,
  type Column,
  type Tone,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../../domain-page';
import { apiGet } from '../../../lib/api';

export const dynamic = 'force-dynamic';

type KnowledgeRow = {
  id: string;
  title: string;
  category: string;
  park: string | null;
  language: string;
  riskClass: string;
  versionId: string | null;
  version: number | null;
  state: string | null;
  effectiveAt: string | null;
  expiresAt: string | null;
};

const AWAITING_STATES = ['DRAFT', 'IN_REVIEW'];

function riskTone(risk: string): Tone {
  if (risk === 'HIGH') return 'danger';
  if (risk === 'MEDIUM') return 'warning';
  return 'neutral';
}

export default async function KnowledgeReviewPage() {
  const response = await apiGet<{ items: KnowledgeRow[] }>('/knowledge', {
    purpose: 'RELEASE_MANAGEMENT',
  });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Knowledge"
        title="Review queue"
        description="Changes waiting for an independent approver."
      >
        <LoadFailure subject="Review queue" reason={response.reason} />
      </DomainPage>
    );
  }

  const awaiting = response.data.items
    .filter((row) => row.state && AWAITING_STATES.includes(row.state))
    // Highest risk first: high-risk content requires an approver who is not the author.
    .sort(
      (left, right) =>
        ({ HIGH: 0, MEDIUM: 1, LOW: 2 })[left.riskClass as 'HIGH'] -
        { HIGH: 0, MEDIUM: 1, LOW: 2 }[right.riskClass as 'HIGH'],
    );

  const highRisk = awaiting.filter((row) => row.riskClass === 'HIGH');

  const columns: Column<KnowledgeRow>[] = [
    {
      key: 'title',
      header: 'Waiting for review',
      render: (row) => (
        <>
          {row.title}
          <small className="cell-sub">
            {humaniseState(row.category)} · {row.language.toUpperCase()}
            {row.park ? ` · ${row.park}` : ''}
          </small>
        </>
      ),
    },
    {
      key: 'risk',
      header: 'Risk',
      render: (row) => (
        <StatusPill tone={riskTone(row.riskClass)}>{humaniseState(row.riskClass)}</StatusPill>
      ),
    },
    {
      key: 'state',
      header: 'State',
      render: (row) => (
        <StatusPill tone={toneForState(row.state)}>{humaniseState(row.state)}</StatusPill>
      ),
    },
    {
      key: 'requirement',
      header: 'Approval requirement',
      render: (row) =>
        row.riskClass === 'HIGH'
          ? 'Independent approver required'
          : 'Any approver with knowledge authority',
    },
    {
      key: 'version',
      header: 'Version',
      align: 'end',
      render: (row) => (row.version === null ? '—' : `v${row.version}`),
      priority: 'secondary',
    },
  ];

  return (
    <DomainPage
      eyebrow="Knowledge"
      title="Review queue"
      description="Knowledge that is drafted but not yet approved. Nothing here is visible to callers."
      meta={
        <>
          <StatusPill tone={awaiting.length > 0 ? 'warning' : 'good'}>
            {formatNumber(awaiting.length)} waiting
          </StatusPill>
          {highRisk.length > 0 ? (
            <StatusPill tone="danger">{formatNumber(highRisk.length)} high risk</StatusPill>
          ) : null}
        </>
      }
    >
      <Panel
        title="Awaiting approval"
        eyebrow="Highest risk first"
        description="High-risk content cannot be approved by the person who wrote it. The server rejects that transition."
      >
        <DataTable
          caption="Knowledge awaiting approval with its risk class and approval requirement"
          columns={columns}
          rows={awaiting}
          getRowKey={(row) => row.versionId ?? row.id}
          rowHref={(row) => `/knowledge/${row.id}`}
          empty={
            <EmptyState
              title="Nothing is waiting for review"
              detail="Every knowledge change has been approved or withdrawn."
            />
          }
        />
      </Panel>
    </DomainPage>
  );
}
