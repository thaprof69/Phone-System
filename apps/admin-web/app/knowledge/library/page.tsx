import {
  Banner,
  DataTable,
  EmptyState,
  FilterBar,
  Pagination,
  Panel,
  SearchInput,
  SelectField,
  StatusPill,
  formatDate,
  formatNumber,
  formatRelativeTime,
  humaniseState,
  toneForState,
  type Column,
  type Tone,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../../domain-page';
import { apiGet } from '../../../lib/api';
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
} from '../../../lib/list-view';

export const dynamic = 'force-dynamic';

type KnowledgeRow = {
  id: string;
  title: string;
  category: string;
  park: string | null;
  language: string;
  riskClass: string;
  synthetic: boolean;
  versionId: string | null;
  version: number | null;
  state: string | null;
  checksum: string | null;
  effectiveAt: string | null;
  expiresAt: string | null;
};

const EXPIRY_WINDOW_MS = 30 * 86_400_000;

function riskTone(risk: string): Tone {
  if (risk === 'HIGH') return 'danger';
  if (risk === 'MEDIUM') return 'warning';
  return 'neutral';
}

export default async function KnowledgeLibraryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const response = await apiGet<{ items: KnowledgeRow[] }>('/knowledge', {
    purpose: 'RELEASE_MANAGEMENT',
  });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Knowledge"
        title="Library"
        description="The approved company answers the receptionist is allowed to give."
      >
        <LoadFailure subject="Knowledge library" reason={response.reason} />
      </DomainPage>
    );
  }

  const all = response.data.items;
  const now = Date.now();
  const expiryOf = (row: KnowledgeRow) => (row.expiresAt ? Date.parse(row.expiresAt) : null);
  const isExpired = (row: KnowledgeRow) => {
    const expiry = expiryOf(row);
    return expiry !== null && expiry <= now;
  };
  const isExpiring = (row: KnowledgeRow) => {
    const expiry = expiryOf(row);
    return expiry !== null && expiry > now && expiry - now < EXPIRY_WINDOW_MS;
  };

  const category = readParam(params, 'category');
  const risk = readParam(params, 'risk');
  const state = readParam(params, 'state');
  const search = readParam(params, 'q');

  const filtered = all.filter((row) => {
    if (category && row.category !== category) return false;
    if (risk && row.riskClass !== risk) return false;
    if (state === 'expired' && !isExpired(row)) return false;
    if (state === 'expiring' && !isExpiring(row)) return false;
    if (state && !['expired', 'expiring'].includes(state) && row.state !== state) return false;
    return matchesSearch(row, search, [(item) => item.title, (item) => item.category]);
  });

  const sort = readSort(params, 'title', 'asc');
  const sorted = sortRows(filtered, sort, {
    title: (row) => row.title,
    category: (row) => row.category,
    risk: (row) => row.riskClass,
    state: (row) => row.state,
    expiresAt: (row) => expiryOf(row),
  });

  const page = readNumber(params, 'page', 1);
  const rows = paginate(sorted, page, DEFAULT_PAGE_SIZE);

  const categories = [...new Set(all.map((row) => row.category))].sort();
  const states = [...new Set(all.map((row) => row.state).filter(Boolean))].sort() as string[];
  const expiredCount = all.filter(isExpired).length;

  const columns: Column<KnowledgeRow>[] = [
    {
      key: 'title',
      header: 'Title',
      sortable: true,
      render: (row) => (
        <>
          {row.title}
          <small className="cell-sub">
            {humaniseState(row.category)}
            {row.park ? ` · ${titleCase(row.park)}` : ' · all parks'}
          </small>
        </>
      ),
    },
    {
      key: 'language',
      header: 'Language',
      render: (row) => row.language.toUpperCase(),
      priority: 'secondary',
    },
    {
      key: 'risk',
      header: 'Risk',
      sortable: true,
      render: (row) => (
        <StatusPill tone={riskTone(row.riskClass)}>{humaniseState(row.riskClass)}</StatusPill>
      ),
    },
    {
      key: 'state',
      header: 'State',
      sortable: true,
      render: (row) => (
        <StatusPill tone={toneForState(row.state)}>{humaniseState(row.state)}</StatusPill>
      ),
    },
    {
      key: 'expiresAt',
      header: 'Expires',
      sortable: true,
      render: (row) => {
        if (!row.expiresAt) return <span className="muted-cell">No expiry</span>;
        if (isExpired(row))
          return (
            <span className="overdue">
              Expired
              <small className="cell-sub">{formatDate(row.expiresAt)}</small>
            </span>
          );
        return (
          <>
            {formatRelativeTime(row.expiresAt)}
            <small className="cell-sub">{formatDate(row.expiresAt)}</small>
          </>
        );
      },
    },
    {
      key: 'version',
      header: 'Version',
      align: 'end',
      render: (row) => (row.version === null ? '—' : `v${row.version}`),
      priority: 'secondary',
    },
  ];

  return (
    <DomainPage
      eyebrow="Knowledge"
      title="Library"
      description="Approved company knowledge. The receptionist may answer only from what is active and in date here."
      meta={<StatusPill tone="neutral">{formatNumber(all.length)} assets</StatusPill>}
    >
      {expiredCount > 0 ? (
        <Banner
          tone="warning"
          title={`${formatNumber(expiredCount)} assets are past their expiry date`}
        >
          Expired content is still assigned to the agent. Review and re-approve it, or withdraw it.
        </Banner>
      ) : null}

      <FilterBar
        action="/knowledge/library"
        resetHref="/knowledge/library"
        label="Filter knowledge"
      >
        <SearchInput
          label="Search"
          placeholder="Title or category"
          {...(search ? { defaultValue: search } : {})}
        />
        <SelectField
          id="category"
          label="Category"
          placeholder="All categories"
          options={categories.map((value) => ({ value, label: humaniseState(value) }))}
          {...(category ? { defaultValue: category } : {})}
        />
        <SelectField
          id="risk"
          label="Risk"
          placeholder="Any risk"
          options={['LOW', 'MEDIUM', 'HIGH'].map((value) => ({
            value,
            label: humaniseState(value),
          }))}
          {...(risk ? { defaultValue: risk } : {})}
        />
        <SelectField
          id="state"
          label="State"
          placeholder="Any state"
          options={[
            ...states.map((value) => ({ value, label: humaniseState(value) })),
            { value: 'expiring', label: 'Expiring within 30 days' },
            { value: 'expired', label: 'Past expiry' },
          ]}
          {...(state ? { defaultValue: state } : {})}
        />
      </FilterBar>

      <Panel
        title={`${formatNumber(sorted.length)} ${sorted.length === 1 ? 'asset' : 'assets'}`}
        eyebrow={filtered.length === all.length ? 'All records' : 'Filtered'}
      >
        <DataTable
          caption="Knowledge assets with their category, risk class, state and expiry"
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          rowHref={(row) => `/knowledge/${row.id}`}
          sort={sort}
          buildSortHref={(key, direction) =>
            buildHref('/knowledge/library', params, { sort: key, dir: direction, page: undefined })
          }
          empty={
            <EmptyState
              title={all.length === 0 ? 'No knowledge yet' : 'No assets match these filters'}
              detail={
                all.length === 0
                  ? 'Draft facts, policies and schedules here. High-risk content needs an independent approver.'
                  : 'Adjust or clear the filters to see more assets.'
              }
            />
          }
        />
        <Pagination
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          total={sorted.length}
          buildHref={(next) => buildHref('/knowledge/library', params, { page: next })}
        />
      </Panel>
    </DomainPage>
  );
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
