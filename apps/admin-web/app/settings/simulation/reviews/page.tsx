import {
  DataTable,
  EmptyState,
  MetricCard,
  MetricGrid,
  Panel,
  StatusPill,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  type Column,
  type Tone,
} from '@quantum-parks/ui';
import { SettingsPage as DomainPage, LoadFailure } from '../../settings-page';
import { apiGet } from '../../../../lib/api';

export const dynamic = 'force-dynamic';

type ReviewRow = {
  id: string;
  conversationId: string;
  rubricVersion: string;
  scores: Record<string, number>;
  reviewerId: string | null;
  createdAt: string;
  park: string | null;
  language: string | null;
  callStartedAt: string | null;
};

const SCORE_KEYS = ['accuracy', 'tone', 'compliance', 'resolution'] as const;

function scoreTone(score: number): Tone {
  if (score >= 4) return 'good';
  if (score >= 3) return 'warning';
  return 'danger';
}

function average(values: number[]): number | null {
  // An average over nothing is not zero — it is unknown.
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export default async function QualityReviewsPage() {
  const response = await apiGet<{ items: ReviewRow[] }>('/quality-reviews', {
    purpose: 'QUALITY_REVIEW',
  });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Simulation Lab"
        title="Reviews"
        description="Human quality scoring against the review rubric."
      >
        <LoadFailure subject="QA reviews" reason={response.reason} />
      </DomainPage>
    );
  }

  const reviews = response.data.items;
  const averages = Object.fromEntries(
    SCORE_KEYS.map((key) => [
      key,
      average(
        reviews
          .map((review) => review.scores?.[key])
          .filter((value): value is number => typeof value === 'number'),
      ),
    ]),
  ) as Record<(typeof SCORE_KEYS)[number], number | null>;

  const columns: Column<ReviewRow>[] = [
    {
      key: 'call',
      header: 'Call reviewed',
      render: (review) => (
        <>
          {formatDateTime(review.callStartedAt)}
          <small className="cell-sub">
            {titleCase(review.park)} · {(review.language ?? '—').toUpperCase()}
          </small>
        </>
      ),
    },
    ...SCORE_KEYS.map((key): Column<ReviewRow> => ({
      key,
      header: titleCase(key),
      align: 'end',
      render: (review) => {
        const score = review.scores?.[key];
        if (typeof score !== 'number') return <span className="muted-cell">—</span>;
        return <StatusPill tone={scoreTone(score)}>{score} / 5</StatusPill>;
      },
    })),
    {
      key: 'reviewed',
      header: 'Reviewed',
      render: (review) => formatRelativeTime(review.createdAt),
      priority: 'secondary',
    },
    {
      key: 'rubric',
      header: 'Rubric',
      render: (review) => <code className="inline-code">{review.rubricVersion}</code>,
      priority: 'secondary',
    },
  ];

  return (
    <DomainPage
      eyebrow="Simulation Lab"
      title="Reviews"
      description="A reviewer's judgement of a call against the rubric. Distinct from tests, which assert a rule rather than a judgement."
      meta={<StatusPill tone="neutral">{formatNumber(reviews.length)} reviews</StatusPill>}
    >
      <MetricGrid>
        {SCORE_KEYS.map((key) => {
          const value = averages[key];
          return (
            <MetricCard
              key={key}
              label={`Average ${key}`}
              value={value === null ? 'No reviews yet' : `${value.toFixed(1)} / 5`}
              detail={
                value === null
                  ? 'No call has been scored on this dimension'
                  : `Across ${formatNumber(reviews.length)} reviewed calls`
              }
              tone={value === null ? 'neutral' : scoreTone(value)}
            />
          );
        })}
      </MetricGrid>

      <Panel
        title="Reviewed calls"
        eyebrow="Most recent first"
        description="Scores are recorded against a rubric version, so a change to the rubric does not silently rewrite past judgements."
      >
        <DataTable
          caption="Quality reviews with per-dimension scores and the rubric version used"
          columns={columns}
          rows={reviews}
          getRowKey={(review) => review.id}
          rowHref={(review) => `/calls/${review.conversationId}`}
          empty={
            <EmptyState
              title="No reviews recorded"
              detail="Reviewers score sampled calls against the rubric to track answer quality over time."
            />
          }
        />
      </Panel>
    </DomainPage>
  );
}

function titleCase(value: string | null): string {
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1);
}
