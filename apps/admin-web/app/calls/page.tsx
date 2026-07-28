import {
  DataTable,
  EmptyState,
  FilterBar,
  Pagination,
  Panel,
  SearchInput,
  SelectField,
  StatusPill,
  SyntheticBadge,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  humaniseState,
  toneForState,
  type Column,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../domain-page';
import { apiGet } from '../../lib/api';
import {
  DEFAULT_PAGE_SIZE,
  buildHref,
  matchesSearch,
  paginate,
  readNumber,
  readParam,
  readSort,
  sortRows,
  type SearchParams,
} from '../../lib/list-view';
import type { CallRow, MissionControl, Operations, WorkItem } from '../../lib/types';
import {
  CallsMissionControl,
  type CallsAttentionSignal,
  type CallsMissionMetric,
} from './calls-mission-control';

export const dynamic = 'force-dynamic';

const CALL_STATUSES = ['COMPLETED', 'FAILED'] as const;
const CALL_ORIGINS = ['LIVE', 'SIMULATION', 'SYNTHETIC'] as const;
const OPEN_WORK_STATES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS'];

type CallAdvisoryEvidence = {
  id: string;
  callStatus: 'COMPLETED' | 'FAILED';
  outcome: string | null;
  sentiment: string | null;
  durationSeconds: number | null;
};

export default async function CallsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const [response, missionResponse, operationsResponse, advisoryResponse] = await Promise.all([
    apiGet<{ items: CallRow[] }>('/calls?limit=100', { purpose: 'OPERATIONS' }),
    apiGet<MissionControl>('/mission-control', { purpose: 'OPERATIONS' }),
    apiGet<Operations>('/operations', { purpose: 'OPERATIONS' }),
    apiGet<{ items: CallAdvisoryEvidence[] }>('/reports/explorer', {
      purpose: 'ANALYTICS',
    }),
  ]);

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Calls"
        title="All calls"
        description="Every call the platform holds a canonical record of."
      >
        <LoadFailure subject="Calls" reason={response.reason} />
      </DomainPage>
    );
  }

  const all = response.data.items;
  const park = readParam(params, 'park');
  const language = readParam(params, 'language');
  const status = readParam(params, 'status');
  const intent = readParam(params, 'intent');
  const origin = readParam(params, 'origin');
  const attention = readParam(params, 'attention');
  const agentVersion = readParam(params, 'agentVersion');
  const search = readParam(params, 'q');

  const filtered = all.filter((row) => {
    if (park && row.park !== park) return false;
    if (language && row.language !== language) return false;
    if (status && row.callStatus !== status) return false;
    if (intent && row.intent !== intent) return false;
    if (origin && row.origin !== origin) return false;
    if (attention === 'review' && row.processingState !== 'PARTIAL' && row.intent) return false;
    if (attention === 'sensitive' && !row.sensitive) return false;
    if (agentVersion && String(row.agentVersion ?? '') !== agentVersion) return false;
    return matchesSearch(row, search, [
      (item) => item.summary,
      (item) => item.intent,
      (item) => item.park,
      (item) => item.language,
      (item) => item.origin,
    ]);
  });

  const sort = readSort(params, 'receivedAt');
  const sorted = sortRows(filtered, sort, {
    receivedAt: (row) => (row.receivedAt ? Date.parse(row.receivedAt) : null),
    park: (row) => row.park,
    language: (row) => row.language,
    status: (row) => row.callStatus,
    reason: (row) => row.intent,
    origin: (row) => row.origin,
    call: (row) => callTitle(row),
  });

  const page = readNumber(params, 'page', 1);
  const rows = paginate(sorted, page, DEFAULT_PAGE_SIZE);

  const parks = [
    ...new Set(all.map((row) => row.park).filter((value): value is string => Boolean(value))),
  ].sort();
  const languages = [
    ...new Set(all.map((row) => row.language).filter((value): value is string => Boolean(value))),
  ].sort();
  const intents = [
    ...new Set(all.map((row) => row.intent).filter((value): value is string => Boolean(value))),
  ].sort();
  const operations = operationsResponse.ok ? operationsResponse.data : null;
  const mission = missionResponse.ok ? missionResponse.data : null;
  const now = Date.now();
  const openCallbacks =
    operations?.callbacks.filter((item) => OPEN_WORK_STATES.includes(item.status)) ?? [];
  const overdueWork = operations
    ? [...operations.callbacks, ...operations.tasks].filter((item) => isOverdue(item, now))
    : null;
  const failedCalls = all.filter((row) => row.callStatus === 'FAILED');
  const reviewCalls = all.filter((row) => row.processingState === 'PARTIAL' || row.intent === null);
  const sensitiveCalls = all.filter((row) => row.sensitive);
  const metrics: CallsMissionMetric[] = [
    {
      id: 'sla',
      label: 'SLA breached',
      value: overdueWork ? formatNumber(overdueWork.length) : '—',
      detail: overdueWork ? 'Past a customer commitment' : 'Queue unavailable',
      tone: overdueWork && overdueWork.length > 0 ? 'danger' : overdueWork ? 'good' : 'neutral',
      href: '/calls/sla',
    },
    {
      id: 'failed',
      label: 'Failed calls',
      value: formatNumber(failedCalls.length),
      detail: 'Processing did not complete',
      tone: failedCalls.length > 0 ? 'danger' : 'good',
      href: '/calls?status=FAILED',
    },
    {
      id: 'callbacks',
      label: 'Open callbacks',
      value: operations ? formatNumber(openCallbacks.length) : '—',
      detail: operations ? 'Awaiting customer follow-up' : 'Queue unavailable',
      tone: openCallbacks.length > 0 ? 'warning' : operations ? 'good' : 'neutral',
      href: '/calls/callbacks',
    },
    {
      id: 'review',
      label: 'Needs review',
      value: formatNumber(reviewCalls.length),
      detail: 'Partial or unclassified',
      tone: reviewCalls.length > 0 ? 'warning' : 'good',
      href: '/calls?attention=review',
    },
    {
      id: 'sensitive',
      label: 'Sensitive',
      value: formatNumber(sensitiveCalls.length),
      detail: 'Use restricted handling',
      tone: sensitiveCalls.length > 0 ? 'warning' : 'good',
      href: '/calls?attention=sensitive',
    },
  ];
  const signals = buildAttentionSignals({
    failedCalls,
    reviewCalls,
    sensitiveCalls,
    openCallbacks,
    overdueWork,
  });
  const callIds = new Set(all.map((row) => row.id));
  const advisoryRows = advisoryResponse.ok
    ? advisoryResponse.data.items.filter((row) => callIds.has(row.id))
    : null;
  const durations =
    advisoryRows?.flatMap((row) => (row.durationSeconds === null ? [] : [row.durationSeconds])) ??
    [];

  const columns: Column<CallRow>[] = [
    {
      key: 'call',
      header: 'Call',
      sortable: true,
      render: (row) => <span className="call-list-title">{callTitle(row)}</span>,
      width: '34%',
    },
    {
      key: 'reason',
      header: 'Call reason',
      sortable: true,
      render: (row) => humaniseState(row.intent ?? 'Unclassified'),
    },
    { key: 'park', header: 'Park', sortable: true, render: (row) => titleCase(row.park) },
    {
      key: 'receivedAt',
      header: 'Call time',
      sortable: true,
      render: (row) => (
        <>
          {formatDateTime(row.receivedAt)}
          <small className="cell-sub">{formatRelativeTime(row.receivedAt)}</small>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (row) => (
        <StatusPill tone={toneForState(row.callStatus)}>{humaniseState(row.callStatus)}</StatusPill>
      ),
    },
    {
      key: 'origin',
      header: 'Origin',
      sortable: true,
      render: (row) => originBadge(row.origin),
    },
    {
      key: 'language',
      header: 'Language',
      sortable: true,
      render: (row) => (row.language ?? '—').toUpperCase(),
      priority: 'secondary',
    },
  ];

  return (
    <DomainPage
      eyebrow="Calls"
      title="All calls"
      description="Every call the platform holds a canonical record of. Open a call to see its transcript, intelligence, outcome and follow-up."
      meta={<StatusPill tone="neutral">{formatNumber(all.length)} records</StatusPill>}
    >
      <CallsMissionControl
        metrics={metrics}
        signals={signals}
        cohort={{
          calls: all.length,
          completed: all.filter((row) => row.callStatus === 'COMPLETED').length,
          contained: advisoryRows?.filter((row) => row.outcome === 'RESOLVED_BY_AGENT').length ?? 0,
          unresolved:
            advisoryRows?.filter(
              (row) =>
                row.callStatus === 'FAILED' ||
                row.outcome === 'UNRESOLVED_KNOWLEDGE_GAP' ||
                row.outcome === 'TECHNICAL_FAILURE',
            ).length ?? 0,
          negative: advisoryRows?.filter((row) => row.sentiment === 'NEGATIVE').length ?? 0,
          averageDurationSeconds:
            durations.length > 0
              ? Math.round(
                  durations.reduce((total, duration) => total + duration, 0) / durations.length,
                )
              : 0,
        }}
        generatedAt={mission?.generatedAt ?? new Date().toISOString()}
        aiEvidenceAvailable={advisoryRows !== null}
      />

      <FilterBar action="/calls" resetHref="/calls" label="Filter calls">
        <SearchInput
          label="Search"
          placeholder="Summary, reason, park, language"
          {...(search ? { defaultValue: search } : {})}
        />
        <SelectField
          id="park"
          label="Park"
          placeholder="All parks"
          options={parks.map((value) => ({ value, label: titleCase(value) }))}
          {...(park ? { defaultValue: park } : {})}
        />
        <SelectField
          id="language"
          label="Language"
          placeholder="All languages"
          options={languages.map((value) => ({ value, label: value.toUpperCase() }))}
          {...(language ? { defaultValue: language } : {})}
        />
        <SelectField
          id="status"
          label="Status"
          placeholder="Any status"
          options={CALL_STATUSES.map((value) => ({ value, label: humaniseState(value) }))}
          {...(status ? { defaultValue: status } : {})}
        />
        <SelectField
          id="intent"
          label="Call reason"
          placeholder="Any reason"
          options={intents.map((value) => ({ value, label: humaniseState(value) }))}
          {...(intent ? { defaultValue: intent } : {})}
        />
        <SelectField
          id="origin"
          label="Origin"
          placeholder="Any origin"
          options={CALL_ORIGINS.map((value) => ({ value, label: humaniseState(value) }))}
          {...(origin ? { defaultValue: origin } : {})}
        />
      </FilterBar>

      <Panel
        title={`${formatNumber(sorted.length)} ${sorted.length === 1 ? 'call' : 'calls'}`}
        eyebrow={filtered.length === all.length ? 'All records' : 'Filtered'}
      >
        <DataTable
          caption="Calls with their summary, reason, park, received time, status and origin"
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          rowHref={(row) => `/calls/${row.id}`}
          sort={sort}
          buildSortHref={(key, direction) =>
            buildHref('/calls', params, { sort: key, dir: direction, page: undefined })
          }
          empty={
            <EmptyState
              title={all.length === 0 ? 'No calls recorded yet' : 'No calls match these filters'}
              detail={
                all.length === 0
                  ? 'Calls appear here once the voice runtime delivers a post-call webhook.'
                  : 'Adjust or clear the filters to see more records.'
              }
            />
          }
        />
        <Pagination
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          total={sorted.length}
          buildHref={(next) => buildHref('/calls', params, { page: next })}
        />
      </Panel>
    </DomainPage>
  );
}

