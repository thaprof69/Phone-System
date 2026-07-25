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
  toneForState,
  type Column,
} from '@quantum-parks/ui';

/**
 * Governance: prompts, schemas, taxonomies and budgets as real records.
 *
 * These previously rendered as four numbers. What matters about a prompt version is
 * its state, who approved it and when it was activated — none of which a count carries.
 */

export type PromptVersion = {
  id: string;
  promptId: string;
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

export function GovernanceView({
  prompts,
  schemas,
  taxonomies,
  budgets,
  spendMicros,
}: {
  prompts: PromptVersion[];
  schemas: SchemaVersion[];
  taxonomies: TaxonomyVersion[];
  budgets: BudgetPolicy[];
  spendMicros: number;
}) {
  const activeDailyBudget = budgets
    .filter((budget) => budget.active && budget.dailyLimitMicros)
    .reduce((lowest, budget) => Math.min(lowest, budget.dailyLimitMicros ?? Infinity), Infinity);
  const dailyLimit = Number.isFinite(activeDailyBudget) ? activeDailyBudget : null;
  const overBudget = dailyLimit !== null && spendMicros > dailyLimit;

  const promptColumns: Column<PromptVersion>[] = [
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
  ];

  const budgetColumns: Column<BudgetPolicy>[] = [
    {
      key: 'key',
      header: 'Budget',
      render: (row) => (
        <>
          {humaniseState(row.key)}
          <small className="cell-sub">
            {humaniseState(row.scopeType)} · {humaniseState(row.environment)}
          </small>
        </>
      ),
    },
    {
      key: 'perRequest',
      header: 'Per request',
      align: 'end',
      render: (row) => formatCurrencyFromMicros(row.perRequestLimitMicros, row.currency),
    },
    {
      key: 'daily',
      header: 'Daily',
      align: 'end',
      render: (row) => formatCurrencyFromMicros(row.dailyLimitMicros, row.currency),
    },
    {
      key: 'monthly',
      header: 'Monthly',
      align: 'end',
      render: (row) => formatCurrencyFromMicros(row.monthlyLimitMicros, row.currency),
    },
    {
      key: 'active',
      header: 'Enforced',
      render: (row) =>
        row.active ? (
          <StatusPill tone="good">Active</StatusPill>
        ) : (
          <StatusPill tone="warning">Not active</StatusPill>
        ),
    },
    {
      key: 'approval',
      header: 'Approved by',
      render: (row) => row.approvedBy ?? <span className="muted-cell">Not approved</span>,
      priority: 'secondary',
    },
  ];

  return (
    <>
      {budgets.length === 0 ? (
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
        title="Budgets"
        eyebrow={`${formatNumber(budgets.length)} policies`}
        description="A per-request ceiling sits well below the daily limit so a single runaway call cannot exhaust the day."
      >
        <DataTable
          caption="Budget policies with their per-request, daily and monthly limits"
          columns={budgetColumns}
          rows={budgets}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState
              title="No budget policies"
              detail="Production readiness requires a configured cost limit."
            />
          }
        />
      </Panel>

      <Panel
        title="Prompts"
        eyebrow={`${formatNumber(prompts.length)} versions`}
        description="Prompt versions are immutable. Activating a new one supersedes the previous rather than editing it."
      >
        <DataTable
          caption="Prompt versions with their state, approver and activation"
          columns={promptColumns}
          rows={prompts}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState title="No prompt versions" detail="Prompts are seeded with the registry." />
          }
        />
      </Panel>

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
          empty={<EmptyState title="No schemas" detail="Schemas are registered by the build." />}
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
            <EmptyState title="No taxonomies" detail="Taxonomies are seeded with the registry." />
          }
        />
      </Panel>
    </>
  );
}
