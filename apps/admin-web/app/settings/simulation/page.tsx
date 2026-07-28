import { AppShell } from '../../shell';
import { apiGet } from '../../../lib/api';
import type { AgentListRow } from '../../../lib/types';
import { LiveTestPanel } from './live-test-panel';

export const dynamic = 'force-dynamic';

type ProviderReadinessSummary = {
  connected: boolean;
  agentVerified: boolean;
  agentVersionId: string | null;
  latestDiagnosticsStatus: 'PASS' | 'WARNING' | 'FAIL' | 'NOT_CONFIGURED' | null;
  latestDiagnosticsAt: string | null;
};

export default async function LiveReceptionistTestPage() {
  const [agentsResponse, readinessResponse] = await Promise.all([
    apiGet<{ items: AgentListRow[] }>('/agents', { purpose: 'QUALITY_REVIEW' }),
    apiGet<ProviderReadinessSummary>('/admin/integrations/elevenlabs/readiness-summary', {
      purpose: 'QUALITY_REVIEW',
    }),
  ]);

  const defaultAgentVersionId =
    (readinessResponse.ok ? readinessResponse.data.agentVersionId : null) ??
    (agentsResponse.ok
      ? agentsResponse.data.items.find((agent) => agent.state === 'ACTIVE')?.versionId
      : undefined);

  return (
    <AppShell>
      <LiveTestPanel
        agentVersionId={defaultAgentVersionId ?? null}
        readiness={readinessResponse.ok ? readinessResponse.data : null}
        loadError={!agentsResponse.ok ? agentsResponse.reason : null}
      />
    </AppShell>
  );
}
