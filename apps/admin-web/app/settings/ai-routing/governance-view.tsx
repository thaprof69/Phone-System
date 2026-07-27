import {
  Banner,
  DataTable,
  EmptyState,
  Panel,
  StatusPill,
  formatChecksum,
  formatCurrencyFromMicros,
  formatDateTime,
  formatNumber,
  humaniseState,
  ratio,
  toneForState,
  type Column,
} from '@quantum-parks/ui';
import { ArtefactActions, BudgetForm } from './ai-actions';

/**
 * Governance: prompts, schemas, taxonomies and budgets as real records.
 *
 * These previously rendered as four numbers. What matters about a prompt version is
 * its state, who approved it and when it was activated — none of which a count carries.
 */

export type PromptVersion = {
  id: string;
  promptId: string;
  promptKey: string;
  version: number;
  state: string;
  checksum: string;
  authorId: string | null;
  approvedBy: string | null;
  activatedAt: string | null;
  createdAt: string;
};

export type SchemaVersion = {
  id: string;
  schemaId: string;
  version: number;
  state: string;
  checksum: string;
  codeOwned: boolean;
  registeredByBuild: boolean;
  approvedBy: string | null;
  createdAt: string;
};

export type TaxonomyVersion = {
  id: string;
  taxonomyId: string;
  version: number;
  state: string;
  values: string[];
  checksum: string;
  approvedBy: string | null;
  createdAt: string;
};

export type BudgetPolicy = {
  id: string;
  key: string;
  environment: string;
  scopeType: string;
  scopeId: string | null;
  dailyLimitMicros: number | null;
  monthlyLimitMicros: number | null;
  perRequestLimitMicros: number | null;
  currency: string;
  active: boolean;
  approvedBy: string | null;
};

/**
 * Spend as a share of its limit.
 *
 * Rounding a real but tiny spend to "0%" reads as "nothing has been spent", which is a
 * different claim. Anything above zero that rounds down reports "under 1%" instead.
 */
function percentOfLimit(spendMicros: number, limitMicros: number): string {
  const share = ratio(spendMicros, limitMicros);
  if (share === null) return 'no limit set';
  const percent = share * 100;
  if (percent > 0 && percent < 1) return 'under 1%';
  return `${Math.round(percent)}%`;
}

/** A budget policy with the spend actually recorded against its scope. */
export type BudgetStatusRow = BudgetPolicy & {
  scopeLabel: string | null;
  dailySpendMicros: number;
  monthlySpendMicros: number;
  dailyBreached: boolean;
  monthlyBreached: boolean;
  perRequestBreaches: number;
  warningThresholdReached: boolean;
};

