import {
  Banner,
  DataTable,
  EmptyState,
  JsonInspector,
  Panel,
  StatusPill,
  TechnicalDetails,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  humaniseState,
  toneForState,
  type Column,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../../domain-page';
import { apiGet } from '../../../lib/api';
import { RunReconciliationButton } from '../call-actions';

export const dynamic = 'force-dynamic';

type StalledCall = {
  id: string;
  providerConversationId: string;
  processingState: string;
  park: string | null;
  language: string | null;
  startedAt: string | null;
  attempts: number;
  lastError: Record<string, unknown> | null;
};

type InboxEntry = {
  id: string;
  state: string;
  attempts: number;
  workflowId: string | null;
  nextAttemptAt: string | null;
  lastError: Record<string, unknown> | null;
  createdAt: string;
};

export default async function ReconciliationPage() {
  const response = await apiGet<{ items: StalledCall[]; inbox: InboxEntry[] }>(
    '/calls-reconciliation',
    { purpose: 'OPERATIONS' },
  );

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Calls"
        title="Reconciliation"
        description="Missing calls, duplicate events and partial processing."
      >
        <LoadFailure subject="Reconciliation" reason={response.reason} />
      </DomainPage>
    );
  }

  const { items, inbox } = response.data;
  const pendingInbox = inbox.filter((entry) => entry.state !== 'PROCESSED');

  const callColumns: Column<StalledCall>[] = [
    {
      key: 'startedAt',
      header: 'Call',
      render: (row) => (
        <>
          {formatDateTime(row.startedAt)}
          <small className="cell-sub">
            {titleCase(row.park)} · {(row.language ?? '—').toUpperCase()}
          </small>
        </>
      ),
    },
    {
      key: 'processingState',
      header: 'Stopped at',
      render: (row) => (
        <StatusPill tone={toneForState(row.processingState)}>
          {humaniseState(row.processingState)}
        </StatusPill>
      ),
    },
    {
      key: 'attempts',
      header: 'Attempts',
      align: 'end',
      render: (row) => formatNumber(row.attempts),
    },
    {
      key: 'reference',
      header: 'Provider reference',
      render: (row) => <code className="inline-code">{row.providerConversationId}</code>,
      priority: 'secondary',
    },
  ];

  const inboxColumns: Column<InboxEntry>[] = [
    {
      key: 'createdAt',
      header: 'Received',
      render: (row) => (
        <>
          {formatDateTime(row.createdAt)}
          <small className="cell-sub">{formatRelativeTime(row.createdAt)}</small>
        </>
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
      key: 'attempts',
      header: 'Attempts',
      align: 'end',
      render: (row) => formatNumber(row.attempts),
    },
    {
      key: 'nextAttempt',
      header: 'Next attempt',
      render: (row) =>
        row.nextAttemptAt ? (
          formatRelativeTime(row.nextAttemptAt)
        ) : (
          <span className="muted-cell">—</span>
        ),
      priority: 'secondary',
    },
  ];

  return (
    <DomainPage
      eyebrow="Calls"
      title="Reconciliation"
      description="Calls that stopped part-way through processing, and the durable inbox entries behind them."
      meta={
        <StatusPill tone={items.length === 0 ? 'good' : 'warning'}>
          {formatNumber(items.length)} to reconcile
        </StatusPill>
      }
    >
      <Banner tone="info" title="Raw provider evidence is stored before processing begins">
        Every webhook body is written to immutable storage before the platform acknowledges it, so a
        processing failure never loses the evidence and the work can be replayed without contacting
        the provider again.
      </Banner>

      <Panel
        title="Run reconciliation"
        description="Dispatches the reconciliation workflow against the workflow engine. Reported honestly if the engine cannot be reached — nothing here is assumed to have queued."
      >
        <RunReconciliationButton />
      </Panel>

      <Panel
        title="Calls needing reconciliation"
        eyebrow={`${formatNumber(items.length)} affected`}
        description="Each of these has raw evidence and, in most cases, a transcript. What is missing is downstream intelligence."
      >
        <DataTable
          caption="Calls that did not complete processing, with the stage they stopped at"
          columns={callColumns}
          rows={items}
          getRowKey={(row) => row.id}
          rowHref={(row) => `/calls/${row.id}`}
          empty={
            <EmptyState
              title="Nothing to reconcile"
              detail="Every ingested call completed its post-call workflow."
            />
          }
        />
      </Panel>

      <Panel
        title="Durable inbox"
        eyebrow={`${formatNumber(pendingInbox.length)} not yet processed`}
        description="Webhook deliveries the platform has accepted but not finished dispatching."
      >
        <DataTable
          caption="Inbox entries with their state, attempt count and next retry"
          columns={inboxColumns}
          rows={inbox.slice(0, 25)}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState
              title="Inbox is empty"
              detail="No webhook deliveries are currently queued."
            />
          }
        />
        {pendingInbox.length > 0 ? (
          <TechnicalDetails summary="Last recorded errors">
            {pendingInbox
              .filter((entry) => entry.lastError)
              .slice(0, 5)
              .map((entry) => (
                <JsonInspector
                  key={entry.id}
                  label={`Inbox ${entry.id.slice(0, 8)}`}
                  value={entry.lastError}
                />
              ))}
          </TechnicalDetails>
        ) : null}
      </Panel>
    </DomainPage>
  );
}

function titleCase(value: string | null): string {
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1);
}
