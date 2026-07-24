import {
  Banner,
  DataTable,
  EmptyState,
  MetricCard,
  MetricGrid,
  Panel,
  ProgressBar,
  StatusPill,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  humaniseState,
  ratio,
  toneForState,
  type Column,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../../domain-page';
import { apiGet } from '../../../lib/api';
import type { TestRow, TestRunRow } from '../../../lib/types';

export const dynamic = 'force-dynamic';

export default async function TestRunsPage() {
  const response = await apiGet<{ tests: TestRow[]; runs: TestRunRow[] }>('/test-suites', {
    purpose: 'RELEASE_MANAGEMENT',
  });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Quality"
        title="Test runs"
        description="Provider output beside internal evaluation, with failure evidence."
      >
        <LoadFailure subject="Test runs" reason={response.reason} />
      </DomainPage>
    );
  }

  const runs = response.data.runs;
  const latest = runs[0];
  const lastCompleted = runs.find((run) => run.status !== 'RUNNING');
  const failing = runs.filter((run) => run.failCount > 0);

  const columns: Column<TestRunRow>[] = [
    {
      key: 'startedAt',
      header: 'Run',
      render: (run) => (
        <>
          {formatDateTime(run.startedAt)}
          <small className="cell-sub">{formatRelativeTime(run.startedAt)}</small>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (run) => (
        <StatusPill tone={run.failCount > 0 ? 'danger' : toneForState(run.status)}>
          {humaniseState(run.status)}
        </StatusPill>
      ),
    },
    {
      key: 'result',
      header: 'Result',
      render: (run) => {
        const total = run.passCount + run.failCount;
        const rate = ratio(run.passCount, total);
        return (
          <>
            {formatNumber(run.passCount)} passed, {formatNumber(run.failCount)} failed
            <small className="cell-sub">
              {rate === null ? 'No results yet' : `${formatPercent(rate)} pass rate`}
            </small>
          </>
        );
      },
    },
    {
      key: 'duration',
      header: 'Duration',
      align: 'end',
      render: (run) =>
        run.completedAt ? (
          formatDuration((Date.parse(run.completedAt) - Date.parse(run.startedAt)) / 1000)
        ) : (
          <span className="muted-cell">In progress</span>
        ),
      priority: 'secondary',
    },
    {
      key: 'provider',
      header: 'Provider run',
      render: (run) => <code className="inline-code">{run.providerRunId ?? '—'}</code>,
      priority: 'secondary',
    },
  ];

  return (
    <DomainPage
      eyebrow="Quality"
      title="Test runs"
      description="Each run executes the suites against a specific agent version. Provider output and the platform's own evaluation are recorded separately."
      meta={
        <StatusPill tone={failing.length > 0 ? 'danger' : 'good'}>
          {formatNumber(failing.length)} runs with failures
        </StatusPill>
      }
    >
      {lastCompleted && lastCompleted.failCount > 0 ? (
        <Banner
          tone="danger"
          title={`The last completed run had ${formatNumber(lastCompleted.failCount)} failures`}
        >
          A release cannot be published while mandatory checks fail. The gate is enforced by the
          server, not by this interface.
        </Banner>
      ) : null}

      <MetricGrid>
        <MetricCard
          label="Latest run"
          value={latest ? humaniseState(latest.status) : 'None'}
          detail={latest ? formatRelativeTime(latest.startedAt) : 'No run has been started'}
          tone={latest ? toneForState(latest.status) : 'neutral'}
        />
        <MetricCard
          label="Last completed pass rate"
          value={
            lastCompleted
              ? formatPercent(
                  ratio(
                    lastCompleted.passCount,
                    lastCompleted.passCount + lastCompleted.failCount,
                  ) ?? 0,
                )
              : 'No data yet'
          }
          detail={
            lastCompleted
              ? `${formatNumber(lastCompleted.passCount)} of ${formatNumber(lastCompleted.passCount + lastCompleted.failCount)} checks`
              : 'No completed run'
          }
          tone={lastCompleted && lastCompleted.failCount === 0 ? 'good' : 'danger'}
        />
        <MetricCard
          label="Total runs"
          value={formatNumber(runs.length)}
          detail="Across every agent version"
        />
      </MetricGrid>

      {lastCompleted ? (
        <Panel title="Last completed run" eyebrow="Result breakdown">
          <ProgressBar
            label={`${formatNumber(lastCompleted.passCount)} of ${formatNumber(lastCompleted.passCount + lastCompleted.failCount)} checks passed`}
            value={
              ((ratio(lastCompleted.passCount, lastCompleted.passCount + lastCompleted.failCount) ??
                0) as number) * 100
            }
            tone={lastCompleted.failCount === 0 ? 'good' : 'danger'}
          />
        </Panel>
      ) : null}

      <Panel title="All runs" eyebrow="Most recent first">
        <DataTable
          caption="Test runs with their status, pass and fail counts and duration"
          columns={columns}
          rows={runs}
          getRowKey={(run) => run.id}
          empty={
            <EmptyState
              title="No test runs yet"
              detail="A run is started from an agent version once it has been approved for testing."
            />
          }
        />
      </Panel>
    </DomainPage>
  );
}
