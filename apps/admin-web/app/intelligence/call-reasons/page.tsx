import Link from 'next/link';
import {
  BarChart,
  DataTable,
  EmptyState,
  Panel,
  StatusPill,
  formatNumber,
  formatPercent,
  humaniseState,
  type Column,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../../domain-page';
import { apiGet } from '../../../lib/api';

export const dynamic = 'force-dynamic';

type AnalyticsSeries = {
  totals: { received: number };
  byIntent: Array<{ label: string; value: number }>;
};

type Row = { intent: string; value: number };

export default async function CallReasonsPage() {
  const response = await apiGet<AnalyticsSeries>('/analytics/series?days=90', {
    purpose: 'ANALYTICS',
  });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Intelligence"
        title="Call reasons"
        description="Why people call, ranked by how often."
      >
        <LoadFailure subject="Call reasons" reason={response.reason} />
      </DomainPage>
    );
  }

  const { totals, byIntent } = response.data;
  const rows: Row[] = byIntent.map((entry) => ({ intent: entry.label, value: entry.value }));

  const columns: Column<Row>[] = [
    {
      key: 'intent',
      header: 'Reason',
      render: (row) => (
        <Link className="row-link" href={`/calls?intent=${encodeURIComponent(row.intent)}`}>
          {humaniseState(row.intent)}
        </Link>
      ),
    },
    {
      key: 'value',
      header: 'Calls',
      align: 'end',
      sortable: true,
      render: (row) => formatNumber(row.value),
    },
    {
      key: 'share',
      header: 'Share of calls',
      align: 'end',
      render: (row) => (totals.received > 0 ? formatPercent(row.value / totals.received) : '—'),
      priority: 'secondary',
    },
  ];

  return (
    <DomainPage
      eyebrow="Intelligence"
      title="Call reasons"
      description="Why people call, over the last 90 days. Each reason drills through to the calls behind it."
      meta={<StatusPill tone="neutral">{formatNumber(rows.length)} distinct reasons</StatusPill>}
    >
      {rows.length > 0 ? (
        <Panel title="Calls by reason" eyebrow="Ranked, most common first">
          <BarChart
            title="Calls by reason"
            description="The classified primary reason for each call, most common first."
            horizontal
            height={Math.max(220, rows.length * 32)}
            data={rows
              .slice()
              .sort((left, right) => right.value - left.value)
              .map((row) => ({ label: humaniseState(row.intent), value: row.value }))}
            series={[{ key: 'value', label: 'Calls' }]}
          />
        </Panel>
      ) : null}

      <Panel title="All reasons" eyebrow="With drill-through to the underlying calls">
        <DataTable
          caption="Call reasons ranked by volume, with the share of calls each accounts for"
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.intent}
          empty={
            <EmptyState
              title="No calls classified yet"
              detail="A reason appears here once at least one call has been classified."
            />
          }
        />
      </Panel>
    </DomainPage>
  );
}
