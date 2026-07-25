import { EmptyState, Panel } from '@quantum-parks/ui';
import { AdministrationShell } from '../admin-shell';
import { apiGet } from '../../../lib/api';
import { AIIntelligenceConsole } from './ai-console';
import { ExecutionView, type ExecutionRun } from './execution-view';
import { GovernanceView } from './governance-view';
import { MonitoringView, type MonitoringSummary } from './monitoring-view';

export const dynamic = 'force-dynamic';

type Workspace = Parameters<typeof AIIntelligenceConsole>[0]['initialWorkspace'];
type Readiness = { state: string };
type Catalogue = {
  prompts: Parameters<typeof GovernanceView>[0]['prompts'];
  schemas: Parameters<typeof GovernanceView>[0]['schemas'];
  taxonomies: Parameters<typeof GovernanceView>[0]['taxonomies'];
  budgets: Parameters<typeof GovernanceView>[0]['budgets'];
};
type VoiceStatus = { status: string };

/**
 * AI Infrastructure.
 *
 * The operator-facing name is "AI infrastructure"; "AIOS" is the internal architecture
 * name and appears only in technical detail. Capabilities are the stable abstraction —
 * models and providers are how a capability is executed, not what it is.
 */
export default async function AiInfrastructurePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = Array.isArray(params.area) ? params.area[0] : params.area;
  const AREAS = [
    'overview',
    'providers',
    'capabilities',
    'execution',
    'governance',
    'monitoring',
  ] as const;
  type Area = (typeof AREAS)[number];
  const area: Area = AREAS.includes(requested as Area) ? (requested as Area) : 'overview';

  // Execution, Governance and Monitoring are rendered from real records here rather
  // than by the console, which reported only `.length` for each of them.
  const detailed = area === 'execution' || area === 'governance' || area === 'monitoring';

  const [workspace, readiness, voice] = await Promise.all([
    apiGet<Workspace>('/admin/ai/workspace', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<Readiness>('/readiness', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<VoiceStatus>('/admin/integrations/elevenlabs/status', {
      purpose: 'RELEASE_MANAGEMENT',
    }),
  ]);

  const [execution, monitoring, catalogue] = detailed
    ? await Promise.all([
        apiGet<{ items: ExecutionRun[] }>('/admin/ai/execution?limit=100', {
          purpose: 'RELEASE_MANAGEMENT',
        }),
        apiGet<MonitoringSummary>('/admin/ai/monitoring', { purpose: 'RELEASE_MANAGEMENT' }),
        apiGet<Catalogue>('/admin/ai/catalogue', { purpose: 'RELEASE_MANAGEMENT' }),
      ])
    : [null, null, null];

  const sections = AREAS.map((key) => ({
    href: key === 'overview' ? '/administration/ai' : `/administration/ai?area=${key}`,
    label: key === 'overview' ? 'Overview' : key.charAt(0).toUpperCase() + key.slice(1),
    active: key === area,
  }));

  if (detailed) {
    const data = workspace.ok ? workspace.data : null;
    return (
      <AdministrationShell
        current="/administration/ai"
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

        {area === 'execution' ? (
          execution?.ok ? (
            <ExecutionView
              runs={execution.data.items}
              services={data?.execution?.services?.length ?? 0}
              routes={data?.execution?.routes?.length ?? 0}
            />
          ) : (
            <Panel title="Execution history unavailable">
              <EmptyState title="Could not be read" detail={execution?.reason ?? 'No response'} />
            </Panel>
          )
        ) : null}

        {area === 'governance' ? (
          catalogue?.ok ? (
            <GovernanceView
              prompts={catalogue.data.prompts ?? []}
              schemas={catalogue.data.schemas ?? []}
              taxonomies={catalogue.data.taxonomies ?? []}
              budgets={catalogue.data.budgets ?? []}
              spendMicros={Number(monitoring?.ok ? monitoring.data.spend.costMicros : 0)}
            />
          ) : (
            <Panel title="Governance unavailable">
              <EmptyState title="Could not be read" detail={catalogue?.reason ?? 'No response'} />
            </Panel>
          )
        ) : null}

        {area === 'monitoring' ? (
          monitoring?.ok ? (
            <MonitoringView summary={monitoring.data} />
          ) : (
            <Panel title="Monitoring unavailable">
              <EmptyState title="Could not be read" detail={monitoring?.reason ?? 'No response'} />
            </Panel>
          )
        ) : null}
      </AdministrationShell>
    );
  }

  return (
    <AdministrationShell
      current="/administration/ai"
      title="AI infrastructure"
      description="Providers, models, capabilities, routing, prompts, budgets and execution evidence for the intelligence that enriches calls after they end."
    >
      <AIIntelligenceConsole
        initialWorkspace={workspace.ok ? workspace.data : null}
        active={area}
        unavailableReason={workspace.ok ? null : workspace.reason}
        voiceRuntimeStatus={voice.ok ? voice.data.status : 'UNAVAILABLE'}
        platformStatus={readiness.ok ? readiness.data.state : 'UNAVAILABLE'}
      />
    </AdministrationShell>
  );
}
