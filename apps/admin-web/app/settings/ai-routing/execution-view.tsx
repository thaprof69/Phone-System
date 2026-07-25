import {
  DataTable,
  DateRangeFields,
  EmptyState,
  FilterBar,
  MetricCard,
  MetricGrid,
  Pagination,
  Panel,
  SelectField,
  StatusPill,
  TechnicalDetails,
  formatCurrencyFromMicros,
  formatDateTime,
  formatLatency,
  formatNumber,
  formatTokens,
  humaniseState,
  shortId,
  toneForState,
  type Column,
} from '@quantum-parks/ui';

/**
 * Execution history.
 *
 * This replaces a screen that printed `.length`. A count answers nothing when
 * enrichment misbehaves — what an operator needs is which capability ran, on which
 * model and prompt version, what it cost, how long it took, and whether it fell back.
 * All of that was already recorded and simply never surfaced.
 */

export type ExecutionRun = {
  id: string;
  capabilityKey: string;
  capabilityDisplayName: string | null;
  capabilityVersion: number | null;
  sourceRecordId: string;
  sourceRevisionId: string;
  state: string;
  attempt: number;
  replayOfRunId: string | null;
  errorCode: string | null;
  safeError: string | null;
  startedAt: string;
  completedAt: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costMicros: number | null;
  currency: string | null;
  correlationId: string;
  causationId: string | null;
  provider: string | null;
  providerRequestId: string | null;
  model: string | null;
  providerModelVersion: string | null;
  promptVersionId: string | null;
  schemaVersionId: string | null;
  taxonomyVersionId: string | null;
  routeVersionId: string | null;
  contextManifestId: string | null;
  outputRevisionId: string | null;
  fallbackUsed: boolean;
  qualityFlags: string[];
  confidence: string | null;
};

const SUCCESS_STATES = ['SUCCESS', 'FALLBACK_USED'];

export type ExecutionFilters = {
  from?: string | undefined;
  to?: string | undefined;
  provider?: string | undefined;
  model?: string | undefined;
  capability?: string | undefined;
  state?: string | undefined;
  fallback?: string | undefined;
};

/**
 * Applies the operator's filters to the run history.
 *
 * Exported so the same predicate is used to build the table, the counts above it and
 * the pagination total. Deriving those from different code paths is how a page ends up
 * claiming 40 results and showing 12.
 */
