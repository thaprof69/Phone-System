import { EmptyState, Panel } from '@quantum-parks/ui';
import { AdministrationShell } from '../admin-shell';
import { apiGet } from '../../../lib/api';
import { AIIntelligenceConsole } from './ai-console';
import {
  ExecutionView,
  executionFilterOptions,
  filterRuns,
  type ExecutionFilters,
  type ExecutionRun,
} from './execution-view';
import { GovernanceView } from './governance-view';
import { MonitoringView, type MonitoringSummary } from './monitoring-view';
import {
  CapabilitiesView,
  ModelsView,
  ProvidersView,
  RoutesView,
  type CapabilityRow,
  type ModelRow,
  type ProviderDefinition,
  type RouteRow,
} from './registry-views';

export const dynamic = 'force-dynamic';

type Workspace = Parameters<typeof AIIntelligenceConsole>[0]['initialWorkspace'];
type Readiness = { state: string };
type Catalogue = {
  prompts: Parameters<typeof GovernanceView>[0]['prompts'];
  schemas: Parameters<typeof GovernanceView>[0]['schemas'];
  taxonomies: Parameters<typeof GovernanceView>[0]['taxonomies'];
  capabilities: CapabilityRow[];
};
type VoiceStatus = { status: string };
type RouteRegistry = {
  items: RouteRow[];
  connections: Array<{ id: string; connectionLabel: string; providerKey: string; status: string }>;
  models: Array<{
    id: string;
    connectionId: string;
    providerModelId: string;
    available: boolean;
    deprecated: boolean;
  }>;
};
type BudgetStatus = { items: Parameters<typeof GovernanceView>[0]['budgetStatus'] };

const AREAS = [
  'overview',
  'providers',
  'models',
  'capabilities',
  'routes',
  'execution',
  'governance',
  'monitoring',
] as const;
type Area = (typeof AREAS)[number];

const LABELS: Record<Area, string> = {
  overview: 'Overview',
  providers: 'Providers',
  models: 'Models',
  capabilities: 'Capabilities',
  routes: 'Routes',
  execution: 'Execution',
  governance: 'Governance',
  monitoring: 'Monitoring',
};

const BASE = '/administration/ai';

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first && first.length > 0 ? first : undefined;
}

/**
 * AI Infrastructure.
 *
 * The operator-facing name is "AI infrastructure"; "AIOS" is the internal architecture
 * name and appears only in technical detail. Capabilities are the stable abstraction —
 * models and providers are how a capability is executed, not what it is.
 *
 * Each area fetches only what it needs. The registry areas are cheap reads; execution
 * and monitoring are the expensive ones, so they are not paid for on every page view.
 */
