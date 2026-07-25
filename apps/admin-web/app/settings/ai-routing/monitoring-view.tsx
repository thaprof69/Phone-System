import Link from 'next/link';
import {
  Banner,
  DataTable,
  EmptyState,
  MetricCard,
  MetricGrid,
  Panel,
  StatusPill,
  formatCurrencyFromMicros,
  formatDateTime,
  formatLatency,
  formatNumber,
  formatPercent,
  formatTokens,
  humaniseState,
  toneForState,
  type Column,
  type Tone,
} from '@quantum-parks/ui';

/**
 * Monitoring.
 *
 * Every aggregate here is derived from the execution runs, and each one links to the
 * records that produced it. A rate with no runs behind it is reported as unknown rather
 * than as a perfect score.
 */

export type MonitoringSummary = {
  totals: {
    runs: number;
    succeeded: number;
    failed: number;
    fellBack: number;
    validationFailed: number;
    successRate: number | null;
    failureRate: number | null;
    fallbackRate: number | null;
    validationFailureRate: number | null;
  };
  latency: { p50Ms: number | null; p95Ms: number | null; maxMs: number | null };
  spend: { costMicros: number; currency: string; inputTokens: number; outputTokens: number };
  byState: Array<{ state: string; count: number }>;
  providerHealth: Array<{
    connectionId: string;
    providerKey: string;
    label: string;
    status: string;
    checks: number;
    degradedChecks: number;
    lastCheckedAt: string | null;
    lastStatus: string | null;
    lastErrorCode: string | null;
  }>;
  models: Array<{
    id: string;
    providerModelId: string;
    available: boolean;
    deprecated: boolean;
    runs: number;
  }>;
};

function rateTone(value: number | null, warnAbove: number): Tone {
  if (value === null) return 'neutral';
  return value > warnAbove ? 'danger' : 'good';
}

