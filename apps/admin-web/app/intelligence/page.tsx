import { StatusPill, formatNumber } from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../domain-page';
import { apiGet } from '../../lib/api';
import type { ReportRow } from '../reports/bi-report-explorer';
import { IntelligenceCockpit } from './intelligence-cockpit';

export const dynamic = 'force-dynamic';

type Trend = {
  id: string;
  trendType: string;
  dimensions: Record<string, string>;
  metric: number;
  confidence: number | null;
  periodStart: string;
  periodEnd: string;
};

type Gap = {
  id: string;
  title: string;
  park: string | null;
  frequency: number;
  evidenceIds: string[];
  status: string;
};

export default async function IntelligenceOverviewPage() {
  const [explorer, series, knowledgeGaps] = await Promise.all([
    apiGet<{ generatedAt: string; items: ReportRow[] }>('/reports/explorer', {
      purpose: 'ANALYTICS',
    }),
    apiGet<{ trends: Trend[] }>('/analytics/series?days=90&includeSynthetic=true', {
      purpose: 'ANALYTICS',
    }),
    apiGet<{ items: Gap[] }>('/knowledge-gaps', { purpose: 'ANALYTICS' }),
  ]);

  if (!explorer.ok || !series.ok || !knowledgeGaps.ok) {
    return (
      <DomainPage
        eyebrow="Intelligence"
        title="Intelligence cockpit"
        description="Investigate demand, outcomes, customer signals, knowledge pressure, and operating performance."
      >
        <LoadFailure
          subject="Intelligence"
          reason={
            !explorer.ok
              ? explorer.reason
              : !series.ok
                ? series.reason
                : knowledgeGaps.ok
                  ? 'UNKNOWN'
                  : knowledgeGaps.reason
          }
        />
      </DomainPage>
    );
  }

  return (
    <DomainPage
      eyebrow="Intelligence"
      title="Intelligence cockpit"
      description="See what changed, understand why, and move from a signal to its source calls and next action."
      meta={
        <>
          <StatusPill tone="neutral">
            {formatNumber(explorer.data.items.length)} canonical calls
          </StatusPill>
          <StatusPill tone="good">Evidence linked</StatusPill>
        </>
      }
    >
      <IntelligenceCockpit
        gaps={knowledgeGaps.data.items}
        generatedAt={explorer.data.generatedAt}
        initialRows={explorer.data.items}
        trends={series.data.trends}
      />
    </DomainPage>
  );
}
