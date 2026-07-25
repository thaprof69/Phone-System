import Link from 'next/link';
import {
  Banner,
  DataTable,
  EmptyState,
  Panel,
  StatusPill,
  formatDuration,
  formatNumber,
  formatPercent,
  type Column,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../../domain-page';
import { apiGet } from '../../../lib/api';

export const dynamic = 'force-dynamic';

type VersionPerformance = {
  version: string;
  callsReceived: number;
  callsCompleted: number;
  containment: number | null;
  transferRate: number | null;
  callbackRate: number | null;
  failedProcessingRate: number | null;
  averageDurationSeconds: number | null;
  averageAiLatencyMs: number | null;
  testPassRate: number | null;
  testRunsEvaluated: number;
  customerFollowUpRate: number | null;
};

type Response = { generatedAt: string; versions: VersionPerformance[] };

function rate(value: number | null): string {
  return value === null ? 'Not yet instrumented' : formatPercent(value);
}

export default async function AgentPerformancePage() {
  const response = await apiGet<Response>('/analytics/agent-performance', {
    purpose: 'ANALYTICS',
  });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Intelligence"
        title="Agent performance"
        description="Containment, transfer, callback and failure rate by receptionist version."
      >
        <LoadFailure subject="Agent performance" reason={response.reason} />
      </DomainPage>
    );
  }

  const { versions } = response.data;

  const columns: Column<VersionPerformance>[] = [
    {
      key: 'version',
      header: 'Version',
      render: (row) => (
        <Link className="row-link" href={`/calls?agentVersion=${row.version}`}>
          Version {row.version}
        </Link>
      ),
    },
    {
      key: 'callsReceived',
      header: 'Calls handled',
      align: 'end',
      render: (row) => formatNumber(row.callsReceived),
    },
    {
      key: 'containment',
      header: 'Containment',
      align: 'end',
      render: (row) => rate(row.containment),
    },
    {
      key: 'transferRate',
      header: 'Transfer rate',
      align: 'end',
      render: (row) => rate(row.transferRate),
    },
    {
      key: 'callbackRate',
      header: 'Callback rate',
      align: 'end',
      render: (row) => rate(row.callbackRate),
      priority: 'secondary',
    },
    {
      key: 'failedProcessingRate',
      header: 'Failed processing',
      align: 'end',
      render: (row) => rate(row.failedProcessingRate),
      priority: 'secondary',
    },
    {
      key: 'averageDurationSeconds',
      header: 'Avg. duration',
      align: 'end',
      render: (row) =>
        row.averageDurationSeconds === null
          ? 'Not yet instrumented'
          : formatDuration(row.averageDurationSeconds),
      priority: 'secondary',
    },
    {
      key: 'averageAiLatencyMs',
      header: 'Avg. AI latency',
      align: 'end',
      render: (row) =>
        row.averageAiLatencyMs === null
          ? 'Not yet instrumented'
          : `${formatNumber(Math.round(row.averageAiLatencyMs))} ms`,
      priority: 'secondary',
    },
    {
      key: 'testPassRate',
      header: 'Test pass rate',
      align: 'end',
      render: (row) =>
        row.testRunsEvaluated === 0
          ? 'Not yet instrumented'
          : `${rate(row.testPassRate)} (${formatNumber(row.testRunsEvaluated)} evaluated)`,
      priority: 'secondary',
    },
    {
      key: 'customerFollowUpRate',
      header: 'Customer follow-up',
      align: 'end',
      render: () => 'Not yet instrumented',
      priority: 'secondary',
    },
  ];

  return (
    <DomainPage
      eyebrow="Intelligence"
      title="Agent performance"
      description="Which receptionist version actually handled each call, honouring the real release timeline, crossed against outcome, duration, AI latency and test evidence."
      meta={<StatusPill tone="neutral">{formatNumber(versions.length)} versions</StatusPill>}
    >
      <Banner tone="info" title="Customer follow-up rate is not yet instrumented">
        No caller or customer identity is recorded anywhere in this platform, so a call cannot be
        linked back to a repeat caller by version. See Customer continuity for the one platform-wide
        repeat-contact figure that does exist.
      </Banner>

      <Panel
        title="Performance by version"
        eyebrow="Version drilled through to the calls it handled"
        description="Each version links to the calls it actually handled, filtered on the same release timeline used to seed this table."
      >
        <DataTable
          caption="Agent performance by version: calls handled, containment, transfer, callback, failure, duration, AI latency and test evidence"
          columns={columns}
          rows={versions}
          getRowKey={(row) => row.version}
          empty={
            <EmptyState
              title="No versioned call data yet"
              detail="A version appears here once at least one call has been attributed to it."
            />
          }
        />
      </Panel>
    </DomainPage>
  );
}
