import {
  DataTable,
  EmptyState,
  FilterBar,
  Panel,
  SelectField,
  StatusPill,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  humaniseState,
  toneForState,
  type Column,
  type Tone,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../domain-page';
import { apiGet } from '../../lib/api';
import { readParam, type SearchParams } from '../../lib/list-view';
import type { Operations, WorkItem } from '../../lib/types';

const OPEN_STATES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS'];

/** Priority is free text in the schema, so the ordering is declared here. */
const PRIORITY_RANK: Record<string, number> = { HIGH: 0, NORMAL: 1, LOW: 2 };

function priorityTone(priority: string): Tone {
  if (priority === 'HIGH') return 'danger';
  if (priority === 'NORMAL') return 'warning';
  return 'neutral';
}

/**
 * Callbacks and staff tasks share a schema and a workflow, so they share this view.
 * Overdue work is surfaced first: an operator opening this page needs to know what
 * has already broken a promise before what is merely outstanding.
 */
export async function WorkQueue({
  kind,
  title,
  description,
  emptyTitle,
  emptyDetail,
  params,
  pathname,
}: {
  kind: 'callbacks' | 'tasks';
  title: string;
  description: string;
  emptyTitle: string;
  emptyDetail: string;
  params: SearchParams;
  pathname: string;
}) {
  const response = await apiGet<Operations>('/operations', { purpose: 'OPERATIONS' });

  if (!response.ok) {
    return (
      <DomainPage eyebrow="Operations" title={title} description={description}>
        <LoadFailure subject={title} reason={response.reason} />
      </DomainPage>
    );
  }

  const all: WorkItem[] = response.data[kind] ?? [];
  const now = Date.now();
  const isOverdue = (item: WorkItem) =>
    Boolean(item.dueAt) &&
    Date.parse(item.dueAt as string) < now &&
    OPEN_STATES.includes(item.status);

  const statusFilter = readParam(params, 'status');
  const dueFilter = readParam(params, 'due');

  const filtered = all.filter((item) => {
    if (statusFilter && item.status !== statusFilter) return false;
    if (dueFilter === 'overdue' && !isOverdue(item)) return false;
    if (dueFilter === 'open' && !OPEN_STATES.includes(item.status)) return false;
    return true;
  });

  // Overdue first, then by priority, then by due time.
  const rows = [...filtered].sort((left, right) => {
    const overdueDelta = Number(isOverdue(right)) - Number(isOverdue(left));
    if (overdueDelta !== 0) return overdueDelta;
    const priorityDelta =
      (PRIORITY_RANK[left.priority] ?? 3) - (PRIORITY_RANK[right.priority] ?? 3);
    if (priorityDelta !== 0) return priorityDelta;
    return (
      (left.dueAt ? Date.parse(left.dueAt) : Infinity) -
      (right.dueAt ? Date.parse(right.dueAt) : Infinity)
    );
  });

  const overdueCount = all.filter(isOverdue).length;
  const openCount = all.filter((item) => OPEN_STATES.includes(item.status)).length;

  const columns: Column<WorkItem>[] = [
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => (
        <>
          {row.reason}
          <small className="cell-sub">Raised {formatRelativeTime(row.createdAt)}</small>
        </>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (row) => (
        <StatusPill tone={priorityTone(row.priority)}>{humaniseState(row.priority)}</StatusPill>
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
      key: 'dueAt',
      header: 'Due',
      render: (row) => {
        if (!row.dueAt) return <span className="muted-cell">No due time</span>;
        return isOverdue(row) ? (
          <span className="overdue">
            {formatRelativeTime(row.dueAt)}
            <small className="cell-sub">{formatDateTime(row.dueAt)}</small>
          </span>
        ) : (
          <>
            {formatRelativeTime(row.dueAt)}
            <small className="cell-sub">{formatDateTime(row.dueAt)}</small>
          </>
        );
      },
    },
    {
      key: 'owner',
      header: 'Owner',
      render: (row) =>
        row.ownerId ? (
          <code className="inline-code">{row.ownerId.slice(0, 8)}</code>
        ) : (
          <span className="muted-cell">Unassigned</span>
        ),
      priority: 'secondary',
    },
  ];

  return (
    <DomainPage
      eyebrow="Operations"
      title={title}
      description={description}
      meta={
        <>
          <StatusPill tone={overdueCount > 0 ? 'danger' : 'good'}>
            {formatNumber(overdueCount)} overdue
          </StatusPill>
          <StatusPill tone="neutral">{formatNumber(openCount)} open</StatusPill>
        </>
      }
    >
      <FilterBar action={pathname} resetHref={pathname} label={`Filter ${title.toLowerCase()}`}>
        <SelectField
          id="status"
          label="Status"
          placeholder="Any status"
          options={['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'FAILED'].map(
            (value) => ({ value, label: humaniseState(value) }),
          )}
          {...(statusFilter ? { defaultValue: statusFilter } : {})}
        />
        <SelectField
          id="due"
          label="Due"
          placeholder="Any"
          options={[
            { value: 'overdue', label: 'Overdue only' },
            { value: 'open', label: 'Still open' },
          ]}
          {...(dueFilter ? { defaultValue: dueFilter } : {})}
        />
      </FilterBar>

      <Panel
        title={`${formatNumber(rows.length)} ${rows.length === 1 ? 'item' : 'items'}`}
        eyebrow="Overdue first, then by priority"
      >
        <DataTable
          caption={`${title} with priority, status, due time and owner`}
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          rowHref={(row) => `/calls/${row.conversationId}`}
          empty={<EmptyState title={emptyTitle} detail={emptyDetail} />}
        />
      </Panel>
    </DomainPage>
  );
}
