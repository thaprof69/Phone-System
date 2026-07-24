import {
  DataTable,
  EmptyState,
  FilterBar,
  Panel,
  SelectField,
  StatusPill,
  formatCurrencyFromMicros,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  humaniseState,
  toneForState,
  type Column,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../../domain-page';
import { apiGet } from '../../../lib/api';
import { readParam, type SearchParams } from '../../../lib/list-view';
import type { DeliveryRow, Operations } from '../../../lib/types';

export const dynamic = 'force-dynamic';

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const response = await apiGet<Operations>('/operations', { purpose: 'OPERATIONS' });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Operations"
        title="Messages"
        description="Outbound messages and their delivery receipts."
      >
        <LoadFailure subject="Messages" reason={response.reason} />
      </DomainPage>
    );
  }

  const all = response.data.deliveries;
  const statusFilter = readParam(params, 'status');
  const channelFilter = readParam(params, 'channel');
  const rows = all.filter(
    (row) =>
      (!statusFilter || row.status === statusFilter) &&
      (!channelFilter || row.channel === channelFilter),
  );

  const failed = all.filter((row) => row.status === 'FAILED');
  const channels = [...new Set(all.map((row) => row.channel))].sort();
  const statuses = [...new Set(all.map((row) => row.status))].sort();

  // Costs are stored as a decimal string in the message currency, not as micros.
  const totalCost = all.reduce((sum, row) => sum + Number(row.cost ?? 0), 0);

  const columns: Column<DeliveryRow>[] = [
    {
      key: 'sentAt',
      header: 'Sent',
      render: (row) =>
        row.sentAt ? (
          <>
            {formatDateTime(row.sentAt)}
            <small className="cell-sub">{formatRelativeTime(row.sentAt)}</small>
          </>
        ) : (
          <span className="muted-cell">Not sent</span>
        ),
    },
    { key: 'channel', header: 'Channel', render: (row) => humaniseState(row.channel) },
    { key: 'template', header: 'Template', render: (row) => humaniseState(row.templateKey) },
    {
      key: 'status',
      header: 'Delivery',
      render: (row) => (
        <StatusPill tone={toneForState(row.status)}>{humaniseState(row.status)}</StatusPill>
      ),
    },
    {
      key: 'delivered',
      header: 'Receipt',
      render: (row) =>
        row.deliveredAt ? (
          formatDateTime(row.deliveredAt)
        ) : (
          <span className="muted-cell">None</span>
        ),
      priority: 'secondary',
    },
    {
      key: 'cost',
      header: 'Cost',
      align: 'end',
      render: (row) => formatCurrencyFromMicros(row.cost ? Number(row.cost) * 1_000_000 : null),
      priority: 'secondary',
    },
  ];

  return (
    <DomainPage
      eyebrow="Operations"
      title="Messages"
      description="Outbound messages raised by a call, with their delivery receipts and cost. Recipients are never shown in full."
      meta={
        <>
          <StatusPill tone={failed.length > 0 ? 'danger' : 'good'}>
            {formatNumber(failed.length)} failed
          </StatusPill>
          <StatusPill tone="neutral">
            {formatCurrencyFromMicros(totalCost * 1_000_000)} total
          </StatusPill>
        </>
      }
    >
      <FilterBar
        action="/operations/messages"
        resetHref="/operations/messages"
        label="Filter messages"
      >
        <SelectField
          id="channel"
          label="Channel"
          placeholder="All channels"
          options={channels.map((value) => ({ value, label: humaniseState(value) }))}
          {...(channelFilter ? { defaultValue: channelFilter } : {})}
        />
        <SelectField
          id="status"
          label="Delivery status"
          placeholder="Any status"
          options={statuses.map((value) => ({ value, label: humaniseState(value) }))}
          {...(statusFilter ? { defaultValue: statusFilter } : {})}
        />
      </FilterBar>

      <Panel
        title={`${formatNumber(rows.length)} ${rows.length === 1 ? 'message' : 'messages'}`}
        eyebrow={rows.length === all.length ? 'All records' : 'Filtered'}
      >
        <DataTable
          caption="Messages with their channel, template, delivery status and cost"
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          rowHref={(row) => `/calls/${row.conversationId}`}
          empty={
            <EmptyState
              title={all.length === 0 ? 'No messages sent' : 'No messages match these filters'}
              detail={
                all.length === 0
                  ? 'Messages are sent when a call raises a follow-up that needs a link or confirmation.'
                  : 'Adjust or clear the filters to see more records.'
              }
            />
          }
        />
      </Panel>
    </DomainPage>
  );
}
