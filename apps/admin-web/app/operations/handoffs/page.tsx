import {
  Banner,
  DataTable,
  EmptyState,
  Panel,
  StatusPill,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelativeTime,
  humaniseState,
  toneForState,
  type Column,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../../domain-page';
import { QueueActions } from '../queue-actions';
import { apiGet } from '../../../lib/api';
import type { HandoffRow, Operations } from '../../../lib/types';

export const dynamic = 'force-dynamic';

export default async function HandoffsPage() {
  const response = await apiGet<Operations>('/operations', { purpose: 'OPERATIONS' });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Operations"
        title="Handoffs"
        description="Live transfers from the receptionist to a person."
      >
        <LoadFailure subject="Handoffs" reason={response.reason} />
      </DomainPage>
    );
  }

  const all = response.data.transfers;
  const failed = all.filter((row) => row.status !== 'COMPLETED');
  // Unanswered transfers first: a caller was passed to a person and nobody picked up.
  const rows = [...all].sort(
    (left, right) =>
      Number(right.status !== 'COMPLETED') - Number(left.status !== 'COMPLETED') ||
      Date.parse(right.requestedAt) - Date.parse(left.requestedAt),
  );

  const columns: Column<HandoffRow>[] = [
    {
      key: 'requestedAt',
      header: 'Requested',
      render: (row) => (
        <>
          {formatDateTime(row.requestedAt)}
          <small className="cell-sub">{formatRelativeTime(row.requestedAt)}</small>
        </>
      ),
    },
    { key: 'routeKey', header: 'Queue', render: (row) => humaniseState(row.routeKey) },
    {
      key: 'status',
      header: 'Answer',
      render: (row) => (
        <StatusPill tone={row.status === 'COMPLETED' ? 'good' : 'danger'}>
          {humaniseState(row.status)}
        </StatusPill>
      ),
    },
    {
      key: 'duration',
      header: 'Time to answer',
      align: 'end',
      render: (row) =>
        row.completedAt ? (
          formatDuration((Date.parse(row.completedAt) - Date.parse(row.requestedAt)) / 1000)
        ) : (
          <span className="muted-cell">Never answered</span>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => <QueueActions kind="handoffs" id={row.id} status={row.status} />,
    },
    {
      key: 'fallback',
      header: 'Fallback',
      render: (row) =>
        row.status === 'COMPLETED' ? (
          <span className="muted-cell">Not needed</span>
        ) : (
          'Callback created'
        ),
      priority: 'secondary',
    },
  ];

  return (
    <DomainPage
      eyebrow="Operations"
      title="Handoffs"
      description="Live transfers from the receptionist to a person, whether they were answered, and what happened when they were not."
      meta={
        <StatusPill tone={failed.length > 0 ? 'danger' : 'good'}>
          {formatNumber(failed.length)} unanswered
        </StatusPill>
      }
    >
      {failed.length > 0 ? (
        <Banner tone="warning" title={`${formatNumber(failed.length)} transfers were not answered`}>
          When a transfer is not answered the receptionist creates a callback rather than leaving
          the caller without a route. Those callbacks appear in the callback queue.
        </Banner>
      ) : null}

      <Panel
        title={`${formatNumber(all.length)} ${all.length === 1 ? 'transfer' : 'transfers'}`}
        eyebrow="Unanswered first"
      >
        <DataTable
          caption="Transfers with their target queue, answer state and time to answer"
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          rowHref={(row) => `/calls/${row.conversationId}`}
          empty={
            <EmptyState
              title="No transfers recorded"
              detail="No call has been passed from the receptionist to a person."
            />
          }
        />
      </Panel>
    </DomainPage>
  );
}