export function filterRuns(runs: ExecutionRun[], filters: ExecutionFilters): ExecutionRun[] {
  const from = filters.from ? new Date(`${filters.from}T00:00:00`) : null;
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999`) : null;

  return runs.filter((run) => {
    const started = new Date(run.startedAt);
    if (from && started < from) return false;
    if (to && started > to) return false;
    if (filters.provider && run.provider !== filters.provider) return false;
    if (filters.model && run.model !== filters.model) return false;
    if (filters.capability && run.capabilityKey !== filters.capability) return false;
    if (filters.state && run.state !== filters.state) return false;
    if (filters.fallback === 'yes' && !run.fallbackUsed) return false;
    if (filters.fallback === 'no' && run.fallbackUsed) return false;
    return true;
  });
}

const PAGE_SIZE = 25;

/**
 * The choices offered in each filter, derived from the *unfiltered* history.
 *
 * Deriving them from the filtered rows would empty the dropdown that produced the
 * current filter, leaving no way back except editing the URL.
 */
export function executionFilterOptions(runs: ExecutionRun[]) {
  const distinct = (pick: (run: ExecutionRun) => string | null) =>
    [...new Set(runs.map(pick).filter((value): value is string => Boolean(value)))].sort();
  return {
    providers: distinct((run) => run.provider),
    models: distinct((run) => run.model),
    capabilities: distinct((run) => run.capabilityKey),
    states: distinct((run) => run.state),
  };
}

export function ExecutionView({
  runs,
  services,
  routes,
  filters,
  options,
  page,
  basePath,
}: {
  /** Already filtered; the metrics and pagination below describe this same set. */
  runs: ExecutionRun[];
  services: number;
  routes: number;
  filters: ExecutionFilters;
  options: ReturnType<typeof executionFilterOptions>;
  page: number;
  basePath: string;
}) {
  const failures = runs.filter((run) => !SUCCESS_STATES.includes(run.state));
  const fallbacks = runs.filter((run) => run.fallbackUsed);
  const totalCost = runs.reduce((sum, run) => sum + (run.costMicros ?? 0), 0);

  const pageCount = Math.max(1, Math.ceil(runs.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(page, 1), pageCount);
  const visible = runs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const buildHref = (next: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries({ ...filters, ...next })) {
      if (value) query.set(name, value);
    }
    return `${basePath}?${query.toString()}`;
  };

  const columns: Column<ExecutionRun>[] = [
    {
      key: 'capability',
      header: 'Capability',
      render: (run) => (
        <>
          {humaniseState(run.capabilityKey)}
          <small className="cell-sub">
            {formatDateTime(run.startedAt)}
            {run.attempt > 1 ? ` · attempt ${run.attempt}` : ''}
          </small>
        </>
      ),
    },
    {
      key: 'state',
      header: 'Result',
      render: (run) => (
        <>
          <StatusPill tone={toneForState(run.state)}>{humaniseState(run.state)}</StatusPill>
          {run.fallbackUsed ? <small className="cell-sub">Fallback path used</small> : null}
        </>
      ),
    },
    {
      key: 'model',
      header: 'Model',
      render: (run) => (
        <>
          {run.model ?? '—'}
          <small className="cell-sub">{run.provider ?? 'No provider recorded'}</small>
        </>
      ),
    },
    {
      key: 'latency',
      header: 'Latency',
      align: 'end',
      render: (run) => formatLatency(run.latencyMs),
    },
    {
      key: 'tokens',
      header: 'Tokens',
      align: 'end',
      render: (run) =>
        run.inputTokens === null ? (
          <span className="muted-cell">—</span>
        ) : (
          <>
            {formatTokens(run.inputTokens)} in
            <small className="cell-sub">{formatTokens(run.outputTokens)} out</small>
          </>
        ),
      priority: 'secondary',
    },
    {
      key: 'cost',
      header: 'Cost',
      align: 'end',
      render: (run) => formatCurrencyFromMicros(run.costMicros, run.currency ?? 'GBP'),
    },
    {
      key: 'source',
      header: 'About',
      render: (run) => (
        <a className="row-link" href={`/calls/${run.sourceRecordId}`}>
          {shortId(run.sourceRecordId)}
        </a>
      ),
      priority: 'secondary',
    },
  ];

  return (
    <>
      <MetricGrid>
        <MetricCard
          label="Runs recorded"
          value={formatNumber(runs.length)}
          detail={`${formatNumber(services)} services · ${formatNumber(routes)} routes`}
        />
        <MetricCard
          label="Failures"
          value={formatNumber(failures.length)}
          detail="Did not produce a valid artefact"
          tone={failures.length > 0 ? 'warning' : 'good'}
        />
        <MetricCard
          label="Fallback used"
          value={formatNumber(fallbacks.length)}
          detail="Primary candidate did not answer"
          tone={fallbacks.length > 0 ? 'warning' : 'good'}
        />
        <MetricCard
          label="Spend on these runs"
          value={formatCurrencyFromMicros(totalCost)}
          detail="Priced from recorded per-million rates"
        />
      </MetricGrid>

      <Panel
        title="Every run recorded"
        eyebrow="Most recent first"
        description="Every run carries its full provenance: capability, model, prompt, schema, taxonomy, route and the record it was about."
      >
        <FilterBar action={basePath} resetHref={basePath} label="Filter execution runs">
          <DateRangeFields legend="Started between" fromValue={filters.from} toValue={filters.to} />
          <SelectField
            id="filter-capability"
            name="capability"
            label="Capability"
            placeholder="Any capability"
            defaultValue={filters.capability ?? ''}
            options={options.capabilities.map((value) => ({
              value,
              label: humaniseState(value),
            }))}
          />
          <SelectField
            id="filter-provider"
            name="provider"
            label="Provider"
            placeholder="Any provider"
            defaultValue={filters.provider ?? ''}
            options={options.providers.map((value) => ({ value, label: value }))}
          />
          <SelectField
            id="filter-model"
            name="model"
            label="Model"
            placeholder="Any model"
            defaultValue={filters.model ?? ''}
            options={options.models.map((value) => ({ value, label: value }))}
          />
          <SelectField
            id="filter-state"
            name="state"
            label="Result"
            placeholder="Any result"
            defaultValue={filters.state ?? ''}
            options={options.states.map((value) => ({
              value,
              label: humaniseState(value),
            }))}
          />
          <SelectField
            id="filter-fallback"
            name="fallback"
            label="Fallback"
            placeholder="Either"
            defaultValue={filters.fallback ?? ''}
            options={[
              { value: 'yes', label: 'Fallback was used' },
              { value: 'no', label: 'Primary answered' },
            ]}
          />
        </FilterBar>

        <DataTable
          caption="AI execution runs with their result, model, latency and cost"
          columns={columns}
          rows={visible}
          getRowKey={(run) => run.id}
          empty={
            <EmptyState
              title={
                runs.length === 0 && Object.values(filters).some(Boolean)
                  ? 'No runs match these filters'
                  : 'No runs recorded'
              }
              detail={
                Object.values(filters).some(Boolean)
                  ? 'Widen the date range or clear a filter.'
                  : 'Enrichment runs appear here once a call completes post-call processing.'
              }
            />
          }
        />
        <Pagination
          page={currentPage}
          pageSize={PAGE_SIZE}
          total={runs.length}
          buildHref={(next) => buildHref({ page: String(next) })}
        />
      </Panel>

      {failures.length > 0 ? (
        <Panel
          title="Failures"
          eyebrow={`${formatNumber(failures.length)} runs`}
          description="Each failure states which explicit result state the orchestrator returned. Enrichment failing degrades a call to partial; it never loses evidence."
        >
          <ul className="failure-reasons">
            {failures.slice(0, 12).map((run) => (
              <li key={run.id}>
                <StatusPill tone={toneForState(run.state)}>{humaniseState(run.state)}</StatusPill>
                <span>{run.safeError ?? 'No safe error recorded'}</span>
                <a className="row-link" href={`/calls/${run.sourceRecordId}`}>
                  {shortId(run.sourceRecordId)}
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <TechnicalDetails summary="Provenance for the most recent run">
        {runs[0] ? (
          <dl className="technical-grid">
            <div>
              <dt>Run id</dt>
              <dd>{runs[0].id}</dd>
            </div>
            <div>
              <dt>Correlation id</dt>
              <dd>{runs[0].correlationId}</dd>
            </div>
            <div>
              <dt>Causation id</dt>
              <dd>{runs[0].causationId ?? '—'}</dd>
            </div>
            <div>
              <dt>Prompt version</dt>
              <dd>{runs[0].promptVersionId ?? '—'}</dd>
            </div>
            <div>
              <dt>Schema version</dt>
              <dd>{runs[0].schemaVersionId ?? '—'}</dd>
            </div>
            <div>
              <dt>Taxonomy version</dt>
              <dd>{runs[0].taxonomyVersionId ?? '—'}</dd>
            </div>
            <div>
              <dt>Route version</dt>
              <dd>{runs[0].routeVersionId ?? '—'}</dd>
            </div>
            <div>
              <dt>Context manifest</dt>
              <dd>{runs[0].contextManifestId ?? '—'}</dd>
            </div>
            <div>
              <dt>Output revision</dt>
              <dd>{runs[0].outputRevisionId ?? '—'}</dd>
            </div>
            <div>
              <dt>Provider request id</dt>
              <dd>{runs[0].providerRequestId ?? '—'}</dd>
            </div>
          </dl>
        ) : (
          <p>No runs to describe.</p>
        )}
      </TechnicalDetails>
    </>
  );
}
