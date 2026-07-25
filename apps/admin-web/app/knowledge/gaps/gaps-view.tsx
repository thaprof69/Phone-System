import {
  Banner,
  DataTable,
  EmptyState,
  Panel,
  StatusPill,
  formatNumber,
  formatRelativeTime,
  humaniseState,
  toneForState,
  type Column,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../../domain-page';
import { apiGet } from '../../../lib/api';
import { ConvertGapButton } from './gap-actions';

export type GapRow = {
  id: string;
  title: string;
  language: string;
  park: string | null;
  frequency: number;
  evidenceIds: string[];
  status: string;
  ownerId: string | null;
  createdAt: string;
};

/**
 * Knowledge gaps appear in two domains: as content work in Knowledge, and as an
 * insight in Intelligence. Same records, same view, one implementation.
 */
export async function KnowledgeGapsView({ eyebrow }: { eyebrow: 'Knowledge' | 'Intelligence' }) {
  const response = await apiGet<{ items: GapRow[] }>('/knowledge-gaps', {
    purpose: eyebrow === 'Intelligence' ? 'ANALYTICS' : 'RELEASE_MANAGEMENT',
  });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow={eyebrow}
        title="Knowledge gaps"
        description="Questions callers asked that approved knowledge could not answer."
      >
        <LoadFailure subject="Knowledge gaps" reason={response.reason} />
      </DomainPage>
    );
  }

  const gaps = response.data.items;
  const open = gaps.filter((gap) => gap.status === 'OPEN');
  const totalAsks = gaps.reduce((sum, gap) => sum + gap.frequency, 0);

  const columns: Column<GapRow>[] = [
    {
      key: 'title',
      header: 'Question',
      render: (gap) => (
        <>
          {gap.title}
          <small className="cell-sub">
            {gap.language.toUpperCase()}
            {gap.park ? ` · ${titleCase(gap.park)}` : ' · all parks'}
          </small>
        </>
      ),
    },
    {
      key: 'frequency',
      header: 'Times asked',
      align: 'end',
      render: (gap) => <strong>{formatNumber(gap.frequency)}</strong>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (gap) => (
        <StatusPill tone={toneForState(gap.status)}>{humaniseState(gap.status)}</StatusPill>
      ),
    },
    {
      key: 'owner',
      header: 'Owner',
      render: (gap) =>
        gap.ownerId ? (
          <code className="inline-code">{gap.ownerId.slice(0, 8)}</code>
        ) : (
          <span className="muted-cell">Unassigned</span>
        ),
    },
    {
      key: 'evidence',
      header: 'Evidence',
      align: 'end',
      render: (gap) => `${formatNumber(gap.evidenceIds.length)} calls`,
      priority: 'secondary',
    },
    {
      key: 'detected',
      header: 'First detected',
      render: (gap) => formatRelativeTime(gap.createdAt),
      priority: 'secondary',
    },
    ...(eyebrow === 'Knowledge'
      ? [
          {
            key: 'convert',
            header: 'Action',
            render: (gap: GapRow) =>
              gap.status === 'OPEN' ? (
                <ConvertGapButton gapId={gap.id} />
              ) : (
                <span className="muted-cell">{humaniseState(gap.status)}</span>
              ),
          } satisfies Column<GapRow>,
        ]
      : []),
  ];

  return (
    <DomainPage
      eyebrow={eyebrow}
      title="Knowledge gaps"
      description="Questions callers asked that approved knowledge could not answer, ranked by how often they came up."
      meta={
        <>
          <StatusPill tone={open.length > 0 ? 'warning' : 'good'}>
            {formatNumber(open.length)} unassigned
          </StatusPill>
          <StatusPill tone="neutral">{formatNumber(totalAsks)} asks</StatusPill>
        </>
      }
    >
      <Banner tone="info" title="Gaps are detected, never answered automatically">
        A gap becomes knowledge only when a person drafts it and an approver signs it off. Nothing
        here is published to the voice runtime on its own.
      </Banner>

      <Panel
        title="Detected gaps"
        eyebrow="Most asked first"
        description="Each gap links to the calls that evidence it, so the wording can be checked before anything is written."
      >
        <DataTable
          caption="Knowledge gaps with how often they were asked, their status and supporting evidence"
          columns={columns}
          rows={gaps}
          getRowKey={(gap) => gap.id}
          empty={
            <EmptyState
              title="No knowledge gaps detected"
              detail="Every question callers asked was covered by approved knowledge."
            />
          }
        />
      </Panel>
    </DomainPage>
  );
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
