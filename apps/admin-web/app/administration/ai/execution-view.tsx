import {
  DataTable,
  EmptyState,
  MetricCard,
  MetricGrid,
  Panel,
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

export function ExecutionView({
  runs,
  services,
  routes,
}: {
  runs: ExecutionRun[];
  services: number;
  routes: number;
}) {
  const failures = runs.filter((run) => !SUCCESS_STATES.includes(run.state));
  const fallbacks = runs.filter((run) => run.fallbackUsed);
  const totalCost = runs.reduce((sum, run) => sum + (run.costMicros ?? 0), 0);

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
        title="Execution history"
        eyebrow="Most recent first"
        description="Every run carries its full provenance: capability, model, prompt, schema, taxonomy, route and the record it was about."
      >
        <DataTable
          caption="AI execution runs with their result, model, latency and cost"
          columns={columns}
          rows={runs}
          getRowKey={(run) => run.id}
          empty={
            <EmptyState
              title="No runs recorded"
              detail="Enrichment runs appear here once a call completes post-call processing."
            />
          }
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
