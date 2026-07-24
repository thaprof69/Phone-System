import Link from 'next/link';
import {
  DataTable,
  EmptyState,
  MetricCard,
  MetricGrid,
  Panel,
  StatusPill,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  humaniseState,
  type Column,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../../domain-page';
import { apiGet } from '../../../lib/api';
import type { Operations, WorkItem } from '../../../lib/types';

export const dynamic = 'force-dynamic';

const OPEN_STATES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS'];

type BreachRow = {
  id: string;
  conversationId: string;
  kind: string;
  reason: string;
  priority: string;
  dueAt: string | null;
  overdueByMs: number;
  href: string;
};

/**
 * The one page that answers "what has already broken a promise". It deliberately
 * mixes work types: an operator clearing a backlog cares about what is late, not
 * about which table it lives in.
 */
export default async function SlaPage() {
  const response = await apiGet<Operations>('/operations', { purpose: 'OPERATIONS' });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Operations"
        title="SLA and failures"
        description="Overdue, failed and blocked work."
      >
        <LoadFailure subject="SLA and failures" reason={response.reason} />
      </DomainPage>
    );
  }

  const { callbacks, tasks, transfers, deliveries } = response.data;
  const now = Date.now();

  const toBreach = (item: WorkItem, kind: string, href: string): BreachRow | null => {
    if (!item.dueAt || !OPEN_STATES.includes(item.status)) return null;
    const due = Date.parse(item.dueAt);
    if (due >= now) return null;
    return {
      id: item.id,
      conversationId: item.conversationId,
      kind,
      reason: item.reason,
      priority: item.priority,
      dueAt: item.dueAt,
      overdueByMs: now - due,
      href,
    };
  };

  const breaches = [
    ...callbacks.map((item) => toBreach(item, 'Callback', '/operations/callbacks')),
    ...tasks.map((item) => toBreach(item, 'Staff task', '/operations/tasks')),
  ]
    .filter((row): row is BreachRow => row !== null)
    .sort((left, right) => right.overdueByMs - left.overdueByMs);

  const failedTransfers = transfers.filter((row) => row.status !== 'COMPLETED');
  const failedMessages = deliveries.filter((row) => row.status === 'FAILED');

  const columns: Column<BreachRow>[] = [
    {
      key: 'reason',
      header: 'Work',
      render: (row) => (
        <>
          {row.reason}
          <small className="cell-sub">{row.kind}</small>
        </>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (row) => (
        <StatusPill tone={row.priority === 'HIGH' ? 'danger' : 'warning'}>
          {humaniseState(row.priority)}
        </StatusPill>
      ),
    },
    {
      key: 'overdue',
      header: 'Overdue by',
      render: (row) => (
        <span className="overdue">
          {formatRelativeTime(row.dueAt)}
          <small className="cell-sub">Due {formatDateTime(row.dueAt)}</small>
        </span>
      ),
    },
    {
      key: 'queue',
      header: 'Queue',
      render: (row) => <Link href={row.href}>{row.kind}s</Link>,
      priority: 'secondary',
    },
  ];

  return (
    <DomainPage
      eyebrow="Operations"
      title="SLA and failures"
      description="Everything that has already missed its commitment or failed outright, longest overdue first."
      meta={
        <StatusPill tone={breaches.length > 0 ? 'danger' : 'good'}>
          {formatNumber(breaches.length)} breached
        </StatusPill>
      }
    >
      <MetricGrid>
        <MetricCard
          label="Overdue callbacks"
          value={formatNumber(breaches.filter((row) => row.kind === 'Callback').length)}
          detail="Customer was promised a call back"
          tone={breaches.some((row) => row.kind === 'Callback') ? 'danger' : 'good'}
          href="/operations/callbacks?due=overdue"
        />
        <MetricCard
          label="Overdue staff tasks"
          value={formatNumber(breaches.filter((row) => row.kind === 'Staff task').length)}
          detail="Work raised from a call"
          tone={breaches.some((row) => row.kind === 'Staff task') ? 'warning' : 'good'}
          href="/operations/tasks"
        />
        <MetricCard
          label="Unanswered transfers"
          value={formatNumber(failedTransfers.length)}
          detail="Caller transferred, nobody answered"
          tone={failedTransfers.length > 0 ? 'danger' : 'good'}
          href="/operations/handoffs"
        />
        <MetricCard
          label="Failed messages"
          value={formatNumber(failedMessages.length)}
          detail="Outbound message did not reach the customer"
          tone={failedMessages.length > 0 ? 'warning' : 'good'}
          href="/operations/messages?status=FAILED"
        />
      </MetricGrid>

      <Panel
        title="Breached commitments"
        eyebrow="Longest overdue first"
        description="Callbacks and staff tasks past their due time that nobody has completed."
      >
        <DataTable
          caption="Overdue work with its priority and how long it has been outstanding"
          columns={columns}
          rows={breaches}
          getRowKey={(row) => row.id}
          rowHref={(row) => `/calls/${row.conversationId}`}
          empty={
            <EmptyState
              title="Nothing is overdue"
              detail="Every callback and staff task is either within its due time or already complete."
            />
          }
        />
      </Panel>
    </DomainPage>
  );
}
