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
import { SettingsPage as DomainPage, LoadFailure } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import type { AgentListRow, TestRow, TestRunRow } from '../../../../lib/types';
import { RunTestsForm, SyncRunButton } from '../test-actions';

export const dynamic = 'force-dynamic';

export default async function TestRunsPage() {
  const [response, agentsResponse] = await Promise.all([
    apiGet<{ tests: TestRow[]; runs: TestRunRow[] }>('/test-suites', {
      purpose: 'RELEASE_MANAGEMENT',
    }),
    apiGet<{ items: AgentListRow[] }>('/agents', { purpose: 'RELEASE_MANAGEMENT' }),
  ]);

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Simulation Lab"
        title="Interactive test"
        description="Provider output beside internal evaluation, with failure evidence."
      >
        <LoadFailure subject="Test runs" reason={response.reason} />
      </DomainPage>
    );
  }

  const runs = response.data.runs;
  const testCases = response.data.tests.filter((test) => !test.archived && test.latestVersionId);
  const agentOptions = agentsResponse.ok
    ? agentsResponse.data.items
        .filter((agent) => agent.versionId)
        .map((agent) => ({
          value: agent.versionId as string,
          label: `${agent.name} v${agent.version} (${humaniseState(agent.state ?? '')})`,
        }))
    : [];
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
    {
      key: 'sync',
      header: 'Sync',
      render: (run) =>
        run.providerRunId && !run.completedAt ? (
          <details className="row-actions">
            <summary>Sync</summary>
            <div className="row-actions-body">
              <SyncRunButton runId={run.id} />
            </div>
          </details>
        ) : (
          <span className="muted-cell">—</span>
        ),
    },
  ];

  return (
    <DomainPage
      eyebrow="Simulation Lab"
      title="Interactive test"
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

      <Panel
        title="Run tests"
        description="A run always evaluates a specific test version and produces provider-verified evidence — never a locally invented result."
      >
        <RunTestsForm
          agentVersions={agentOptions}
          testCases={testCases.map((test) => ({
            id: test.id,
            versionId: test.latestVersionId as string,
            name: test.name,
            riskLevel: test.riskLevel,
          }))}
        />
      </Panel>

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
