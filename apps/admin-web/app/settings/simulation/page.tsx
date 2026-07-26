import Link from 'next/link';
import { formatDateTime, humaniseState } from '@quantum-parks/ui';
import { SettingsPage as DomainPage, LoadFailure } from '../settings-page';
import { apiGet } from '../../../lib/api';
import type { AgentListRow } from '../../../lib/types';
import { LiveTestPanel } from './live-test-panel';
import { InstructionsPanel } from './instructions-panel';
import { RecentSessionsPanel, type ReceptionistSessionRow } from './session-rows';

export const dynamic = 'force-dynamic';

type InstructionsSnapshot = {
  instructions: string;
  sources: string[];
  generatedAt: string;
  configurationVersion: number;
};

type ProviderReadinessSummary = {
  connected: boolean;
  agentVerified: boolean;
  latestDiagnosticsStatus: 'PASS' | 'WARNING' | 'FAIL' | 'NOT_CONFIGURED' | null;
  latestDiagnosticsAt: string | null;
};

function ProviderReadinessSummaryBanner({ summary }: { summary: ProviderReadinessSummary | null }) {
  return (
    <div className="panel" style={{ marginBottom: 18 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 14,
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
          <span>Provider: {summary?.connected ? 'Connected' : 'Not connected'}</span>
          <span>
            Diagnostics:{' '}
            {summary?.latestDiagnosticsStatus
              ? `${summary.latestDiagnosticsStatus}${summary.latestDiagnosticsAt ? ` (${formatDateTime(summary.latestDiagnosticsAt)})` : ''}`
              : 'Not yet run'}
          </span>
          <span>Agent: {summary?.agentVerified ? 'Verified' : 'Not verified'}</span>
        </div>
        <Link className="button ghost small" href="/settings/ai-providers/elevenlabs">
          Configure ElevenLabs
        </Link>
      </div>
    </div>
  );
}

export default async function LiveReceptionistTestPage() {
  const [agentsResponse, sessionsResponse, readinessResponse] = await Promise.all([
    apiGet<{ items: AgentListRow[] }>('/agents', { purpose: 'QUALITY_REVIEW' }),
    apiGet<ReceptionistSessionRow[]>('/receptionist-sessions/recent', {
      purpose: 'QUALITY_REVIEW',
    }),
    apiGet<ProviderReadinessSummary>('/admin/integrations/elevenlabs/readiness-summary', {
      purpose: 'QUALITY_REVIEW',
    }),
  ]);
  const readinessSummary = readinessResponse.ok ? readinessResponse.data : null;

  const eyebrow = 'Simulation Lab';
  const title = 'Live Receptionist Test';
  const description =
    'Start a session, send preset calls, and inspect the transcript, routing result, and escalation output.';

  if (!agentsResponse.ok) {
    return (
      <DomainPage eyebrow={eyebrow} title={title} description={description}>
        <LoadFailure subject="Agent versions" reason={agentsResponse.reason} />
      </DomainPage>
    );
  }

  const agentOptions = agentsResponse.data.items
    .filter((agent) => agent.versionId)
    .map((agent) => ({
      value: agent.versionId as string,
      label: `${agent.name} v${agent.version} (${humaniseState(agent.state ?? '')})`,
    }));

  const defaultAgentVersionId = agentOptions[0]?.value;
  const instructionsResponse = defaultAgentVersionId
    ? await apiGet<InstructionsSnapshot>(`/agent-versions/${defaultAgentVersionId}/instructions`, {
        purpose: 'QUALITY_REVIEW',
      })
    : null;

  const sessions = sessionsResponse.ok ? sessionsResponse.data : [];

  return (
    <DomainPage eyebrow={eyebrow} title={title} description={description}>
      <ProviderReadinessSummaryBanner summary={readinessSummary} />
      <LiveTestPanel agentVersions={agentOptions} />

      {instructionsResponse?.ok ? (
        <InstructionsPanel
          instructions={instructionsResponse.data.instructions}
          sources={instructionsResponse.data.sources}
          generatedAt={instructionsResponse.data.generatedAt}
          configurationVersion={instructionsResponse.data.configurationVersion}
        />
      ) : null}

      <RecentSessionsPanel sessions={sessions} />
    </DomainPage>
  );
}
