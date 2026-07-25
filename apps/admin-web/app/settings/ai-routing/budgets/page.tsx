import { SettingsPage, LoadFailure } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import { GovernanceView, type BudgetStatusRow } from '../governance-view';
import type { MonitoringSummary } from '../monitoring-view';
import type { CapabilityRow } from '../registry-views';

export const dynamic = 'force-dynamic';

type Catalogue = { capabilities: CapabilityRow[] };
type BudgetStatus = { items: BudgetStatusRow[] };
type RouteRegistry = {
  connections: Array<{ id: string; connectionLabel: string }>;
  models: Array<{ id: string; providerModelId: string }>;
};

export default async function BudgetsPage() {
  const [catalogue, budgets, monitoring, routes] = await Promise.all([
    apiGet<Catalogue>('/admin/ai/catalogue', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<BudgetStatus>('/admin/ai/budgets', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<MonitoringSummary>('/admin/ai/monitoring', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<RouteRegistry>('/admin/ai/routes', { purpose: 'RELEASE_MANAGEMENT' }),
  ]);

  if (!catalogue.ok) {
    return (
      <SettingsPage
        eyebrow="AI Routing"
        title="Budgets"
        description="Spend limits in GBP, by provider, model or capability."
      >
        <LoadFailure subject="Budgets" reason={catalogue.reason} />
      </SettingsPage>
    );
  }

  // What a scoped budget may point at: a real connection, model or capability. Free
  // text here would let a policy be written against a scope that does not exist and
  // therefore silently enforce nothing.
  const scopeOptions = [
    ...(routes.ok
      ? routes.data.connections.map((connection) => ({
          value: connection.id,
          label: `Provider · ${connection.connectionLabel}`,
        }))
      : []),
    ...(routes.ok
      ? routes.data.models.map((model) => ({
          value: model.id,
          label: `Model · ${model.providerModelId}`,
        }))
      : []),
    ...(catalogue.data.capabilities ?? []).map((capability) => ({
      value: capability.key,
      label: `Capability · ${capability.displayName}`,
    })),
  ];

  return (
    <SettingsPage
      eyebrow="AI Routing"
      title="Budgets"
      description="Spend limits in GBP, by provider, model or capability. A per-request ceiling sits below the daily limit so a single runaway call cannot exhaust the day."
    >
      <GovernanceView
        section="budgets"
        prompts={[]}
        schemas={[]}
        taxonomies={[]}
        budgetStatus={budgets.ok ? budgets.data.items : []}
        scopeOptions={scopeOptions}
        spendMicros={Number(monitoring.ok ? monitoring.data.spend.costMicros : 0)}
      />
    </SettingsPage>
  );
}
