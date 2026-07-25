import Link from 'next/link';
import {
  Banner,
  EmptyState,
  Panel,
  StatusPill,
  formatNumber,
  humaniseState,
  toneForState,
} from '@quantum-parks/ui';
import { SettingsPage } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import type { Readiness } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

/**
 * Readiness by domain, with each blocker attributed to the domain that owns it.
 * Deliberately not reduced to a single score: a percentage would hide which domain
 * is blocking and imply a precision the evaluation does not have.
 */
const DOMAINS = [
  {
    key: 'voiceRuntime',
    label: 'Voice runtime',
    detail: 'Provider connection, reported capabilities and drift against the published copy.',
    href: '/settings/ai-providers/elevenlabs',
    match: (blocker: string) =>
      blocker.toLowerCase().includes('capability') || blocker.toLowerCase().includes('drift'),
  },
  {
    key: 'aios',
    label: 'AI infrastructure',
    detail: 'Provider connection, model approval, route resolution and cost limits.',
    href: '/settings/ai-routing',
    match: (blocker: string) => blocker.startsWith('AIOS:'),
  },
  {
    key: 'platform',
    label: 'Platform',
    detail: 'Approvals, mandatory tests, identity, operator queues and messaging templates.',
    href: '/settings/simulation/release-checks',
    match: (blocker: string) =>
      blocker.toLowerCase().includes('test') ||
      blocker.toLowerCase().includes('approval') ||
      blocker.toLowerCase().includes('queue') ||
      blocker.toLowerCase().includes('template') ||
      blocker.toLowerCase().includes('identity'),
  },
  {
    key: 'productionRouting',
    label: 'Production routing',
    detail: 'The final decision, enabled only when every other domain passes.',
    href: '/settings/administration/release',
    match: () => false,
  },
] as const;

export default async function AdministrationReadinessPage() {
  const response = await apiGet<Readiness>('/readiness', { purpose: 'RELEASE_MANAGEMENT' });

  if (!response.ok) {
    return (
      <SettingsPage
        eyebrow="Administration"
        title="Production readiness"
        description="Readiness by domain, with the blockers for each."
      >
        <Panel title="Readiness unavailable">
          <EmptyState title="Could not be read" detail={response.reason} />
        </Panel>
      </SettingsPage>
    );
  }

  const readiness = response.data;
  const attributed = new Set<string>();
  const domains = DOMAINS.map((domain) => {
    const blockers = readiness.blockers.filter(domain.match);
    blockers.forEach((blocker) => attributed.add(blocker));
    return {
      ...domain,
      blockers,
      state: readiness.domains[domain.key as keyof typeof readiness.domains],
    };
  });
  const unattributed = readiness.blockers.filter((blocker) => !attributed.has(blocker));

  return (
    <SettingsPage
      eyebrow="Administration"
      title="Production readiness"
      description="Whether this platform can carry production traffic, reported per domain so it is clear which one is blocking."
      meta={
        <StatusPill tone={toneForState(readiness.state)}>
          {humaniseState(readiness.state)}
        </StatusPill>
      }
    >
      <Banner
        tone={readiness.allowed ? 'good' : 'warning'}
        title={
          readiness.allowed
            ? 'Every server-enforced gate currently passes'
            : `${formatNumber(readiness.blockers.length)} blockers are preventing production routing`
        }
      >
        Readiness is recomputed on every request. Nothing here is cached, and the interface cannot
        override any of it.
      </Banner>

      {domains.map((domain) => (
        <Panel
          key={domain.key}
          title={domain.label}
          eyebrow={domain.detail}
          action={
            <StatusPill tone={toneForState(domain.state)}>{humaniseState(domain.state)}</StatusPill>
          }
        >
          {domain.blockers.length === 0 ? (
            <p className="gate-clear">No blocker is currently attributed to this domain.</p>
          ) : (
            <>
              <ol className="blocker-list">
                {domain.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ol>
              <Link className="more-link" href={domain.href}>
                Resolve this
              </Link>
            </>
          )}
        </Panel>
      ))}

      {unattributed.length > 0 ? (
        <Panel
          title="Other blockers"
          eyebrow={`${formatNumber(unattributed.length)} outstanding`}
          description="Recorded by the evaluation but not attributable to a single domain above."
        >
          <ol className="blocker-list">
            {unattributed.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ol>
        </Panel>
      ) : null}
    </SettingsPage>
  );
}
