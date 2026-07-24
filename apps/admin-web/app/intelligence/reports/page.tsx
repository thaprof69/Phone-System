import {
  DataTable,
  EmptyState,
  JsonInspector,
  Panel,
  StatusPill,
  TechnicalDetails,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  humaniseState,
  toneForState,
  type Column,
  type Tone,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../../domain-page';
import { apiGet } from '../../../lib/api';

export const dynamic = 'force-dynamic';

type Definition = {
  id: string;
  key: string;
  schedule: string;
  classification: string;
  configuration: Record<string, unknown>;
  active: boolean;
  createdAt: string;
};

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

function classificationTone(classification: string): Tone {
  if (classification === 'RESTRICTED') return 'danger';
  if (classification === 'CONFIDENTIAL') return 'warning';
  return 'neutral';
}

/** Cron-ish schedule strings rendered as English so the page is readable at a glance. */
function describeSchedule(schedule: string): string {
  const parts = schedule.split(' ');
  if (parts.length !== 5) return schedule;
  const [minute, hour, dayOfMonth, , dayOfWeek] = parts;
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  if (dayOfWeek && dayOfWeek !== '*') return `Weekly on ${dayOfWeek} at ${time}`;
  if (dayOfMonth && dayOfMonth !== '*') return `Monthly on day ${dayOfMonth} at ${time}`;
  return `Daily at ${time}`;
}

export default async function ReportsPage() {
  const response = await apiGet<{ definitions: Definition[]; runs: Run[] }>('/reports', {
    purpose: 'ANALYTICS',
  });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Intelligence"
        title="Reports"
        description="Report definitions, schedules, runs and delivery."
      >
        <LoadFailure subject="Reports" reason={response.reason} />
      </DomainPage>
    );
  }

  const { definitions, runs } = response.data;
  const failedRuns = runs.filter((run) => run.status !== 'COMPLETED');
  const runsByDefinition = new Map<string, Run[]>();
  for (const run of runs) {
    runsByDefinition.set(run.definitionId, [
      ...(runsByDefinition.get(run.definitionId) ?? []),
      run,
    ]);
  }

  const definitionColumns: Column<Definition>[] = [
    {
      key: 'key',
      header: 'Report',
      render: (definition) => (
        <>
          {humaniseState(definition.key.replaceAll('-', '_'))}
          <small className="cell-sub">{describeSchedule(definition.schedule)}</small>
        </>
      ),
    },
    {
      key: 'active',
      header: 'Schedule',
      render: (definition) =>
        definition.active ? (
          <StatusPill tone="good">Active</StatusPill>
        ) : (
          <StatusPill tone="neutral">Paused</StatusPill>
        ),
    },
    {
      key: 'classification',
      header: 'Classification',
      render: (definition) => (
        <StatusPill tone={classificationTone(definition.classification)}>
          {humaniseState(definition.classification)}
        </StatusPill>
      ),
    },
    {
      key: 'runs',
      header: 'Runs',
      align: 'end',
      render: (definition) => formatNumber((runsByDefinition.get(definition.id) ?? []).length),
    },
    {
      key: 'lastRun',
      header: 'Last run',
      render: (definition) => {
        const latest = (runsByDefinition.get(definition.id) ?? [])[0];
        if (!latest) return <span className="muted-cell">Never run</span>;
        return (
          <>
            {formatRelativeTime(latest.createdAt)}
            <small className="cell-sub">{humaniseState(latest.status)}</small>
          </>
        );
      },
      priority: 'secondary',
    },
  ];

  const runColumns: Column<Run>[] = [
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
  ];

  return (
    <DomainPage
      eyebrow="Intelligence"
      title="Reports"
      description="Scheduled reports, the periods they covered, and the lineage of the data behind each run."
      meta={
        <>
          <StatusPill tone="neutral">{formatNumber(definitions.length)} definitions</StatusPill>
          {failedRuns.length > 0 ? (
            <StatusPill tone="danger">{formatNumber(failedRuns.length)} failed runs</StatusPill>
          ) : null}
        </>
      }
    >
      <Panel
        title="Report definitions"
        eyebrow="What runs, when, and who may see it"
        description="Classification governs masking and who the report can be delivered to."
      >
        <DataTable
          caption="Report definitions with their schedule, classification and run history"
          columns={definitionColumns}
          rows={definitions}
          getRowKey={(definition) => definition.id}
          empty={
            <EmptyState
              title="No reports defined"
              detail="A report definition sets its schedule, recipients, filters and masking."
            />
          }
        />
      </Panel>

      <Panel
        title="Run history"
        eyebrow="Most recent first"
        description="Each run records the period it covered and how much evidence it drew on."
      >
        <DataTable
          caption="Report runs with the period covered, status and whether an artefact was produced"
          columns={runColumns}
          rows={runs.slice(0, 25)}
          getRowKey={(run) => run.id}
          empty={
            <EmptyState
              title="No runs yet"
              detail="Reports run on their schedule once activated."
            />
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
      </Panel>
    </DomainPage>
  );
}
