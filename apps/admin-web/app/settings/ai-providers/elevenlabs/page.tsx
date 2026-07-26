import Link from 'next/link';
import {
  Banner,
  DefinitionList,
  Panel,
  StatusPill,
  formatDateTime,
  formatNumber,
  humaniseState,
  toneForState,
} from '@quantum-parks/ui';
import { SettingsPage } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import { ElevenLabsIntegrationCard } from '../../../elevenlabs-integration';
import type { MissionControl } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

type IntegrationStatus = {
  provider: string;
  status: string;
  connectionLabel?: string | null;
  environment?: string;
  credentialReference?: string | null;
  workspace?: { id: string; subscription: string | null } | null;
  defaultAgentId?: string | null;
  defaultVoiceId?: string | null;
  counts?: { agents: number; voices: number };
  capabilities?: Record<string, string>;
  lastVerifiedAt?: string | null;
  lastErrorCode?: string | null;
  verifiedAgentName?: string | null;
  agentVerifiedAt?: string | null;
  receptionistDisplayName?: string | null;
  greetingOverride?: string | null;
  language?: string | null;
  voiceTestingEnabled?: boolean;
  chatTestingEnabled?: boolean;
  transcriptCapture?: boolean;
  summaryGeneration?: boolean;
  escalationDetection?: boolean;
  productionRoutingEnabled: boolean;
};

export default async function VoiceRuntimePage() {
  const [statusResponse, missionResponse] = await Promise.all([
    apiGet<IntegrationStatus>('/admin/integrations/elevenlabs/status', {
      purpose: 'RELEASE_MANAGEMENT',
    }),
    apiGet<MissionControl>('/mission-control', { purpose: 'OPERATIONS' }),
  ]);

  const status: IntegrationStatus = statusResponse.ok
    ? statusResponse.data
    : { provider: 'ELEVENLABS', status: 'NOT_CONFIGURED', productionRoutingEnabled: false };
  const mission = missionResponse.ok ? missionResponse.data : null;
  const capabilities = Object.entries(status.capabilities ?? {});
  const drifted = mission?.receptionist.syncState === 'DRIFTED';

  return (
    <SettingsPage
      eyebrow="AI Providers"
      title="ElevenLabs setup"
      description="ElevenLabs executes the live call: speech recognition, voice generation, turn-taking and the published agent. Quantum Parks holds the approved configuration it runs."
      meta={
        <StatusPill tone={toneForState(status.status)}>{humaniseState(status.status)}</StatusPill>
      }
    >
      <Banner tone="info" title="This boundary is fixed">
        The platform does not implement telephony, speech recognition, speech synthesis or turn
        handling. Those belong to the voice runtime. Everything else — configuration, versions,
        approvals, knowledge, call history and intelligence — belongs here.
      </Banner>

      {drifted ? (
        <Banner
          tone="danger"
          title="The live agent has drifted from the approved configuration"
          action={
            <Link className="button ghost small" href="/settings/receptionist/releases">
              Release pipeline
            </Link>
          }
        >
          A change was made in the provider console. The local record stays authoritative and the
          remote object is treated as a runtime copy; drift blocks publication until resolved.
        </Banner>
      ) : null}

      <Panel title="Connection" eyebrow="Credentials are held server-side">
        <ElevenLabsIntegrationCard initialStatus={status as never} authorized={statusResponse.ok} />
      </Panel>

      <Panel
        title="Runtime state"
        eyebrow="What the provider reports"
        description="Read from the connection, not assumed. An unverified capability is shown as unverified rather than as available."
      >
        <DefinitionList
          items={[
            {
              term: 'Production routing',
              value: status.productionRoutingEnabled ? 'Enabled' : 'Not enabled',
              hint: 'Connecting a workspace does not by itself route production traffic.',
            },
            {
              term: 'Workspace',
              value: status.workspace?.id ?? 'Not connected',
              ...(status.workspace?.subscription
                ? { hint: `Subscription ${status.workspace.subscription}` }
                : {}),
            },
            {
              term: 'Credential reference',
              value: status.credentialReference ?? 'None stored',
              hint: 'The key itself is never returned to the browser.',
            },
            {
              term: 'Agents in workspace',
              value: status.counts ? formatNumber(status.counts.agents) : '—',
            },
            {
              term: 'Voices in workspace',
              value: status.counts ? formatNumber(status.counts.voices) : '—',
            },
            {
              term: 'Configured agent',
              value: status.defaultAgentId ?? 'None configured',
              hint: status.defaultAgentId
                ? status.agentVerifiedAt
                  ? `Verified${status.verifiedAgentName ? ` as "${status.verifiedAgentName}"` : ' (the provider did not report an agent name)'} on ${formatDateTime(status.agentVerifiedAt)}`
                  : 'Not yet retrieved from ElevenLabs — save and test the connection to verify it.'
                : 'A voice call cannot start without a configured, verified agent.',
            },
            {
              term: 'Last verified',
              value: status.lastVerifiedAt ? formatDateTime(status.lastVerifiedAt) : 'Never',
            },
          ]}
        />
      </Panel>

      <Panel
        title="Runtime configuration"
        eyebrow="Persisted server-side"
        description="These defaults apply to the connection and to Simulation Lab sessions. Per-agent conversation content is authored in Receptionist, not here."
      >
        <DefinitionList
          items={[
            {
              term: 'Receptionist display name',
              value: status.receptionistDisplayName ?? 'Not set',
            },
            { term: 'Greeting override', value: status.greetingOverride ?? 'Use agent default' },
            { term: 'Language', value: status.language ?? 'Use agent default' },
            {
              term: 'Voice testing',
              value: status.voiceTestingEnabled === false ? 'Disabled' : 'Enabled',
            },
            {
              term: 'Chat testing',
              value: status.chatTestingEnabled === false ? 'Disabled' : 'Enabled',
            },
            {
              term: 'Transcript capture',
              value: status.transcriptCapture === false ? 'Disabled' : 'Enabled',
            },
            {
              term: 'Summary generation',
              value: status.summaryGeneration ? 'Enabled' : 'Disabled',
            },
            {
              term: 'Escalation detection',
              value: status.escalationDetection ? 'Enabled' : 'Disabled',
            },
          ]}
        />
      </Panel>

      {capabilities.length > 0 ? (
        <Panel
          title="Capabilities"
          eyebrow={`${formatNumber(capabilities.length)} reported`}
          description="A capability the provider does not confirm is reported as unavailable rather than assumed to work."
        >
          <ul className="capability-grid">
            {capabilities.map(([key, state]) => (
              <li key={key}>
                <span>{humaniseState(key)}</span>
                <StatusPill tone={toneForState(state)}>{humaniseState(state)}</StatusPill>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </SettingsPage>
  );
}
