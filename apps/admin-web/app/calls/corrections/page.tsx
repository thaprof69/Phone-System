import {
  DataTable,
  EmptyState,
  Panel,
  StatusPill,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  humaniseState,
  toneForState,
  type Column,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../../domain-page';
import { apiGet } from '../../../lib/api';
import { DecideCorrectionForm } from '../call-actions';

export const dynamic = 'force-dynamic';

type CorrectionRow = {
  id: string;
  conversationId: string;
  targetType: string;
  status: string;
  reason: string;
  revision: number;
  proposedBy: string;
  decidedBy: string | null;
  decidedAt: string | null;
  appliedAt: string | null;
  createdAt: string;
  park: string | null;
  language: string | null;
  historyCount: number;
};

export default async function CorrectionsPage() {
  const response = await apiGet<{ items: CorrectionRow[] }>('/corrections', {
    purpose: 'QUALITY_REVIEW',
  });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Calls"
        title="Corrections"
        description="Proposed and applied corrections, with their full history."
      >
        <LoadFailure subject="Corrections" reason={response.reason} />
      </DomainPage>
    );
  }

  const items = response.data.items;
  const awaiting = items.filter((item) => item.status === 'PROPOSED');

  const columns: Column<CorrectionRow>[] = [
    {
      key: 'reason',
      header: 'Correction',
      render: (row) => (
        <>
          {row.reason}
          <small className="cell-sub">
            {humaniseState(row.targetType)} · revision {row.revision}
          </small>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusPill tone={toneForState(row.status)}>{humaniseState(row.status)}</StatusPill>
      ),
    },
    {
      key: 'park',
      header: 'Call',
      render: (row) => `${titleCase(row.park)} · ${(row.language ?? '—').toUpperCase()}`,
      priority: 'secondary',
    },
    {
      key: 'createdAt',
      header: 'Proposed',
      render: (row) => (
        <>
          {formatDateTime(row.createdAt)}
          <small className="cell-sub">{formatRelativeTime(row.createdAt)}</small>
        </>
      ),
    },
    {
      key: 'decided',
      header: 'Decision',
      render: (row) =>
        row.decidedAt ? (
          formatDateTime(row.decidedAt)
        ) : (
          <span className="muted-cell">Awaiting review</span>
        ),
      priority: 'secondary',
    },
    {
      key: 'history',
      header: 'History',
      align: 'end',
      render: (row) => `${formatNumber(row.historyCount)} entries`,
      priority: 'secondary',
    },
    {
      key: 'decide',
      header: 'Decision',
      // Always mounted, never swapped for a plain status label: a successful decision
      // flips `row.status` away from PROPOSED on the very next server render, and a
      // component that gets unmounted the instant it succeeds takes its own "Saved"
      // confirmation down with it.
      render: (row) => (
        <details className="row-actions">
          <summary>Decide</summary>
          <div className="row-actions-body">
            <DecideCorrectionForm correctionId={row.id} alreadyDecided={row.status} />
          </div>
        </details>
      ),
    },
  ];

  return (
    <DomainPage
      eyebrow="Calls"
      title="Corrections"
      description="Human corrections to transcripts, summaries and classifications. The original record is never overwritten — every state change is retained."
      meta={
        <StatusPill tone={awaiting.length > 0 ? 'warning' : 'good'}>
          {formatNumber(awaiting.length)} awaiting review
        </StatusPill>
      }
    >
      <Panel
        title={`${formatNumber(items.length)} ${items.length === 1 ? 'correction' : 'corrections'}`}
        eyebrow="Most recent first"
        description="A correction creates a new revision. The record it corrects is preserved for audit."
      >
        <DataTable
          caption="Corrections with their status, source call and decision history"
          columns={columns}
          rows={items}
          getRowKey={(row) => row.id}
          rowHref={(row) => `/calls/${row.conversationId}`}
          empty={
            <EmptyState
              title="No corrections proposed"
              detail="Reviewers can propose a correction from any call record when a transcript or classification is wrong."
            />
          }
        />
      </Panel>
    </DomainPage>
  );
}

function titleCase(value: string | null): string {
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1);
}
