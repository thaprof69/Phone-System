import {
  DataTable,
  EmptyState,
  StatusPill,
  formatNumber,
  formatRelativeTime,
  humaniseState,
  type Column,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../domain-page';
import { apiGet } from '../../lib/api';
import { ReportScheduleToggle, RunReportButton } from './report-actions';

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

type Run = { id: string; definitionId: string; status: string; createdAt: string };

function classificationTone(classification: string): 'danger' | 'warning' | 'neutral' {
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

export default async function ScheduledReportsPage() {
  const response = await apiGet<{ definitions: Definition[]; runs: Run[] }>('/reports', {
    purpose: 'ANALYTICS',
  });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Reports"
        title="Scheduled reports"
        description="Report definitions, their schedule and classification."
      >
        <LoadFailure subject="Reports" reason={response.reason} />
      </DomainPage>
    );
  }

  const { definitions, runs } = response.data;
  const runsByDefinition = new Map<string, Run[]>();
  for (const run of runs) {
    runsByDefinition.set(run.definitionId, [
      ...(runsByDefinition.get(run.definitionId) ?? []),
      run,
    ]);
  }

  const columns: Column<Definition>[] = [
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
    {
      key: 'manage',
      header: 'Change',
      render: (definition) => (
        <details className="row-actions">
          <summary>Manage</summary>
          <div className="row-actions-body">
            <RunReportButton definitionId={definition.id} />
            <ReportScheduleToggle definitionId={definition.id} active={definition.active} />
          </div>
        </details>
      ),
    },
  ];

  return (
    <DomainPage
      eyebrow="Reports"
      title="Scheduled reports"
      description="Classification governs masking and who a report can be delivered to."
      meta={<StatusPill tone="neutral">{formatNumber(definitions.length)} definitions</StatusPill>}
    >
      <DataTable
        caption="Report definitions with their schedule, classification and run history"
        columns={columns}
        rows={definitions}
        getRowKey={(definition) => definition.id}
        empty={
          <EmptyState
            title="No reports defined"
            detail="A report definition sets its schedule, recipients, filters and masking."
          />
        }
      />
    </DomainPage>
  );
}
