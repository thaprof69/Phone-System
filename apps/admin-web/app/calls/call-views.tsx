import Link from 'next/link';
import {
  Banner,
  DataTable,
  EmptyState,
  Panel,
  StatusPill,
  SyntheticBadge,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  humaniseState,
  toneForState,
  type Column,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../domain-page';
import { apiGet } from '../../lib/api';
import type { CallRow } from '../../lib/types';

/**
 * The Calls domain has several views over the same collection, distinguished by
 * processing state. They share this renderer so a column added to one appears in
 * all of them, rather than four near-copies drifting apart.
 */
export async function CallStateView({
  title,
  description,
  states,
  emptyTitle,
  emptyDetail,
  banner,
}: {
  title: string;
  description: string;
  states: readonly string[];
  emptyTitle: string;
  emptyDetail: string;
  banner?: { tone: 'warning' | 'danger' | 'info'; title: string; body: string };
}) {
  const response = await apiGet<{ items: CallRow[] }>('/calls?limit=100', {
    purpose: 'OPERATIONS',
  });

  if (!response.ok) {
    return (
      <DomainPage eyebrow="Calls" title={title} description={description}>
        <LoadFailure subject={title} reason={response.reason} />
      </DomainPage>
    );
  }

  const rows = response.data.items.filter((row) => states.includes(row.processingState));

  const columns: Column<CallRow>[] = [
    {
      key: 'call',
      header: 'Call',
      render: (row) => <span className="call-list-title">{callTitle(row)}</span>,
      width: '36%',
    },
    {
      key: 'reason',
      header: 'Call reason',
      render: (row) => humaniseState(row.intent ?? 'Unclassified'),
    },
    { key: 'park', header: 'Park', render: (row) => titleCase(row.park) },
    {
      key: 'receivedAt',
      header: 'Received',
      render: (row) => (
        <>
          {formatDateTime(row.receivedAt)}
          <small className="cell-sub">{formatRelativeTime(row.receivedAt)}</small>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusPill tone={toneForState(row.callStatus)}>{humaniseState(row.callStatus)}</StatusPill>
      ),
    },
    {
      key: 'origin',
      header: 'Origin',
      render: (row) =>
        row.origin === 'SYNTHETIC' ? (
          <SyntheticBadge compact />
        ) : (
          <StatusPill tone={row.origin === 'SIMULATION' ? 'info' : 'neutral'}>
            {humaniseState(row.origin)}
          </StatusPill>
        ),
    },
    {
      key: 'language',
      header: 'Language',
      render: (row) => (row.language ?? '—').toUpperCase(),
      priority: 'secondary',
    },
  ];

  return (
    <DomainPage
      eyebrow="Calls"
      title={title}
      description={description}
      meta={
        <StatusPill tone={rows.length === 0 ? 'good' : 'warning'}>
          {formatNumber(rows.length)} affected
        </StatusPill>
      }
    >
      {banner && rows.length > 0 ? (
        <Banner
          tone={banner.tone}
          title={banner.title}
          action={
            <Link className="button ghost small" href="/calls/reconciliation">
              Reconciliation
            </Link>
          }
        >
          {banner.body}
        </Banner>
      ) : null}

      <Panel
        title={`${formatNumber(rows.length)} ${rows.length === 1 ? 'call' : 'calls'}`}
        eyebrow="Most recent first"
      >
        <DataTable
          caption={`${title}: calls with their summary, reason, park, status and origin`}
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          rowHref={(row) => `/calls/${row.id}`}
          empty={<EmptyState title={emptyTitle} detail={emptyDetail} />}
        />
      </Panel>
    </DomainPage>
  );
}

function titleCase(value: string | null): string {
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function callTitle(row: CallRow): string {
  if (row.summary?.trim()) return row.summary.trim();
  const reason = humaniseState(row.intent ?? 'Unclassified');
  return row.park ? `${reason} at ${titleCase(row.park)}` : reason;
}
