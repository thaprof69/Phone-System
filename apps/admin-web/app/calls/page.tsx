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
import type { CallRow } from '../../lib/types';

export const dynamic = 'force-dynamic';

const PROCESSING_STATES = [
  'RECEIVED',
  'NORMALIZING',
  'REDACTED',
  'SUMMARIZING',
  'CLASSIFYING',
  'COMPLETED',
  'PARTIAL',
  'FAILED_RETRYABLE',
  'FAILED_FINAL',
];

export default async function CallsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const response = await apiGet<{ items: CallRow[] }>('/calls?limit=100', {
    purpose: 'OPERATIONS',
  });

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
  const state = readParam(params, 'state');
  const search = readParam(params, 'q');

  const filtered = all.filter((row) => {
    if (park && row.park !== park) return false;
    if (language && row.language !== language) return false;
    if (state && row.processingState !== state) return false;
    return matchesSearch(row, search, [
      (item) => item.providerConversationId,
      (item) => item.park,
      (item) => item.language,
      (item) => item.processingState,
    ]);
  });

  const sort = readSort(params, 'receivedAt');
  const sorted = sortRows(filtered, sort, {
    receivedAt: (row) => (row.receivedAt ? Date.parse(row.receivedAt) : null),
    park: (row) => row.park,
    language: (row) => row.language,
    processingState: (row) => row.processingState,
    reference: (row) => row.providerConversationId,
  });

  const page = readNumber(params, 'page', 1);
  const rows = paginate(sorted, page, DEFAULT_PAGE_SIZE);

  const parks = [
    ...new Set(all.map((row) => row.park).filter((value): value is string => Boolean(value))),
  ].sort();
  const languages = [
    ...new Set(all.map((row) => row.language).filter((value): value is string => Boolean(value))),
  ].sort();

  const columns: Column<CallRow>[] = [
    {
      key: 'receivedAt',
      header: 'Received',
      sortable: true,
      render: (row) => (
        <>
          {formatDateTime(row.receivedAt)}
          <small className="cell-sub">{formatRelativeTime(row.receivedAt)}</small>
        </>
      ),
    },
    { key: 'park', header: 'Park', sortable: true, render: (row) => titleCase(row.park) },
    {
      key: 'language',
      header: 'Language',
      sortable: true,
      render: (row) => (row.language ?? '—').toUpperCase(),
    },
    {
      key: 'processingState',
      header: 'Processing',
      sortable: true,
      render: (row) => (
        <StatusPill tone={toneForState(row.processingState)}>
          {humaniseState(row.processingState)}
        </StatusPill>
      ),
    },
    {
      key: 'sensitive',
      header: 'Handling',
      render: (row) =>
        row.sensitive ? (
          <StatusPill tone="warning" title="Sensitive interaction handling applies">
            Sensitive
          </StatusPill>
        ) : (
          <span className="muted-cell">Standard</span>
        ),
      priority: 'secondary',
    },
    {
      key: 'reference',
      header: 'Provider reference',
      sortable: true,
      render: (row) => <code className="inline-code">{row.providerConversationId}</code>,
      priority: 'secondary',
    },
    {
      key: 'origin',
      header: 'Origin',
      render: (row) => (row.synthetic ? <SyntheticBadge compact /> : 'Live'),
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
      <FilterBar action="/calls" resetHref="/calls" label="Filter calls">
        <SearchInput
          label="Search"
          placeholder="Provider reference, park, language"
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
          id="state"
          label="Processing state"
          placeholder="Any state"
          options={PROCESSING_STATES.map((value) => ({ value, label: humaniseState(value) }))}
          {...(state ? { defaultValue: state } : {})}
        />
      </FilterBar>

      <Panel
        title={`${formatNumber(sorted.length)} ${sorted.length === 1 ? 'call' : 'calls'}`}
        eyebrow={filtered.length === all.length ? 'All records' : 'Filtered'}
      >
        <DataTable
          caption="Calls with their park, language, processing state and provider reference"
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

function titleCase(value: string | null): string {
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1);
}