export default async function AiInfrastructurePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = single(params.area);
  const area: Area = AREAS.includes(requested as Area) ? (requested as Area) : 'overview';

  const [workspace, readiness, voice] = await Promise.all([
    apiGet<Workspace>('/admin/ai/workspace', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<Readiness>('/readiness', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<VoiceStatus>('/admin/integrations/elevenlabs/status', {
      purpose: 'RELEASE_MANAGEMENT',
    }),
  ]);

  const sections = AREAS.map((key) => ({
    href: key === 'overview' ? BASE : `${BASE}?area=${key}`,
    label: LABELS[key],
    active: key === area,
  }));

  const shell = (children: React.ReactNode) => (
    <AdministrationShell
      current={BASE}
      title="AI infrastructure"
      description="Providers, models, capabilities, routing, prompts, budgets and execution evidence for the intelligence that enriches calls after they end."
    >
      <nav className="ai-primary-nav" aria-label="AI infrastructure sections">
        {sections.map((section) => (
          <a
            key={section.href}
            href={section.href}
            className={section.active ? 'active' : undefined}
            {...(section.active ? { 'aria-current': 'page' as const } : {})}
          >
            {section.label}
          </a>
        ))}
      </nav>
      {children}
    </AdministrationShell>
  );

  const unavailable = (what: string, reason: string) => (
    <Panel title={`${what} unavailable`}>
      <EmptyState title="Could not be read" detail={reason} />
    </Panel>
  );

  if (area === 'providers') {
    const registry = await apiGet<{ items: ProviderDefinition[] }>('/admin/ai/providers/registry', {
      purpose: 'RELEASE_MANAGEMENT',
    });
    return shell(
      registry.ok ? (
        <ProvidersView
          definitions={registry.data.items}
          connections={workspace.ok ? (workspace.data?.providers?.connections ?? []) : []}
        />
      ) : (
        unavailable('Provider registry', registry.reason)
      ),
    );
  }

  if (area === 'models') {
    const models = await apiGet<{ items: ModelRow[] }>('/admin/ai/models', {
      purpose: 'RELEASE_MANAGEMENT',
    });
    return shell(
      models.ok ? (
        <ModelsView models={models.data.items} />
      ) : (
        unavailable('Model registry', models.reason)
      ),
    );
  }

  if (area === 'capabilities') {
    const [catalogue, execution] = await Promise.all([
      apiGet<Catalogue>('/admin/ai/catalogue', { purpose: 'RELEASE_MANAGEMENT' }),
      apiGet<{ items: ExecutionRun[] }>('/admin/ai/execution?limit=200', {
        purpose: 'RELEASE_MANAGEMENT',
      }),
    ]);
    if (!catalogue.ok) return shell(unavailable('Capabilities', catalogue.reason));
    const runsByCapability: Record<string, number> = {};
    if (execution.ok) {
      for (const run of execution.data.items) {
        runsByCapability[run.capabilityKey] = (runsByCapability[run.capabilityKey] ?? 0) + 1;
      }
    }
    return shell(
      <CapabilitiesView
        capabilities={catalogue.data.capabilities ?? []}
        runsByCapability={runsByCapability}
      />,
    );
  }

  if (area === 'routes') {
    const routes = await apiGet<RouteRegistry>('/admin/ai/routes', {
      purpose: 'RELEASE_MANAGEMENT',
    });
    return shell(
      routes.ok ? (
        <RoutesView
          routes={routes.data.items}
          connections={routes.data.connections}
          models={routes.data.models}
        />
      ) : (
        unavailable('Routes', routes.reason)
      ),
    );
  }

  if (area === 'execution') {
    const execution = await apiGet<{ items: ExecutionRun[] }>('/admin/ai/execution?limit=200', {
      purpose: 'RELEASE_MANAGEMENT',
    });
    if (!execution.ok) return shell(unavailable('Execution history', execution.reason));

    const filters: ExecutionFilters = {
      from: single(params.from),
      to: single(params.to),
      provider: single(params.provider),
      model: single(params.model),
      capability: single(params.capability),
      state: single(params.state),
      fallback: single(params.fallback),
    };
    const page = Number(single(params.page) ?? '1');
    const data = workspace.ok ? workspace.data : null;

    return shell(
      <ExecutionView
        runs={filterRuns(execution.data.items, filters)}
        options={executionFilterOptions(execution.data.items)}
        filters={filters}
        page={Number.isFinite(page) ? Math.trunc(page) : 1}
        basePath={BASE}
        services={data?.execution?.services?.length ?? 0}
        routes={data?.execution?.routes?.length ?? 0}
      />,
    );
  }

  if (area === 'governance') {
    const [catalogue, budgets, monitoring, routes] = await Promise.all([
      apiGet<Catalogue>('/admin/ai/catalogue', { purpose: 'RELEASE_MANAGEMENT' }),
      apiGet<BudgetStatus>('/admin/ai/budgets', { purpose: 'RELEASE_MANAGEMENT' }),
      apiGet<MonitoringSummary>('/admin/ai/monitoring', { purpose: 'RELEASE_MANAGEMENT' }),
      apiGet<RouteRegistry>('/admin/ai/routes', { purpose: 'RELEASE_MANAGEMENT' }),
    ]);
    if (!catalogue.ok) return shell(unavailable('Governance', catalogue.reason));

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

    return shell(
      <GovernanceView
        prompts={catalogue.data.prompts ?? []}
        schemas={catalogue.data.schemas ?? []}
        taxonomies={catalogue.data.taxonomies ?? []}
        budgetStatus={budgets.ok ? budgets.data.items : []}
        scopeOptions={scopeOptions}
        spendMicros={Number(monitoring.ok ? monitoring.data.spend.costMicros : 0)}
      />,
    );
  }

  if (area === 'monitoring') {
    const monitoring = await apiGet<MonitoringSummary>('/admin/ai/monitoring', {
      purpose: 'RELEASE_MANAGEMENT',
    });
    return shell(
      monitoring.ok ? (
        <MonitoringView summary={monitoring.data} />
      ) : (
        unavailable('Monitoring', monitoring.reason)
      ),
    );
  }

  return shell(
    <AIIntelligenceConsole
      initialWorkspace={workspace.ok ? workspace.data : null}
      active="overview"
      unavailableReason={workspace.ok ? null : workspace.reason}
      voiceRuntimeStatus={voice.ok ? voice.data.status : 'UNAVAILABLE'}
      platformStatus={readiness.ok ? readiness.data.state : 'UNAVAILABLE'}
    />,
  );
}
