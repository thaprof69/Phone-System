import {
  DataTable,
  EmptyState,
  JsonInspector,
  StatusPill,
  TechnicalDetails,
  formatDate,
  formatDateTime,
  formatNumber,
  humaniseState,
  toneForState,
  type Column,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../../domain-page';
import { apiGet } from '../../../lib/api';
import { RetryReportRunButton } from '../report-actions';

export const dynamic = 'force-dynamic';

type Definition = { id: string; key: string };
type Run = {
  id: string;
  definitionId: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  lineage: Record<string, unknown>;
  artifactObjectKey: string | null;
  checksum: string | null;
  createdAt: string;
};

export default async function ReportHistoryPage() {
  const response = await apiGet<{ definitions: Definition[]; runs: Run[] }>('/reports', {
    purpose: 'ANALYTICS',
  });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Reports"
        title="Run history"
        description="Every run, the period it covered, and its data lineage."
      >
        <LoadFailure subject="Report runs" reason={response.reason} />
      </DomainPage>
    );
  }

  const { definitions, runs } = response.data;
  const failedRuns = runs.filter((run) => run.status !== 'COMPLETED');

  const columns: Column<Run>[] = [
    {
      key: 'report',
      header: 'Report',
      render: (run) => {
        const definition = definitions.find((entry) => entry.id === run.definitionId);
        return humaniseState((definition?.key ?? 'unknown').replaceAll('-', '_'));
      },
    },
    {
      key: 'period',
      header: 'Period covered',
      render: (run) => `${formatDate(run.periodStart)} – ${formatDate(run.periodEnd)}`,
    },
    {
      key: 'status',
      header: 'Status',
      render: (run) => (
        <StatusPill tone={toneForState(run.status)}>{humaniseState(run.status)}</StatusPill>
      ),
    },
    {
      key: 'artifact',
      header: 'Output',
      render: (run) =>
        run.artifactObjectKey ? (
          <StatusPill tone="good">Generated</StatusPill>
        ) : (
          <span className="muted-cell">No artefact</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'Run at',
      render: (run) => formatDateTime(run.createdAt),
      priority: 'secondary',
    },
    {
      key: 'retry',
      header: 'Change',
      render: (run) =>
        run.status === 'FAILED' ? (
          <RetryReportRunButton runId={run.id} />
        ) : (
          <span className="muted-cell">—</span>
        ),
    },
  ];

  return (
    <DomainPage
      eyebrow="Reports"
      title="Run history"
      description="Each run records the period it covered and how much evidence it drew on."
      meta={
        failedRuns.length > 0 ? (
          <StatusPill tone="danger">{formatNumber(failedRuns.length)} failed runs</StatusPill>
        ) : (
          <StatusPill tone="neutral">{formatNumber(runs.length)} runs</StatusPill>
        )
      }
    >
      <DataTable
        caption="Report runs with the period covered, status and whether an artefact was produced"
        columns={columns}
        rows={runs.slice(0, 25)}
        getRowKey={(run) => run.id}
        empty={
          <EmptyState title="No runs yet" detail="Reports run on their schedule once activated." />
        }
      />
      {runs.length > 0 ? (
        <TechnicalDetails summary="Data lineage for recent runs">
          {runs.slice(0, 3).map((run) => (
            <JsonInspector
              key={run.id}
              label={`Run ${run.id.slice(0, 8)} lineage`}
              value={run.lineage}
            />
          ))}
        </TechnicalDetails>
      ) : null}
    </DomainPage>
  );
}
