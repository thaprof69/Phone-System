import {
  DataTable,
  EmptyState,
  Panel,
  StatusPill,
  formatNumber,
  formatPercent,
  type Column,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../../domain-page';
import { apiGet } from '../../../lib/api';

export const dynamic = 'force-dynamic';

type PerformanceRow = {
  key: string;
  label: string;
  executionCount: number;
  averageLatencyMs: number | null;
  p95LatencyMs: number | null;
  fallbackRate: number | null;
  schemaValidationFailures: number;
  timeoutCount: number;
  failureCount: number;
  retryCount: number;
  successRate: number | null;
};

type Response = {
  generatedAt: string;
  byProvider: PerformanceRow[];
  byModel: PerformanceRow[];
  byCapability: PerformanceRow[];
};

function columns(): Column<PerformanceRow>[] {
  return [
    { key: 'label', header: 'Name', render: (row) => row.label },
    {
      key: 'executionCount',
      header: 'Runs',
      align: 'end',
      render: (row) => formatNumber(row.executionCount),
    },
    {
      key: 'successRate',
      header: 'Success rate',
      align: 'end',
      render: (row) =>
        row.successRate === null ? 'Not yet instrumented' : formatPercent(row.successRate),
    },
    {
      key: 'averageLatencyMs',
      header: 'Avg. latency',
      align: 'end',
      render: (row) =>
        row.averageLatencyMs === null
          ? 'Not yet instrumented'
          : `${formatNumber(Math.round(row.averageLatencyMs))} ms`,
    },
    {
      key: 'p95LatencyMs',
      header: 'p95 latency',
      align: 'end',
      render: (row) =>
        row.p95LatencyMs === null ? 'Not yet instrumented' : `${formatNumber(row.p95LatencyMs)} ms`,
      priority: 'secondary',
    },
    {
      key: 'fallbackRate',
      header: 'Fallback rate',
      align: 'end',
      render: (row) =>
        row.fallbackRate === null ? 'Not yet instrumented' : formatPercent(row.fallbackRate),
      priority: 'secondary',
    },
    {
      key: 'timeoutCount',
      header: 'Timeouts',
      align: 'end',
      render: (row) => formatNumber(row.timeoutCount),
      priority: 'secondary',
    },
    {
      key: 'schemaValidationFailures',
      header: 'Schema failures',
      align: 'end',
      render: (row) => formatNumber(row.schemaValidationFailures),
      priority: 'secondary',
    },
    {
      key: 'retryCount',
      header: 'Retries',
      align: 'end',
      render: (row) => formatNumber(row.retryCount),
      priority: 'secondary',
    },
    {
      key: 'failureCount',
      header: 'Failures',
      align: 'end',
      render: (row) => formatNumber(row.failureCount),
      priority: 'secondary',
    },
  ];
}

export default async function ProviderPerformancePage() {
  const response = await apiGet<Response>('/analytics/provider-performance', {
    purpose: 'ANALYTICS',
  });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Intelligence"
        title="Provider performance"
        description="Execution health of the AI providers and models enriching calls."
      >
        <LoadFailure subject="Provider performance" reason={response.reason} />
      </DomainPage>
    );
  }

  const { byProvider, byModel, byCapability } = response.data;
  const totalRuns = byProvider.reduce((sum, row) => sum + row.executionCount, 0);
  const tableColumns = columns();

  return (
    <DomainPage
      eyebrow="Intelligence"
      title="Provider performance"
      description="Execution health of the AI providers, models and capabilities enriching calls after they end. Every figure traces back to the same execution runs Settings → AI Routing → Execution history lists."
      meta={<StatusPill tone="neutral">{formatNumber(totalRuns)} runs</StatusPill>}
    >
      <Panel title="By provider" eyebrow="Connection-level health">
        <DataTable
          caption="Provider execution health: runs, success rate, latency, fallback, timeouts and failures"
          columns={tableColumns}
          rows={byProvider}
          getRowKey={(row) => row.key}
          empty={
            <EmptyState
              title="No provider runs yet"
              detail="A provider appears once it has executed at least one capability."
            />
          }
        />
      </Panel>

      <Panel title="By model" eyebrow="Model-level health">
        <DataTable
          caption="Model execution health: runs, success rate, latency, fallback, timeouts and failures"
          columns={tableColumns}
          rows={byModel}
          getRowKey={(row) => row.key}
          empty={
            <EmptyState
              title="No model runs yet"
              detail="A model appears once it has executed at least one capability."
            />
          }
        />
      </Panel>

      <Panel title="By capability" eyebrow="What each run was for">
        <DataTable
          caption="Capability execution health: runs, success rate, latency, fallback, timeouts and failures"
          columns={tableColumns}
          rows={byCapability}
          getRowKey={(row) => row.key}
          empty={
            <EmptyState
              title="No capability runs yet"
              detail="A capability appears once it has executed at least once."
            />
          }
        />
      </Panel>

      <p className="evidence-note">
        Every run behind these figures is listed at{' '}
        <a className="row-link" href="/settings/ai-routing/executions">
          Settings → AI Routing → Execution history
        </a>
        , filterable by provider, model, capability and outcome.
      </p>
    </DomainPage>
  );
}
