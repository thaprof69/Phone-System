import { AdministrationShell } from '../admin-shell';
import { apiGet } from '../../../lib/api';
import { AIIntelligenceConsole } from './ai-console';

export const dynamic = 'force-dynamic';

type Workspace = Parameters<typeof AIIntelligenceConsole>[0]['initialWorkspace'];
type Readiness = { state: string };
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
  const area = (
    ['overview', 'providers', 'capabilities', 'execution', 'governance', 'monitoring'] as const
  ).includes(requested as never)
    ? (requested as 'overview')
    : 'overview';

  const [workspace, readiness, voice] = await Promise.all([
    apiGet<Workspace>('/admin/ai/workspace', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<Readiness>('/readiness', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<VoiceStatus>('/admin/integrations/elevenlabs/status', {
      purpose: 'RELEASE_MANAGEMENT',
    }),
  ]);

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
