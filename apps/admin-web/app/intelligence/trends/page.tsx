import {
  DataTable,
  EmptyState,
  JsonInspector,
  Panel,
  StatusPill,
  TechnicalDetails,
  formatDate,
  formatNumber,
  formatPercent,
  humaniseState,
  type Column,
  type Tone,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../../domain-page';
import { apiGet } from '../../../lib/api';
import { IntelligenceDetailExplorer } from '../detail-explorer';

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

/** Low-confidence movements are shown but marked, not hidden and not presented as fact. */
function confidenceTone(confidence: number | null): Tone {
  if (confidence === null) return 'neutral';
  if (confidence >= 0.8) return 'good';
  if (confidence >= 0.6) return 'warning';
  return 'danger';
}

export default async function TrendsPage() {
  const response = await apiGet<Series>('/analytics/series?days=90', { purpose: 'ANALYTICS' });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Intelligence"
        title="Trends"
        description="Movements detected across periods, with their evidence."
      >
        <LoadFailure subject="Trends" reason={response.reason} />
      </DomainPage>
    );
  }

  const trends = response.data.trends;
  const lowConfidence = trends.filter(
    (trend) => trend.confidence !== null && trend.confidence < 0.6,
  );

  const columns: Column<Trend>[] = [
    {
      key: 'trendType',
      header: 'Movement',
      render: (trend) => (
        <>
          {humaniseState(trend.trendType)}
          <small className="cell-sub">
            {Object.entries(trend.dimensions)
              .map(([key, value]) => `${key}: ${humaniseState(value)}`)
              .join(' · ')}
          </small>
        </>
      ),
    },
    {
      key: 'metric',
      header: 'Change',
      align: 'end',
      render: (trend) => (
        <strong className={trend.metric >= 0 ? 'trend-up' : 'trend-down'}>
          {trend.metric >= 0 ? '+' : ''}
          {trend.metric.toFixed(1)}%
        </strong>
      ),
    },
    {
      key: 'confidence',
      header: 'Confidence',
      render: (trend) => (
        <StatusPill tone={confidenceTone(trend.confidence)}>
          {trend.confidence === null ? 'Not scored' : formatPercent(trend.confidence, 0)}
        </StatusPill>
      ),
    },
    {
      key: 'period',
      header: 'Period',
      render: (trend) => `${formatDate(trend.periodStart)} – ${formatDate(trend.periodEnd)}`,
      priority: 'secondary',
    },
  ];

  return (
    <DomainPage
      eyebrow="Intelligence"
      title="Trends"
      description="Movements detected by comparing periods. Each carries a confidence score and the evidence it was derived from."
      meta={<StatusPill tone="neutral">{formatNumber(trends.length)} movements</StatusPill>}
    >
      <IntelligenceDetailExplorer
        eyebrow="Trend investigation"
        title="Compare movement strength and confidence"
        description="Switch the measure, rank signals, and inspect the derivation boundary before acting."
        rows={trends.map((trend) => ({
          id: trend.id,
          label: humaniseState(trend.trendType),
          subtitle: Object.values(trend.dimensions).map(humaniseState).join(' · ') || 'All calls',
          metrics: {
            change: trend.metric,
            confidence: trend.confidence,
            magnitude: Math.abs(trend.metric),
          },
          evidence: [
            { label: 'Period start', value: formatDate(trend.periodStart) },
            { label: 'Period end', value: formatDate(trend.periodEnd) },
            {
              label: 'Evidence fields',
              value: `${Object.keys(trend.evidence).length} persisted fields`,
            },
          ],
        }))}
        metrics={[
          { key: 'magnitude', label: 'Movement magnitude', format: 'signed-percent' },
          { key: 'change', label: 'Direction and change', format: 'signed-percent' },
          { key: 'confidence', label: 'Confidence', format: 'percent', higherIsBetter: true },
        ]}
        sourceLabel="Persisted trend evidence"
      />

      <Panel
        title="Detected movements"
        eyebrow="Most recent period first"
        description="A trend is a comparison between windows, not a prediction. Confidence reflects how much evidence sits behind it."
      >
        <DataTable
          caption="Trends with their direction, size, confidence and period"
          columns={columns}
          rows={trends}
          getRowKey={(trend) => trend.id}
          empty={
            <EmptyState
              title="No trends detected"
              detail="Trends need at least two comparable periods of call data."
            />
          }
        />
      </Panel>

      {lowConfidence.length > 0 ? (
        <Panel
          title="Treat with caution"
          eyebrow={`${formatNumber(lowConfidence.length)} low-confidence movements`}
          description="These are shown rather than hidden, but they are not strong enough to act on alone."
        >
          <ul className="plain-list">
            {lowConfidence.map((trend) => (
              <li key={trend.id}>
                {humaniseState(trend.trendType)} —{' '}
                {trend.confidence === null ? 'unscored' : formatPercent(trend.confidence, 0)}{' '}
                confidence
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {trends.length > 0 ? (
        <TechnicalDetails summary="Derivation evidence">
          {trends.slice(0, 5).map((trend) => (
            <JsonInspector
              key={trend.id}
              label={humaniseState(trend.trendType)}
              value={trend.evidence}
            />
          ))}
        </TechnicalDetails>
      ) : null}
    </DomainPage>
  );
}
