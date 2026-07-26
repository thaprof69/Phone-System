import { humaniseState } from '@quantum-parks/ui';
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

export default async function LiveReceptionistTestPage() {
  const [agentsResponse, sessionsResponse] = await Promise.all([
    apiGet<{ items: AgentListRow[] }>('/agents', { purpose: 'QUALITY_REVIEW' }),
    apiGet<ReceptionistSessionRow[]>('/receptionist-sessions/recent', {
      purpose: 'QUALITY_REVIEW',
    }),
  ]);

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
