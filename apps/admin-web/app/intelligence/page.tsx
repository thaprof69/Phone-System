import Link from 'next/link';
import {
  AreaChart,
  Banner,
  ComparisonChart,
  DonutChart,
  MetricCard,
  MetricGrid,
  Panel,
  StatusPill,
  formatDate,
  formatDuration,
  formatNumber,
  formatPercent,
  humaniseState,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../domain-page';
import { apiGet } from '../../lib/api';
import { readNumber, type SearchParams } from '../../lib/list-view';

export const dynamic = 'force-dynamic';

type AnalyticsSeries = {
  windowDays: number;
  from: string;
  generatedAt: string;
  totals: {
    received: number;
    completed: number;
    containment: number | null;
    averageDurationSeconds: number | null;
  };
  demand: Array<{ label: string; received: number; completed: number }>;
  byIntent: Array<{ label: string; value: number }>;
  byPark: Array<{ label: string; value: number }>;
  byLanguage: Array<{ label: string; value: number }>;
  byOutcome: Array<{ label: string; value: number }>;
};

const RANGES = [7, 30, 90];

export default async function IntelligenceOverviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const days = RANGES.includes(readNumber(params, 'days', 30))
    ? readNumber(params, 'days', 30)
    : 30;
  const response = await apiGet<AnalyticsSeries>(`/analytics/series?days=${days}`, {
    purpose: 'ANALYTICS',
  });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Intelligence"
        title="Overview"
        description="Demand, intent mix, outcomes and containment over time."
      >
        <LoadFailure subject="Intelligence" reason={response.reason} />
      </DomainPage>
    );
  }

  const data = response.data;
  const hasEvidence = data.totals.received > 0;

  const demand = data.demand.map((point) => ({
    label: formatDate(point.label),
    received: point.received,
    completed: point.completed,
  }));

  return (
    <DomainPage
      eyebrow="Intelligence"
      title="Overview"
      description="What callers asked for and what happened, aggregated from the same facts the scheduled reports use."
      meta={<StatusPill tone="neutral">Last {days} days</StatusPill>}
      actions={
        <div className="range-switch" role="group" aria-label="Date range">
          {RANGES.map((range) => (
            <Link
              key={range}
              className={range === days ? 'button secondary small active' : 'button ghost small'}
              href={`/intelligence?days=${range}`}
              {...(range === days ? { 'aria-current': 'page' as const } : {})}
            >
              {range} days
            </Link>
          ))}
        </div>
      }
    >
      {!hasEvidence ? (
        <Banner tone="info" title="No calls in this window">
          Charts are withheld rather than drawn from nothing. Widen the range or wait for calls to
          be recorded.
        </Banner>
      ) : null}

      <MetricGrid>
        <MetricCard
          label="Calls received"
          value={formatNumber(data.totals.received)}
          detail={`${formatNumber(data.totals.completed)} fully processed`}
        />
        <MetricCard
          label="Containment"
          value={
            data.totals.containment === null
              ? 'No data yet'
              : formatPercent(data.totals.containment)
          }
          detail="Resolved without a transfer or callback"
          tone={
            data.totals.containment === null
              ? 'neutral'
              : data.totals.containment >= 0.7
                ? 'good'
                : data.totals.containment >= 0.5
                  ? 'warning'
                  : 'danger'
          }
        />
        <MetricCard
          label="Average call length"
          value={
            data.totals.averageDurationSeconds === null
              ? 'No data yet'
              : formatDuration(data.totals.averageDurationSeconds)
          }
          detail="Across every call in the window"
        />
        <MetricCard
          label="Distinct reasons"
          value={formatNumber(data.byIntent.length)}
          detail="Intents seen at least once"
          href="/intelligence/call-reasons"
        />
      </MetricGrid>

      {hasEvidence ? (
        <>
          <Panel title="Call demand" eyebrow="Received against fully processed">
            <AreaChart
              title="Calls per day"
              description="Received compared with the number that completed post-call processing."
              data={demand}
              series={[
                { key: 'received', label: 'Received' },
                { key: 'completed', label: 'Fully processed' },
              ]}
            />
          </Panel>

          <div className="chart-columns">
            <Panel title="How calls ended" eyebrow="Outcome mix">
              <DonutChart
                title="Calls by outcome"
                description="Deterministic outcomes derived from persisted events, never asserted by a model."
                data={data.byOutcome.map((entry) => ({
                  label: humaniseState(entry.label),
                  value: entry.value,
                }))}
              />
            </Panel>

            <Panel title="Parks" eyebrow="Where callers are asking about">
              <ComparisonChart
                title="Calls by park"
                data={data.byPark.map((entry) => ({
                  label: titleCase(entry.label),
                  value: entry.value,
                }))}
                series={[{ key: 'value', label: 'Calls' }]}
                height={200}
              />
            </Panel>
          </div>

          <Panel title="Languages" eyebrow="What callers speak">
            <ComparisonChart
              title="Calls by language"
              data={data.byLanguage.map((entry) => ({
                label: entry.label.toUpperCase(),
                value: entry.value,
              }))}
              series={[{ key: 'value', label: 'Calls' }]}
              height={200}
            />
          </Panel>
        </>
      ) : null}

      <p className="evidence-note">
        Aggregated from {formatNumber(data.totals.received)} calls recorded since{' '}
        {formatDate(data.from)}. Figures come from the aggregate facts table, so a chart and a
        scheduled report answer with the same numbers.
      </p>
    </DomainPage>
  );
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
