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
import { SettingsPage as DomainPage, LoadFailure } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import type { Readiness, TestRow, TestRunRow } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

/**
 * Release gates, each evaluated independently.
 *
 * The interface reports them; it does not decide them. Every gate below is computed
 * server-side on request, and there is deliberately no control here to override one.
 */
const GATE_DEFINITIONS = [
  {
    key: 'tests',
    label: 'Mandatory tests pass',
    detail: 'Every high-risk case in a mandatory suite passed on its last completed run.',
    href: '/settings/advanced/provider-test-runs',
    match: (blocker: string) => blocker.toLowerCase().includes('test'),
  },
  {
    key: 'approvals',
    label: 'Approvals complete',
    detail: 'The version has an approval recorded by someone other than its author.',
    href: '/settings/receptionist/releases',
    match: (blocker: string) => blocker.toLowerCase().includes('approval'),
  },
  {
    key: 'drift',
    label: 'No unresolved provider drift',
    detail: 'The published copy still matches the approved local configuration.',
    href: '/settings/receptionist/releases',
    match: (blocker: string) => blocker.toLowerCase().includes('drift'),
  },
  {
    key: 'capability',
    label: 'Provider capabilities available',
    detail: 'The voice runtime reports the capabilities a release depends on.',
    href: '/settings/ai-providers/elevenlabs',
    match: (blocker: string) => blocker.toLowerCase().includes('capability'),
  },
  {
    key: 'ai',
    label: 'AI infrastructure ready',
    detail: 'A provider is connected, models are approved and cost limits are configured.',
    href: '/settings/ai-routing',
    match: (blocker: string) => blocker.startsWith('AIOS:'),
  },
  {
    key: 'privacy',
    label: 'Privacy and retention approved',
    detail: 'Data region, retention and caller disclosure have recorded sign-off.',
    href: '/settings/administration/security',
    match: (blocker: string) =>
      blocker.toLowerCase().includes('privacy') ||
      blocker.toLowerCase().includes('retention') ||
      blocker.toLowerCase().includes('disclosure'),
  },
] as const;

export default async function ReleaseGatesPage() {
  const [readinessResponse, testsResponse] = await Promise.all([
    apiGet<Readiness>('/readiness', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<{ tests: TestRow[]; runs: TestRunRow[] }>('/test-suites', {
      purpose: 'RELEASE_MANAGEMENT',
    }),
  ]);

  if (!readinessResponse.ok) {
    return (
      <DomainPage
        eyebrow="Advanced"
        title="Release checks"
        description="Each gate evaluated independently by the server."
      >
        <LoadFailure subject="Release gates" reason={readinessResponse.reason} />
      </DomainPage>
    );
  }

  const readiness = readinessResponse.data;
  const lastRun = testsResponse.ok
    ? testsResponse.data.runs.find((run) => run.status !== 'RUNNING')
    : undefined;

  const gates = GATE_DEFINITIONS.map((gate) => {
    const blockers = readiness.blockers.filter(gate.match);
    return { ...gate, blockers, passing: blockers.length === 0 };
  });

  // Blockers no gate claims still have to be visible, or the page would under-report.
  const unmatched = readiness.blockers.filter(
    (blocker) => !GATE_DEFINITIONS.some((gate) => gate.match(blocker)),
  );

  const failing = gates.filter((gate) => !gate.passing);

  return (
    <DomainPage
      eyebrow="Advanced"
      title="Release checks"
      description="Every condition a release must satisfy before it can reach callers, each reported on its own."
      meta={
        <StatusPill tone={failing.length === 0 ? 'good' : 'danger'}>
          {formatNumber(failing.length)} of {formatNumber(gates.length)} gates blocking
        </StatusPill>
      }
    >
      <Banner tone="info" title="Gates are enforced by the server">
        This page reports the evaluation; it cannot change it. There is no control here to bypass a
        gate, because the publication endpoint would reject the attempt regardless.
      </Banner>

      {gates.map((gate) => (
        <Panel
          key={gate.key}
          title={gate.label}
          eyebrow={gate.passing ? 'Passing' : 'Blocking'}
          description={gate.detail}
          action={
            <StatusPill tone={gate.passing ? 'good' : 'danger'}>
              {gate.passing ? 'Pass' : 'Blocked'}
            </StatusPill>
          }
        >
          {gate.passing ? (
            <p className="gate-clear">
              No blocker is currently recorded against this gate.
              {gate.key === 'tests' && lastRun ? (
                <>
                  {' '}
                  Last completed run: {formatNumber(lastRun.passCount)} passed,{' '}
                  {formatNumber(lastRun.failCount)} failed.
                </>
              ) : null}
            </p>
          ) : (
            <>
              <ol className="blocker-list">
                {gate.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ol>
              <Link className="more-link" href={gate.href}>
                Resolve this
              </Link>
            </>
          )}
        </Panel>
      ))}

      {unmatched.length > 0 ? (
        <Panel
          title="Other blockers"
          eyebrow={`${formatNumber(unmatched.length)} outstanding`}
          description="Recorded by the readiness evaluation but not attributable to one of the gates above."
        >
          <ol className="blocker-list">
            {unmatched.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ol>
        </Panel>
      ) : null}

      <Panel title="Overall decision" eyebrow="Combining every gate">
        <div className="readiness-summary">
          <StatusPill tone={toneForState(readiness.state)}>
            {humaniseState(readiness.state)}
          </StatusPill>
          <p>
            {readiness.allowed
              ? 'Every gate passes. Publication is permitted.'
              : 'Publication is blocked until every gate above passes.'}
          </p>
        </div>
      </Panel>
    </DomainPage>
  );
}
