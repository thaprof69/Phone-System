import Link from 'next/link';
import {
  Banner,
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
      key: 'receivedAt',
      header: 'Received',
      render: (row) => (
        <>
          {formatDateTime(row.receivedAt)}
          <small className="cell-sub">{formatRelativeTime(row.receivedAt)}</small>
        </>
      ),
    },
    { key: 'park', header: 'Park', render: (row) => titleCase(row.park) },
    {
      key: 'language',
      header: 'Language',
      render: (row) => (row.language ?? '—').toUpperCase(),
      priority: 'secondary',
    },
    {
      key: 'processingState',
      header: 'Processing state',
      render: (row) => (
        <StatusPill tone={toneForState(row.processingState)}>
          {humaniseState(row.processingState)}
        </StatusPill>
      ),
    },
    {
      key: 'reference',
      header: 'Provider reference',
      render: (row) => <code className="inline-code">{row.providerConversationId}</code>,
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
          caption={`${title}: calls with their park, language and processing state`}
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