export function MonitoringView({
  summary,
  section = 'all',
}: {
  summary: MonitoringSummary;
  /** AI Providers shows only provider health; AI Routing shows run monitoring. */
  section?: 'all' | 'runs' | 'health';
}) {
  const { totals, latency, spend } = summary;
  const degradedProviders = summary.providerHealth.filter((row) => row.degradedChecks > 0);

  const stateColumns: Column<{ state: string; count: number }>[] = [
    {
      key: 'state',
      header: 'Result state',
      render: (row) => (
        <StatusPill tone={toneForState(row.state)}>{humaniseState(row.state)}</StatusPill>
      ),
    },
    { key: 'count', header: 'Runs', align: 'end', render: (row) => formatNumber(row.count) },
    {
      key: 'share',
      header: 'Share',
      align: 'end',
      render: (row) =>
        totals.runs > 0 ? (
          formatPercent(row.count / totals.runs)
        ) : (
          <span className="muted-cell">—</span>
        ),
    },
    {
      key: 'drill',
      header: 'Underlying runs',
      render: (row) => (
        <Link className="row-link" href={`/settings/ai-routing/executions?state=${row.state}`}>
          View runs
        </Link>
      ),
    },
  ];

  const healthColumns: Column<MonitoringSummary['providerHealth'][number]>[] = [
    {
      key: 'provider',
      header: 'Provider',
      render: (row) => (
        <>
          {row.label}
          <small className="cell-sub">{row.providerKey}</small>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Connection',
      render: (row) => (
        <StatusPill tone={toneForState(row.status)}>{humaniseState(row.status)}</StatusPill>
      ),
    },
    {
      key: 'checks',
      header: 'Health checks',
      align: 'end',
      render: (row) => (
        <>
          {formatNumber(row.checks)}
          <small className="cell-sub">{formatNumber(row.degradedChecks)} degraded</small>
        </>
      ),
    },
    {
      key: 'last',
      header: 'Last check',
      render: (row) =>
        row.lastCheckedAt ? (
          <>
            {formatDateTime(row.lastCheckedAt)}
            <small className="cell-sub">{humaniseState(row.lastStatus)}</small>
          </>
        ) : (
          <span className="muted-cell">Never checked</span>
        ),
    },
    {
      key: 'error',
      header: 'Last error',
      render: (row) =>
        row.lastErrorCode ? (
          humaniseState(row.lastErrorCode)
        ) : (
          <span className="muted-cell">None</span>
        ),
      priority: 'secondary',
    },
  ];

  return (
    <>
      {section === 'all' || section === 'runs' ? (
        <>
          {totals.runs === 0 ? (
            <Banner tone="info" title="No runs recorded yet">
              Rates are withheld rather than shown as perfect. A failure rate with nothing behind it
              is unknown, not zero.
            </Banner>
          ) : null}

          <MetricGrid>
            <MetricCard
              label="Runs"
              value={formatNumber(totals.runs)}
              detail={`${formatNumber(totals.succeeded)} succeeded`}
            />
            <MetricCard
              label="Failure rate"
              value={
                totals.failureRate === null ? 'No data yet' : formatPercent(totals.failureRate)
              }
              detail={`${formatNumber(totals.failed)} runs produced no artefact`}
              tone={rateTone(totals.failureRate, 0.1)}
            />
            <MetricCard
              label="Fallback rate"
              value={
                totals.fallbackRate === null ? 'No data yet' : formatPercent(totals.fallbackRate)
              }
              detail={`${formatNumber(totals.fellBack)} used a fallback candidate`}
              tone={rateTone(totals.fallbackRate, 0.15)}
            />
            <MetricCard
              label="Validation failures"
              value={
                totals.validationFailureRate === null
                  ? 'No data yet'
                  : formatPercent(totals.validationFailureRate)
              }
              detail="Output rejected by its schema or evidence rules"
              tone={rateTone(totals.validationFailureRate, 0.05)}
            />
            <MetricCard
              label="Latency p50"
              value={formatLatency(latency.p50Ms)}
              detail={`p95 ${formatLatency(latency.p95Ms)} · max ${formatLatency(latency.maxMs)}`}
            />
            <MetricCard
              label="Spend"
              value={formatCurrencyFromMicros(spend.costMicros, spend.currency)}
              detail={`${formatTokens(spend.inputTokens)} in · ${formatTokens(spend.outputTokens)} out`}
            />
          </MetricGrid>

          <Panel
            title="Results by state"
            eyebrow="Every aggregate links to its runs"
            description="These are the explicit states the orchestrator returns. Nothing is bucketed into a generic error."
          >
            <DataTable
              caption="Run counts by result state, with a link to the underlying runs"
              columns={stateColumns}
              rows={summary.byState}
              getRowKey={(row) => row.state}
              empty={<EmptyState title="No runs" detail="Nothing has executed yet." />}
            />
          </Panel>

          <Panel
            title="Model usage"
            eyebrow={`${formatNumber(summary.models.length)} models`}
            description="A deprecated or unavailable model that is still receiving runs is a problem worth seeing."
          >
            <ul className="capability-grid">
              {summary.models.map((model) => (
                <li key={model.id}>
                  <span>
                    {model.providerModelId}
                    <small className="cell-sub">{formatNumber(model.runs)} runs</small>
                  </span>
                  <StatusPill tone={model.available && !model.deprecated ? 'good' : 'danger'}>
                    {model.deprecated
                      ? 'Deprecated'
                      : model.available
                        ? 'Available'
                        : 'Unavailable'}
                  </StatusPill>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      ) : null}

      {section === 'all' || section === 'health' ? (
        <>
          {degradedProviders.length > 0 ? (
            <Banner
              tone="warning"
              title={`${formatNumber(degradedProviders.length)} providers reported degraded checks`}
            >
              Degraded readings are kept rather than smoothed away, because the pattern is what
              explains a spike in fallbacks.
            </Banner>
          ) : null}

          <Panel
            title="Connection health"
            eyebrow={`${formatNumber(summary.providerHealth.length)} connections`}
            description="Health is read from recorded checks rather than inferred from the last request."
          >
            <DataTable
              caption="Provider connections with their health check history"
              columns={healthColumns}
              rows={summary.providerHealth}
              getRowKey={(row) => row.connectionId}
              empty={
                <EmptyState
                  title="No provider connections"
                  detail="Connect an AI provider to begin recording health."
                />
              }
            />
          </Panel>
        </>
      ) : null}
    </>
  );
}
