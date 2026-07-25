import Link from 'next/link';
import {
  Banner,
  CardGrid,
  EmptyState,
  Panel,
  StatusPill,
  humaniseState,
  toneForState,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../domain-page';
import { apiGet } from '../../lib/api';
import type { Readiness } from '../../lib/types';

export const dynamic = 'force-dynamic';

const DOMAIN_DETAIL: Record<string, { label: string; detail: string; href: string }> = {
  voiceRuntime: {
    label: 'Voice runtime',
    detail:
      'Whether ElevenLabs is connected, which capabilities it reports, and whether the live agent matches the approved configuration.',
    href: '/settings/ai-providers/elevenlabs',
  },
  aios: {
    label: 'AI infrastructure',
    detail:
      'Whether an AI provider is connected and approved, models are eligible, routes resolve and cost limits are set.',
    href: '/settings/ai-routing',
  },
  platform: {
    label: 'Platform',
    detail:
      'Approvals, mandatory tests, privacy and retention sign-off, identity, and operator queues.',
    href: '/settings/administration/readiness',
  },
  productionRouting: {
    label: 'Production routing',
    detail:
      'The final decision. Enabled only when every other domain passes and a person approves it.',
    href: '/settings/administration/release',
  },
};

export default async function ReadinessPage() {
  const response = await apiGet<Readiness>('/readiness', { purpose: 'RELEASE_MANAGEMENT' });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Mission Control"
        title="Readiness"
        description="Whether this platform can carry production traffic."
      >
        <LoadFailure subject="Readiness" reason={response.reason} />
      </DomainPage>
    );
  }

  const readiness = response.data;

  return (
    <DomainPage
      eyebrow="Mission Control"
      title="Readiness"
      description="Whether this platform can carry production traffic, and exactly what is stopping it."
      meta={
        <StatusPill tone={toneForState(readiness.state)}>
          {humaniseState(readiness.state)}
        </StatusPill>
      }
    >
      {!readiness.allowed ? (
        <Banner
          tone="warning"
          title="Production routing is not enabled"
          action={
            <Link className="button ghost small" href="/settings/administration/readiness">
              Domain detail
            </Link>
          }
        >
          Every blocker below is enforced by the server. The interface cannot bypass them.
        </Banner>
      ) : null}

      <Panel
        title="Readiness by domain"
        eyebrow="Four independent decisions"
        description="These are reported separately on purpose. A single combined score would hide which domain is actually blocking."
      >
        <CardGrid columns={2}>
          {Object.entries(readiness.domains).map(([key, state]) => {
            const meta = DOMAIN_DETAIL[key];
            return (
              <Link
                className="readiness-domain-card"
                href={meta?.href ?? '/settings/administration'}
                key={key}
              >
                <div>
                  <strong>{meta?.label ?? humaniseState(key)}</strong>
                  <StatusPill tone={toneForState(state)}>{humaniseState(state)}</StatusPill>
                </div>
                <p>{meta?.detail ?? ''}</p>
              </Link>
            );
          })}
        </CardGrid>
      </Panel>

      <Panel
        title="Blockers"
        eyebrow={`${readiness.blockers.length} outstanding`}
        description="Each is evaluated server-side on every readiness request."
      >
        {readiness.blockers.length === 0 ? (
          <EmptyState title="No blockers" detail="Every server-enforced gate currently passes." />
        ) : (
          <ol className="blocker-list">
            {readiness.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ol>
        )}
      </Panel>
    </DomainPage>
  );
}