function isOverdue(item: WorkItem, now: number): boolean {
  return (
    Boolean(item.dueAt) &&
    OPEN_WORK_STATES.includes(item.status) &&
    Date.parse(item.dueAt as string) < now
  );
}

function buildAttentionSignals(input: {
  failedCalls: CallRow[];
  reviewCalls: CallRow[];
  sensitiveCalls: CallRow[];
  openCallbacks: WorkItem[];
  overdueWork: WorkItem[] | null;
}): CallsAttentionSignal[] {
  const signals: CallsAttentionSignal[] = [];
  if (input.overdueWork && input.overdueWork.length > 0) {
    signals.push({
      id: 'sla_breaches',
      title: 'Customer commitments are overdue',
      detail: `${formatNumber(input.overdueWork.length)} callbacks or tasks are past due`,
      action: 'Open SLA and failures, then clear the longest-overdue commitment first.',
      count: input.overdueWork.length,
      severity: 'critical',
      href: '/calls/sla',
      evidenceCallIds: input.overdueWork.map((item) => item.conversationId),
    });
  }
  if (input.failedCalls.length > 0) {
    signals.push({
      id: 'failed_calls',
      title: 'Calls failed processing',
      detail: `${formatNumber(input.failedCalls.length)} records may lack complete intelligence`,
      action: 'Review failed ingestion before relying on summaries or classifications.',
      count: input.failedCalls.length,
      severity: 'critical',
      href: '/calls?status=FAILED',
      evidenceCallIds: input.failedCalls.map((row) => row.id),
    });
  }
  if (input.openCallbacks.length > 0) {
    signals.push({
      id: 'open_callbacks',
      title: 'Customers are awaiting callbacks',
      detail: `${formatNumber(input.openCallbacks.length)} follow-ups remain open`,
      action: 'Assign unowned callbacks and confirm the nearest due commitments.',
      count: input.openCallbacks.length,
      severity: 'high',
      href: '/calls/callbacks',
      evidenceCallIds: input.openCallbacks.map((item) => item.conversationId),
    });
  }
  if (input.reviewCalls.length > 0) {
    signals.push({
      id: 'review_calls',
      title: 'Call intelligence needs review',
      detail: `${formatNumber(input.reviewCalls.length)} calls are partial or unclassified`,
      action: 'Inspect transcripts and correct missing call reasons before trend analysis.',
      count: input.reviewCalls.length,
      severity: 'medium',
      href: '/calls?attention=review',
      evidenceCallIds: input.reviewCalls.map((row) => row.id),
    });
  }
  if (input.sensitiveCalls.length > 0) {
    signals.push({
      id: 'sensitive_calls',
      title: 'Sensitive calls require careful handling',
      detail: `${formatNumber(input.sensitiveCalls.length)} records carry restricted context`,
      action: 'Open only the records required for authorised follow-up.',
      count: input.sensitiveCalls.length,
      severity: 'medium',
      href: '/calls?attention=sensitive',
      evidenceCallIds: input.sensitiveCalls.map((row) => row.id),
    });
  }
  return signals;
}

function titleCase(value: string | null): string {
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function callTitle(row: CallRow): string {
  if (row.summary?.trim()) return row.summary.trim();
  const reason = humaniseState(row.intent ?? 'Unclassified');
  return row.park ? `${reason} at ${titleCase(row.park)}` : reason;
}

function originBadge(origin: CallRow['origin']) {
  if (origin === 'SYNTHETIC') return <SyntheticBadge compact />;
  return (
    <StatusPill tone={origin === 'SIMULATION' ? 'info' : 'neutral'}>
      {humaniseState(origin)}
    </StatusPill>
  );
}
