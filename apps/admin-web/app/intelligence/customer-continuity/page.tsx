import {
  Banner,
  MetricCard,
  MetricGrid,
  Panel,
  StatusPill,
  TechnicalDetails,
  JsonInspector,
  formatPercent,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../../domain-page';
import { apiGet } from '../../../lib/api';

export const dynamic = 'force-dynamic';

type Trend = {
  id: string;
  trendType: string;
  dimensions: Record<string, string>;
  metric: number;
  confidence: number | null;
  periodStart: string;
  periodEnd: string;
  evidence: Record<string, unknown>;
};

type Series = { trends: Trend[] };

/**
 * Whether the same question is coming back — a caller contacting again for
 * something that was not resolved the first time. This reads the same
 * `REPEAT_CONTACT` trend row `/intelligence/trends` lists, since it is the only
 * evidence of repeat contact the platform derives today.
 *
 * There is no caller or customer identity recorded anywhere in the schema, so
 * repeat contact cannot be attributed to a specific agent version, park or
 * language — only this platform-wide rate exists. That is a genuine
 * instrumentation gap, stated here rather than papered over with an invented
 * breakdown.
 */
export default async function CustomerContinuityPage() {
  const response = await apiGet<Series>('/analytics/series?days=90', { purpose: 'ANALYTICS' });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Intelligence"
        title="Customer continuity"
        description="Repeat contact: whether the same question is coming back."
      >
        <LoadFailure subject="Customer continuity" reason={response.reason} />
      </DomainPage>
    );
  }

  const repeatContact = response.data.trends.find((trend) => trend.trendType === 'REPEAT_CONTACT');

  return (
    <DomainPage
      eyebrow="Intelligence"
      title="Customer continuity"
      description="Whether callers are contacting again for something that was not resolved the first time."
    >
      <Banner tone="info" title="Platform-wide rate only">
        No caller or customer identity is recorded anywhere in this platform, so repeat contact
        cannot yet be attributed to a specific agent version, park or language — only the rate below
        exists. Breaking it down further would need a caller identity, which does not exist today.
      </Banner>

      {repeatContact ? (
        <>
          <MetricGrid>
            <MetricCard
              label="Repeat contact rate"
              value={`${repeatContact.metric >= 0 ? '+' : ''}${repeatContact.metric.toFixed(1)}%`}
              detail="Change against the prior comparable period"
            />
            <MetricCard
              label="Confidence"
              value={
                repeatContact.confidence === null
                  ? 'Not scored'
                  : formatPercent(repeatContact.confidence, 0)
              }
              detail="How much evidence sits behind this figure"
            />
          </MetricGrid>

          <Panel title="Evidence" eyebrow="What this trend was derived from">
            <StatusPill tone="neutral">
              Period: {new Date(repeatContact.periodStart).toLocaleDateString()} –{' '}
              {new Date(repeatContact.periodEnd).toLocaleDateString()}
            </StatusPill>
            <TechnicalDetails summary="Derivation evidence">
              <JsonInspector label="Repeat contact evidence" value={repeatContact.evidence} />
            </TechnicalDetails>
          </Panel>
        </>
      ) : (
        <Banner tone="info" title="No repeat-contact trend recorded yet">
          This appears once at least two comparable periods of call data exist.
        </Banner>
      )}
    </DomainPage>
  );
}
