import {
  DataTable,
  EmptyState,
  LineChart,
  MetricCard,
  MetricGrid,
  Panel,
  StatusPill,
  formatCurrencyFromMicros,
  formatNumber,
  type Column,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../../domain-page';
import { apiGet } from '../../../lib/api';

export const dynamic = 'force-dynamic';

type CostRow = {
  key: string;
  label: string;
  executionCount: number;
  costMicros: number;
  inputTokens: number;
  outputTokens: number;
};

type BudgetRow = {
  id: string;
  key: string;
  scopeType: string;
  scopeLabel: string | null;
  currency: string;
  active: boolean;
  dailyLimitMicros: number | null;
  dailySpendMicros: number;
  dailyBreached: boolean;
  monthlyLimitMicros: number | null;
  monthlySpendMicros: number;
  monthlyBreached: boolean;
  warningThresholdReached: boolean;
};

type Response = {
  generatedAt: string;
  currency: string;
  totals: { costMicros: number; inputTokens: number; outputTokens: number };
  costPerCallMicros: number | null;
  costPerCompletedConversationMicros: number | null;
  byProvider: CostRow[];
  byModel: CostRow[];
  byCapability: CostRow[];
  dailyTrend: Array<{ label: string; costMicros: number }>;
  weeklyTrend: Array<{ label: string; costMicros: number }>;
  monthlyTrend: Array<{ label: string; costMicros: number }>;
  budgets: BudgetRow[];
};

function costColumns(currency: string): Column<CostRow>[] {
  return [
    { key: 'label', header: 'Name', render: (row) => row.label },
    {
      key: 'executionCount',
      header: 'Runs',
      align: 'end',
      render: (row) => formatNumber(row.executionCount),
    },
    {
      key: 'costMicros',
      header: 'Spend',
      align: 'end',
      render: (row) => formatCurrencyFromMicros(row.costMicros, currency),
    },
    {
      key: 'tokens',
      header: 'Tokens (in / out)',
      align: 'end',
      render: (row) => `${formatNumber(row.inputTokens)} / ${formatNumber(row.outputTokens)}`,
      priority: 'secondary',
    },
  ];
}

export default async function CostsPage() {
  const response = await apiGet<Response>('/analytics/costs', { purpose: 'ANALYTICS' });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Intelligence"
        title="Costs"
        description="Token usage and spend, by provider, model and capability."
      >
        <LoadFailure subject="Costs" reason={response.reason} />
      </DomainPage>
    );
  }

  const data = response.data;
  const columns = costColumns(data.currency);
  const budgetColumns: Column<BudgetRow>[] = [
    { key: 'key', header: 'Budget', render: (row) => row.key },
    { key: 'scopeLabel', header: 'Scope', render: (row) => row.scopeLabel ?? row.scopeType },
    {
      key: 'daily',
      header: 'Daily spend',
      align: 'end',
      render: (row) => (
        <>
          {formatCurrencyFromMicros(row.dailySpendMicros, row.currency)}
          {row.dailyLimitMicros !== null ? (
            <small className="cell-sub">
              of {formatCurrencyFromMicros(row.dailyLimitMicros, row.currency)}
            </small>
          ) : null}
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusPill
          tone={
            row.dailyBreached || row.monthlyBreached
              ? 'danger'
              : row.warningThresholdReached
                ? 'warning'
                : 'good'
          }
        >
          {row.dailyBreached || row.monthlyBreached
            ? 'Breached'
            : row.warningThresholdReached
              ? 'Near limit'
              : 'Within budget'}
        </StatusPill>
      ),
    },
  ];

  return (
    <DomainPage
      eyebrow="Intelligence"
      title="Costs"
      description="Token usage and spend enriching calls after they end, by provider, model and capability, against the budgets Settings → AI Routing → Budgets enforces."
      meta={
        <StatusPill tone="neutral">
          {formatCurrencyFromMicros(data.totals.costMicros, data.currency)} total
        </StatusPill>
      }
    >
      <MetricGrid>
        <MetricCard
          label="Total spend"
          value={formatCurrencyFromMicros(data.totals.costMicros, data.currency)}
          detail={`${formatNumber(data.totals.inputTokens)} input / ${formatNumber(data.totals.outputTokens)} output tokens`}
        />
        <MetricCard
          label="Cost per call"
          value={
            data.costPerCallMicros === null
              ? 'Not yet instrumented'
              : formatCurrencyFromMicros(data.costPerCallMicros, data.currency)
          }
          detail="Averaged over every call any enrichment ran against"
        />
        <MetricCard
          label="Cost per completed conversation"
          value={
            data.costPerCompletedConversationMicros === null
              ? 'Not yet instrumented'
              : formatCurrencyFromMicros(data.costPerCompletedConversationMicros, data.currency)
          }
          detail="Averaged over fully-processed calls only"
        />
      </MetricGrid>

      {data.dailyTrend.length > 1 ? (
        <Panel title="Daily spend" eyebrow="Last recorded runs, by day">
          <LineChart
            title="Daily spend"
            description="Total cost across every provider, model and capability, by day."
            data={data.dailyTrend.map((point) => ({
              label: point.label,
              value: Number((point.costMicros / 1_000_000).toFixed(2)),
            }))}
            series={[{ key: 'value', label: `Spend (${data.currency})` }]}
          />
        </Panel>
      ) : null}

      <Panel title="By provider" eyebrow="Spend and token usage">
        <DataTable
          caption="Spend and token usage by provider"
          columns={columns}
          rows={data.byProvider}
          getRowKey={(row) => row.key}
          empty={
            <EmptyState
              title="No provider spend yet"
              detail="A provider appears once it has run at least once."
            />
          }
        />
      </Panel>

      <Panel title="By model" eyebrow="Spend and token usage">
        <DataTable
          caption="Spend and token usage by model"
          columns={columns}
          rows={data.byModel}
          getRowKey={(row) => row.key}
          empty={
            <EmptyState
              title="No model spend yet"
              detail="A model appears once it has run at least once."
            />
          }
        />
      </Panel>

      <Panel title="By capability" eyebrow="Spend and token usage">
        <DataTable
          caption="Spend and token usage by capability"
          columns={columns}
          rows={data.byCapability}
          getRowKey={(row) => row.key}
          empty={
            <EmptyState
              title="No capability spend yet"
              detail="A capability appears once it has run at least once."
            />
          }
        />
      </Panel>

      <Panel
        title="Budget utilisation"
        eyebrow="Same policies Settings → AI Routing → Budgets enforces"
      >
        <DataTable
          caption="Budget utilisation and breach status by scope"
          columns={budgetColumns}
          rows={data.budgets}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState
              title="No budget policies configured"
              detail="A budget limits spend for a provider, model or capability."
            />
          }
        />
      </Panel>
    </DomainPage>
  );
}
