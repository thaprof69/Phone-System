import Link from 'next/link';
import {
  Banner,
  CardGrid,
  EmptyState,
  Panel,
  StatusPill,
  Timeline,
  formatNumber,
  formatRelativeTime,
  humaniseState,
  toneForState,
} from '@quantum-parks/ui';
import { SettingsPage as DomainPage, LoadFailure } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import { ReleaseControls, type PipelineVersion } from './release-controls';
import type { AgentListRow, MissionControl, Readiness } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

/**
 * The release pipeline: draft, review, test, approve, publish, read back, activate.
 * Every transition is server-enforced; this view reports where the current work is
 * and what is holding it there. It never offers an action the gates would reject.
 */
export default async function ReleasesPage() {
  const [missionResponse, readinessResponse, agentsResponse] = await Promise.all([
    apiGet<MissionControl>('/mission-control', { purpose: 'OPERATIONS' }),
    apiGet<Readiness>('/readiness', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<{ items: AgentListRow[] }>('/agents', { purpose: 'RELEASE_MANAGEMENT' }),
  ]);

  const agentId = agentsResponse.ok ? agentsResponse.data.items[0]?.id : undefined;
  const pipelineResponse = agentId
    ? await apiGet<{ versions: PipelineVersion[] }>(`/agents/${agentId}/release-pipeline`, {
        purpose: 'RELEASE_MANAGEMENT',
      })
    : null;

  if (!missionResponse.ok) {
    return (
      <DomainPage
        eyebrow="Receptionist"
        title="Releases"
        description="Approval, testing, publication, provider read-back and rollback."
      >
        <LoadFailure subject="Releases" reason={missionResponse.reason} />
      </DomainPage>
    );
  }

  const { receptionist } = missionResponse.data;
  const readiness = readinessResponse.ok ? readinessResponse.data : null;
  const drifted = receptionist.syncState === 'DRIFTED';

  const stages = [
    {
      label: 'Draft',
      state: receptionist.draftVersion ? `Version ${receptionist.draftVersion.version}` : 'None',
      tone: receptionist.draftVersion ? ('warning' as const) : ('neutral' as const),
      detail: 'Configuration being written. Not visible to callers.',
    },
    {
      label: 'Tested',
      state: receptionist.awaitingPublication
        ? `Version ${receptionist.awaitingPublication.version}`
        : 'None',
      tone: receptionist.awaitingPublication ? ('good' as const) : ('neutral' as const),
      detail: 'Passed its mandatory suites and is eligible for publication approval.',
    },
    {
      label: 'Live',
      state: receptionist.activeVersion ? `Version ${receptionist.activeVersion.version}` : 'None',
      tone: receptionist.activeVersion ? ('good' as const) : ('danger' as const),
      detail: receptionist.publishedAt
        ? `Published ${formatRelativeTime(receptionist.publishedAt)}.`
        : 'Nothing has been published to the voice runtime.',
    },
    {
      label: 'Provider copy',
      state: humaniseState(receptionist.syncState),
      tone: toneForState(receptionist.syncState),
      detail: drifted
        ? 'The remote agent no longer matches the approved local version.'
        : 'The published copy matches the approved local version.',
    },
  ];

  return (
    <DomainPage
      eyebrow="Receptionist"
      title="Releases"
      description="How a configuration change reaches callers: written, reviewed, tested, approved, published, then read back and compared."
      meta={
        <StatusPill tone={toneForState(receptionist.syncState)}>
          {humaniseState(receptionist.syncState)}
        </StatusPill>
      }
    >
      {drifted ? (
        <Banner
          tone="danger"
          title="The live agent has drifted from the approved configuration"
          action={
            <Link className="button ghost small" href="/settings/ai-providers/elevenlabs">
              Voice runtime
            </Link>
          }
        >
          Someone changed the agent in the provider console. Local records remain authoritative; the
          remote object is a runtime copy. Drift blocks publication until it is resolved.
        </Banner>
      ) : null}

      <Panel title="Pipeline" eyebrow="Where the current work sits">
        <CardGrid columns={4}>
          {stages.map((stage) => (
            <div className="pipeline-stage" key={stage.label}>
              <p className="eyebrow">{stage.label}</p>
              <StatusPill tone={stage.tone}>{stage.state}</StatusPill>
              <span>{stage.detail}</span>
            </div>
          ))}
        </CardGrid>
      </Panel>

      <Panel
        title="What is blocking publication"
        eyebrow={readiness ? `${formatNumber(readiness.blockers.length)} blockers` : 'Unknown'}
        description="These are evaluated by the server on every request. The interface cannot bypass them."
        action={
          <Link className="button ghost small" href="/readiness">
            Full readiness
          </Link>
        }
      >
        {!readiness ? (
          <EmptyState
            title="Readiness could not be read"
            detail="Publication gates cannot be shown until the operations service responds."
          />
        ) : readiness.blockers.length === 0 ? (
          <EmptyState
            title="No blockers"
            detail="Every server-enforced publication gate currently passes."
          />
        ) : (
          <ol className="blocker-list">
            {readiness.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ol>
        )}
      </Panel>

      {agentId && pipelineResponse?.ok ? (
        <ReleaseControls agentId={agentId} versions={pipelineResponse.data.versions} />
      ) : null}

      <Panel title="Recent release activity" eyebrow="Most recent first">
        <Timeline
          entries={[
            ...(receptionist.verifiedAt
              ? [
                  {
                    id: 'verified',
                    title: drifted
                      ? 'Provider read-back found a difference'
                      : 'Provider read-back matched the approved version',
                    timestamp: formatRelativeTime(receptionist.verifiedAt),
                    tone: drifted ? ('danger' as const) : ('good' as const),
                    detail: drifted
                      ? 'The remote checksum differs from the local checksum.'
                      : 'The remote checksum matches the local checksum.',
                  },
                ]
              : []),
            ...(receptionist.publishedAt && receptionist.activeVersion
              ? [
                  {
                    id: 'published',
                    title: `Version ${receptionist.activeVersion.version} published`,
                    timestamp: formatRelativeTime(receptionist.publishedAt),
                    tone: 'good' as const,
                    detail: 'A runtime copy was created in the provider workspace.',
                  },
                ]
              : []),
            ...(receptionist.awaitingPublication
              ? [
                  {
                    id: 'tested',
                    title: `Version ${receptionist.awaitingPublication.version} passed its tests`,
                    timestamp: 'Awaiting publication approval',
                    tone: 'good' as const,
                    detail: 'Eligible for publication once a separate approver signs it off.',
                  },
                ]
              : []),
          ]}
        />
      </Panel>
    </DomainPage>
  );
}
