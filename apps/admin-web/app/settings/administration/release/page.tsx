import Link from 'next/link';
import {
  Banner,
  DefinitionList,
  EmptyState,
  Panel,
  StatusPill,
  formatNumber,
  formatRelativeTime,
  humaniseState,
  toneForState,
} from '@quantum-parks/ui';
import { SettingsPage } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import type { MissionControl, Readiness } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

/**
 * Release administration: who may publish, what evidence a release carries, and how
 * a release is reversed. The decision to route production traffic is a human one and
 * is never taken by this platform on its own.
 */
export default async function ReleaseAdministrationPage() {
  const [readinessResponse, missionResponse] = await Promise.all([
    apiGet<Readiness>('/readiness', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<MissionControl>('/mission-control', { purpose: 'OPERATIONS' }),
  ]);

  const readiness = readinessResponse.ok ? readinessResponse.data : null;
  const mission = missionResponse.ok ? missionResponse.data : null;

  return (
    <SettingsPage
      eyebrow="Administration"
      title="Release administration"
      description="Who may publish a release, what evidence it must carry, and how it is rolled back."
      meta={
        readiness ? (
          <StatusPill tone={toneForState(readiness.domains.productionRouting)}>
            {humaniseState(readiness.domains.productionRouting)}
          </StatusPill>
        ) : null
      }
    >
      <Banner
        tone={readiness?.allowed ? 'good' : 'warning'}
        title={
          readiness?.allowed
            ? 'Every gate passes; production routing awaits a human decision'
            : 'Production routing is blocked'
        }
        action={
          <Link className="button ghost small" href="/settings/advanced/release-checks">
            Release gates
          </Link>
        }
      >
        Passing every gate makes a release eligible. It does not enable production routing on its
        own — that remains an explicit decision a person records.
      </Banner>

      <Panel
        title="Release authority"
        eyebrow="Separation of duties"
        description="Authoring and publishing are different permissions held by different roles."
      >
        <DefinitionList
          items={[
            {
              term: 'Author a version',
              value: 'Agent administrator',
              hint: 'Creates and edits draft configuration.',
            },
            {
              term: 'Approve for test',
              value: 'Platform owner',
              hint: 'Cannot be the author in production.',
            },
            {
              term: 'Run tests',
              value: 'Quality reviewer or agent administrator',
            },
            {
              term: 'Publish',
              value: 'Platform owner',
              hint: 'Requires approval evidence, passing tests and no unresolved drift.',
            },
            {
              term: 'Approve knowledge',
              value: 'Knowledge approver',
              hint: 'High-risk content cannot be approved by its creator.',
            },
          ]}
        />
      </Panel>

      <Panel
        title="Current release"
        eyebrow="What is live and what is next"
        action={
          <Link className="button ghost small" href="/settings/receptionist/releases">
            Release pipeline
          </Link>
        }
      >
        {!mission ? (
          <EmptyState
            title="Release state unavailable"
            detail="The operations service did not respond."
          />
        ) : (
          <DefinitionList
            items={[
              {
                term: 'Live version',
                value: mission.receptionist.activeVersion
                  ? `Version ${mission.receptionist.activeVersion.version}`
                  : 'None published',
                ...(mission.receptionist.publishedAt
                  ? { hint: `Published ${formatRelativeTime(mission.receptionist.publishedAt)}` }
                  : {}),
              },
              {
                term: 'Provider copy',
                value: humaniseState(mission.receptionist.syncState),
                hint:
                  mission.receptionist.syncState === 'DRIFTED'
                    ? 'Differs from the approved local version; publication is blocked.'
                    : 'Matches the approved local version.',
              },
              {
                term: 'Awaiting publication',
                value: mission.receptionist.awaitingPublication
                  ? `Version ${mission.receptionist.awaitingPublication.version}`
                  : 'Nothing',
              },
              {
                term: 'Blockers',
                value: readiness ? formatNumber(readiness.blockers.length) : '—',
              },
            ]}
          />
        )}
      </Panel>

      <Panel
        title="Rollback"
        eyebrow="Reversing a release"
        description="Rollback republishes a previous approved version rather than editing the live one, so the history stays intact."
      >
        <DefinitionList
          items={[
            {
              term: 'What is reversed',
              value: 'Agent configuration and knowledge assignments',
              hint: 'Call history, corrections and audit are never reversed.',
            },
            {
              term: 'Evidence retained',
              value: 'Every version, approval, test run and read-back',
              hint: 'A rolled-back version is marked, not deleted.',
            },
            {
              term: 'After rollback',
              value: 'Provider read-back re-runs',
              hint: 'The remote copy is compared again before the release is considered active.',
            },
          ]}
        />
      </Panel>
    </SettingsPage>
  );
}