export function GovernanceView({
  prompts,
  schemas,
  taxonomies,
  budgetStatus,
  scopeOptions,
  spendMicros,
  section = 'all',
}: {
  prompts: PromptVersion[];
  schemas: SchemaVersion[];
  taxonomies: TaxonomyVersion[];
  budgetStatus: BudgetStatusRow[];
  /** What a provider-, model- or capability-scoped budget may point at. */
  scopeOptions: Array<{ value: string; label: string }>;
  spendMicros: number;
  /** Which panel(s) to render — AI Routing splits this one view across three routes. */
  section?: 'all' | 'budgets' | 'prompts' | 'schemas';
}) {
  const activeDailyBudget = budgetStatus
    .filter((budget) => budget.active && budget.dailyLimitMicros)
    .reduce((lowest, budget) => Math.min(lowest, budget.dailyLimitMicros ?? Infinity), Infinity);
  const dailyLimit = Number.isFinite(activeDailyBudget) ? activeDailyBudget : null;
  const overBudget = dailyLimit !== null && spendMicros > dailyLimit;

  const promptColumns: Column<PromptVersion>[] = [
    { key: 'prompt', header: 'Prompt', render: (row) => row.promptKey },
    { key: 'version', header: 'Version', render: (row) => `v${row.version}` },
    {
      key: 'state',
      header: 'State',
      render: (row) => (
        <StatusPill tone={toneForState(row.state)}>{humaniseState(row.state)}</StatusPill>
      ),
    },
    {
      key: 'approval',
      header: 'Approved by',
      render: (row) => row.approvedBy ?? <span className="muted-cell">Not approved</span>,
    },
    {
      key: 'activated',
      header: 'Activated',
      render: (row) =>
        row.activatedAt ? (
          formatDateTime(row.activatedAt)
        ) : (
          <span className="muted-cell">Never</span>
        ),
    },
    {
      key: 'checksum',
      header: 'Checksum',
      render: (row) => <code className="inline-code">{formatChecksum(row.checksum)}</code>,
      priority: 'secondary',
    },
    {
      key: 'actions',
      header: 'Lifecycle',
      render: (row) => (
        <details className="row-actions">
          <summary>Move</summary>
          <div className="row-actions-body">
            <ArtefactActions kind="prompt" versionId={row.id} state={row.state} />
          </div>
        </details>
      ),
    },
  ];

  const schemaColumns: Column<SchemaVersion>[] = [
    { key: 'version', header: 'Version', render: (row) => `v${row.version}` },
    {
      key: 'state',
      header: 'State',
      render: (row) => (
        <StatusPill tone={toneForState(row.state)}>{humaniseState(row.state)}</StatusPill>
      ),
    },
    {
      key: 'ownership',
      header: 'Ownership',
      render: (row) =>
        row.codeOwned ? (
          <StatusPill tone="good" title="Registered by the build, not editable at runtime">
            Code-owned
          </StatusPill>
        ) : (
          'Editable'
        ),
    },
    {
      key: 'registered',
      header: 'Registered by build',
      render: (row) => (row.registeredByBuild ? 'Yes' : 'No'),
      priority: 'secondary',
    },
    {
      key: 'checksum',
      header: 'Checksum',
      render: (row) => <code className="inline-code">{formatChecksum(row.checksum)}</code>,
      priority: 'secondary',
    },
    {
      key: 'actions',
      header: 'Lifecycle',
      render: (row) => (
        <details className="row-actions">
          <summary>Move</summary>
          <div className="row-actions-body">
            <ArtefactActions
              kind="schema"
              versionId={row.id}
              state={row.state}
              codeOwned={row.codeOwned}
            />
          </div>
        </details>
      ),
    },
  ];

  const taxonomyColumns: Column<TaxonomyVersion>[] = [
    { key: 'version', header: 'Version', render: (row) => `v${row.version}` },
    {
      key: 'state',
      header: 'State',
      render: (row) => (
        <StatusPill tone={toneForState(row.state)}>{humaniseState(row.state)}</StatusPill>
      ),
    },
    {
      key: 'values',
      header: 'Allowed values',
      render: (row) => `${formatNumber(row.values?.length ?? 0)} values`,
    },
    {
      key: 'approval',
      header: 'Approved by',
      render: (row) => row.approvedBy ?? <span className="muted-cell">Not approved</span>,
      priority: 'secondary',
    },
    {
      key: 'actions',
      header: 'Lifecycle',
      render: (row) => (
        <details className="row-actions">
          <summary>Move</summary>
          <div className="row-actions-body">
            <ArtefactActions kind="taxonomy" versionId={row.id} state={row.state} />
          </div>
        </details>
      ),
    },
  ];

  const budgetColumns: Column<BudgetStatusRow>[] = [
    {
      key: 'key',
      header: 'Budget',
      // The key is shown verbatim: it is the stable identifier an operator types into the
      // form, so prettifying it here would stop the two matching.
      render: (row) => (
        <>
          <code className="inline-code">{row.key}</code>
          <small className="cell-sub">
            {humaniseState(row.scopeType)}
            {row.scopeLabel ? ` · ${row.scopeLabel}` : ''} · {humaniseState(row.environment)}
          </small>
        </>
      ),
    },
    {
      key: 'perRequest',
      header: 'Per request',
      align: 'end',
      render: (row) => (
        <>
          {formatCurrencyFromMicros(row.perRequestLimitMicros, row.currency)}
          {row.perRequestBreaches > 0 ? (
            <small className="cell-sub">
              {formatNumber(row.perRequestBreaches)} runs exceeded it
            </small>
          ) : null}
        </>
      ),
    },
    {
      key: 'daily',
      header: 'Today',
      align: 'end',
      // Spend against limit, because a limit with no spend beside it answers nothing.
      render: (row) => (
        <>
          {formatCurrencyFromMicros(row.dailySpendMicros, row.currency)}
          <small className="cell-sub">
            of {formatCurrencyFromMicros(row.dailyLimitMicros, row.currency)}
            {row.dailyLimitMicros
              ? ` · ${percentOfLimit(row.dailySpendMicros, row.dailyLimitMicros)}`
              : ''}
          </small>
        </>
      ),
    },
    {
      key: 'monthly',
      header: 'This month',
      align: 'end',
      render: (row) => (
        <>
          {formatCurrencyFromMicros(row.monthlySpendMicros, row.currency)}
          <small className="cell-sub">
            of {formatCurrencyFromMicros(row.monthlyLimitMicros, row.currency)}
          </small>
        </>
      ),
    },
    {
      key: 'active',
      header: 'Enforced',
      render: (row) =>
        row.dailyBreached || row.monthlyBreached ? (
          <StatusPill tone="danger">Breached</StatusPill>
        ) : row.warningThresholdReached ? (
          <StatusPill tone="warning">Near limit</StatusPill>
        ) : row.active ? (
          <StatusPill tone="good">Active</StatusPill>
        ) : (
          <StatusPill tone="warning">Not active</StatusPill>
        ),
    },
    {
      key: 'edit',
      header: 'Edit',
      render: (row) => (
        <details className="row-actions">
          <summary>Change limits</summary>
          <div className="row-actions-body">
            <BudgetForm existing={row} scopeOptions={scopeOptions} />
          </div>
        </details>
      ),
    },
  ];

  return (
    <>
      {section === 'all' || section === 'budgets' ? (
        <>
          {budgetStatus.length === 0 ? (
            <Banner tone="warning" title="No cost limit is configured">
              A missing cost limit is one of the blockers the readiness evaluation raises, because
              nothing would stop a runaway spend.
            </Banner>
          ) : null}
          {overBudget ? (
            <Banner tone="danger" title="Recorded spend exceeds the lowest active daily limit">
              {formatCurrencyFromMicros(spendMicros)} against a limit of{' '}
              {formatCurrencyFromMicros(dailyLimit)}.
            </Banner>
          ) : null}

          <Panel
            title="Budget policies"
            eyebrow={`${formatNumber(budgetStatus.length)} policies`}
            description="A per-request ceiling sits below the daily limit so a single runaway call cannot exhaust the day. The platform refuses a policy that inverts that."
          >
            <DataTable
              caption="Budget policies with their limits and the spend recorded against them"
              columns={budgetColumns}
              rows={budgetStatus}
              getRowKey={(row) => row.id}
              empty={
                <EmptyState
                  title="No budget policies"
                  detail="Production readiness requires a configured cost limit."
                />
              }
            />
            <details className="row-actions">
              <summary>Add a budget policy</summary>
              <div className="row-actions-body">
                <BudgetForm scopeOptions={scopeOptions} />
              </div>
            </details>
          </Panel>
        </>
      ) : null}

      {section === 'all' || section === 'prompts' ? (
        <Panel
          title="Prompt versions"
          eyebrow={`${formatNumber(prompts.length)} versions`}
          description="Prompt versions are immutable. Activating a new one supersedes the previous rather than editing it."
        >
          <DataTable
            caption="Prompt versions with their state, approver and activation"
            columns={promptColumns}
            rows={prompts}
            getRowKey={(row) => row.id}
            empty={
              <EmptyState
                title="No prompt versions"
                detail="Prompts are seeded with the registry."
              />
            }
          />
        </Panel>
      ) : null}

      {section === 'all' || section === 'schemas' ? (
        <>
          <Panel
            title="Output schemas"
            eyebrow={`${formatNumber(schemas.length)} versions`}
            description="Code-owned schemas are registered by the build and cannot be edited at runtime, so a model cannot widen its own output contract."
          >
            <DataTable
              caption="Output schema versions with their ownership and state"
              columns={schemaColumns}
              rows={schemas}
              getRowKey={(row) => row.id}
              empty={
                <EmptyState title="No schemas" detail="Schemas are registered by the build." />
              }
            />
          </Panel>

          <Panel
            title="Taxonomies"
            eyebrow={`${formatNumber(taxonomies.length)} versions`}
            description="A classification may only use values from its active taxonomy version."
          >
            <DataTable
              caption="Taxonomy versions with their allowed value count and approver"
              columns={taxonomyColumns}
              rows={taxonomies}
              getRowKey={(row) => row.id}
              empty={
                <EmptyState
                  title="No taxonomies"
                  detail="Taxonomies are seeded with the registry."
                />
              }
            />
          </Panel>
        </>
      ) : null}
    </>
  );
}
