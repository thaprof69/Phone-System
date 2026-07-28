'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Bot,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Lightbulb,
  MessageSquareText,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import {
  AreaChart,
  ComparisonChart,
  DonutChart,
  formatDuration,
  formatNumber,
  formatPercent,
  humaniseState,
} from '@quantum-parks/ui';
import type { ReportRow } from '../reports/bi-report-explorer';
import styles from './intelligence-cockpit.module.css';

type Gap = {
  id: string;
  title: string;
  park: string | null;
  frequency: number;
  evidenceIds: string[];
  status: string;
};

type Trend = {
  id: string;
  trendType: string;
  dimensions: Record<string, string>;
  metric: number;
  confidence: number | null;
  periodStart: string;
  periodEnd: string;
};

type Period = '7D' | '30D' | '90D' | 'ALL';
type Lens = 'command' | 'demand' | 'resolution' | 'experience';
type Investigation = {
  title: string;
  detail: string;
  rows: ReportRow[];
  source: string;
};

type CopilotPriority = {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'opportunity';
  title: string;
  why: string;
  action: string;
  rows: ReportRow[];
};

const periods: Array<[Period, string]> = [
  ['7D', '7 days'],
  ['30D', '30 days'],
  ['90D', '90 days'],
  ['ALL', 'All time'],
];

const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const timeBands = ['Morning', 'Afternoon', 'Evening', 'Overnight'];
const intelligenceLinks: Array<[string, string, string, typeof Activity]> = [
  [
    '/intelligence/trends',
    'Trends',
    'Movements with confidence and derivation evidence',
    TrendingUp,
  ],
  [
    '/intelligence/call-reasons',
    'Call reasons',
    'Demand drivers with call-level drill-through',
    MessageSquareText,
  ],
  [
    '/intelligence/knowledge-gaps',
    'Knowledge gaps',
    'Unanswered demand flowing into governed content',
    Lightbulb,
  ],
  [
    '/intelligence/agent-performance',
    'Agent performance',
    'Version-level containment, transfer, and failures',
    Bot,
  ],
  [
    '/intelligence/provider-performance',
    'Provider health',
    'Model execution, latency, fallback, and failures',
    Activity,
  ],
  ['/intelligence/costs', 'AI costs', 'Spend by provider, model, and capability', Target],
];

function periodStart(period: Period, rows: ReportRow[]) {
  if (period === 'ALL' || rows.length === 0) return null;
  const newest = new Date(Math.max(...rows.map((row) => Date.parse(row.receivedAt))));
  newest.setDate(newest.getDate() - Number(period.slice(0, -1)) + 1);
  newest.setHours(0, 0, 0, 0);
  return newest;
}

function dayName(row: ReportRow) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(new Date(row.receivedAt));
}

function timeBand(row: ReportRow) {
  const hour = new Date(row.receivedAt).getHours();
  if (hour < 6 || hour >= 22) return 'Overnight';
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

function groupBy(rows: ReportRow[], value: (row: ReportRow) => string) {
  const groups = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const key = value(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].map(([label, groupedRows]) => ({ label, rows: groupedRows }));
}

function contained(row: ReportRow) {
  return row.outcome === 'RESOLVED_BY_AGENT';
}

function unresolved(row: ReportRow) {
  return (
    row.outcome === 'UNRESOLVED_KNOWLEDGE_GAP' ||
    row.outcome === 'TECHNICAL_FAILURE' ||
    row.callStatus === 'FAILED'
  );
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function callQuery(rows: ReportRow[]) {
  const first = rows[0];
  if (!first) return '/calls';
  const allSameIntent = rows.every((row) => row.intent === first.intent);
  const allSamePark = rows.every((row) => row.park === first.park);
  if (allSameIntent && first.intent) return `/calls?intent=${encodeURIComponent(first.intent)}`;
  if (allSamePark && first.park) return `/calls?park=${encodeURIComponent(first.park)}`;
  return '/calls';
}

function title(value: string | null) {
  return value ? humaniseState(value) : 'Not available';
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All {label.toLowerCase()}s</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {title(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function unique(rows: ReportRow[], key: keyof ReportRow) {
  return [
    ...new Set(
      rows
        .map((row) => row[key])
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    ),
  ].sort();
}

function Kpi({
  label,
  value,
  detail,
  tone,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  tone: 'good' | 'warning' | 'danger' | 'neutral';
  icon: typeof Activity;
  onClick: () => void;
}) {
  return (
    <button className={`${styles.kpi} ${styles[`tone_${tone}`]}`} onClick={onClick} type="button">
      <span className={styles.kpiTop}>
        <span>{label}</span>
        <Icon aria-hidden="true" size={17} />
      </span>
      <strong>{value}</strong>
      <small>{detail}</small>
      <span className={styles.inspect}>
        Inspect evidence <ArrowRight aria-hidden="true" size={13} />
      </span>
    </button>
  );
}

function buildPriorities(rows: ReportRow[], gaps: Gap[]): CopilotPriority[] {
  const negative = rows.filter((row) => row.sentiment === 'NEGATIVE');
  const unresolvedRows = rows.filter(unresolved);
  const lowConfidence = rows.filter(
    (row) => row.classificationConfidence !== null && row.classificationConfidence < 0.65,
  );
  const busiestReason = groupBy(rows, (row) => title(row.intent)).sort(
    (left, right) => right.rows.length - left.rows.length,
  )[0];
  const priorities: CopilotPriority[] = [];

  if (unresolvedRows.length) {
    priorities.push({
      id: 'unresolved',
      severity: 'critical',
      title: `${formatNumber(unresolvedRows.length)} calls need a resolution review`,
      why: 'These calls failed processing or ended with a deterministic unresolved outcome.',
      action:
        'Review the call evidence, then route repeated knowledge failures into Knowledge Gaps.',
      rows: unresolvedRows,
    });
  }
  if (negative.length) {
    priorities.push({
      id: 'sentiment',
      severity: 'high',
      title: `Negative sentiment appears in ${formatPercent(negative.length / rows.length)} of calls`,
      why: 'This cohort can expose friction in policy wording, transfers, or the agent voice.',
      action: 'Listen to the highest-urgency examples and compare them by call reason and park.',
      rows: negative,
    });
  }
  if (gaps.some((gap) => gap.status === 'OPEN')) {
    const evidence = new Set(
      gaps.filter((gap) => gap.status === 'OPEN').flatMap((gap) => gap.evidenceIds),
    );
    priorities.push({
      id: 'knowledge',
      severity: 'high',
      title: `${formatNumber(gaps.filter((gap) => gap.status === 'OPEN').length)} open knowledge gaps are recurring`,
      why: 'Approved knowledge was insufficient for questions that callers are asking repeatedly.',
      action: 'Prioritise the highest-frequency gap for review and publish only after approval.',
      rows: rows.filter((row) => evidence.has(row.id)),
    });
  }
  if (lowConfidence.length) {
    priorities.push({
      id: 'confidence',
      severity: 'medium',
      title: `${formatNumber(lowConfidence.length)} classifications are below 65% confidence`,
      why: 'Low-confidence reasons weaken trend and demand analysis even when calls completed.',
      action: 'Sample these transcripts and correct ambiguous labels before acting on the trend.',
      rows: lowConfidence,
    });
  }
  if (busiestReason) {
    priorities.push({
      id: 'demand',
      severity: 'opportunity',
      title: `${busiestReason.label} is the largest demand opportunity`,
      why: `${formatNumber(busiestReason.rows.length)} calls share this reason in the selected cohort.`,
      action:
        'Check containment and duration for this reason, then improve its knowledge or self-service path.',
      rows: busiestReason.rows,
    });
  }
  return priorities.slice(0, 5);
}

export function IntelligenceCockpit({
  initialRows,
  trends,
  gaps,
  generatedAt,
}: {
  initialRows: ReportRow[];
  trends: Trend[];
  gaps: Gap[];
  generatedAt: string;
}) {
  const [period, setPeriod] = useState<Period>('30D');
  const [park, setPark] = useState('');
  const [language, setLanguage] = useState('');
  const [origin, setOrigin] = useState('');
  const [reason, setReason] = useState('');
  const [lens, setLens] = useState<Lens>('command');
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [copilotMode, setCopilotMode] = useState<'brief' | 'ask'>('brief');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [copilotState, setCopilotState] = useState<'deterministic' | 'routed' | 'unavailable'>(
    'deterministic',
  );

  const filtered = useMemo(() => {
    const start = periodStart(period, initialRows);
    return initialRows.filter((row) => {
      if (start && new Date(row.receivedAt) < start) return false;
      if (park && row.park !== park) return false;
      if (language && row.language !== language) return false;
      if (origin && row.origin !== origin) return false;
      if (reason && row.intent !== reason) return false;
      return true;
    });
  }, [initialRows, language, origin, park, period, reason]);

  const reasons = useMemo(
    () =>
      groupBy(filtered, (row) => title(row.intent)).sort(
        (left, right) => right.rows.length - left.rows.length,
      ),
    [filtered],
  );
  const parks = useMemo(
    () =>
      groupBy(filtered, (row) => title(row.park)).sort(
        (left, right) => right.rows.length - left.rows.length,
      ),
    [filtered],
  );
  const timeline = useMemo(() => {
    const grouped = groupBy(filtered, (row) => row.receivedAt.slice(0, 10)).sort((left, right) =>
      left.label.localeCompare(right.label),
    );
    return grouped.map((group) => ({
      label: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(
        new Date(group.label),
      ),
      calls: group.rows.length,
      resolved: group.rows.filter(contained).length,
      attention: group.rows.filter(unresolved).length,
    }));
  }, [filtered]);

  const heat = useMemo(
    () =>
      dayNames.flatMap((day) =>
        timeBands.map((band) => ({
          day,
          band,
          rows: filtered.filter((row) => dayName(row) === day && timeBand(row) === band),
        })),
      ),
    [filtered],
  );
  const maxHeat = Math.max(1, ...heat.map((cell) => cell.rows.length));
  const completed = filtered.filter((row) => row.callStatus === 'COMPLETED');
  const containedRows = filtered.filter(contained);
  const unresolvedRows = filtered.filter(unresolved);
  const negativeRows = filtered.filter((row) => row.sentiment === 'NEGATIVE');
  const durationRows = filtered.flatMap((row) =>
    row.durationSeconds === null ? [] : [row.durationSeconds],
  );
  const confidenceRows = filtered.flatMap((row) =>
    row.classificationConfidence === null ? [] : [row.classificationConfidence],
  );
  const priorities = useMemo(() => buildPriorities(filtered, gaps), [filtered, gaps]);

  const inspect = (titleText: string, detail: string, rows: ReportRow[], source: string) => {
    setInvestigation({ title: titleText, detail, rows, source });
    window.setTimeout(() => document.getElementById('evidence-drawer')?.scrollIntoView(), 20);
  };

  const askCopilot = async () => {
    if (question.trim().length < 8) return;
    setIsAsking(true);
    setAnswer(null);
    try {
      const response = await fetch('/api/admin/reports/copilot/advice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          cohort: {
            period,
            calls: filtered.length,
            completed: completed.length,
            contained: containedRows.length,
            unresolved: unresolvedRows.length,
            negative: negativeRows.length,
            averageDurationSeconds: Math.round(average(durationRows)),
          },
          signals: priorities.map((priority) => ({
            id: priority.id,
            label: priority.title,
            evidenceCallIds: priority.rows.slice(0, 25).map((row) => row.id),
          })),
        }),
      });
      const payload = (await response.json()) as { answer?: string; message?: string };
      if (!response.ok || !payload.answer) throw new Error(payload.message ?? 'Unavailable');
      setAnswer(payload.answer);
      setCopilotState('routed');
    } catch {
      const strongest = priorities[0];
      setAnswer(
        strongest
          ? `The strongest evidence-backed next step is: ${strongest.action} This is based on ${strongest.rows.length} calls in the current cohort.`
          : 'There is not enough evidence in the selected cohort to make a responsible recommendation.',
      );
      setCopilotState('unavailable');
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div className={styles.cockpit}>
      <section className={styles.queryBand} aria-label="Intelligence scope">
        <div className={styles.queryTop}>
          <div>
            <p className={styles.eyebrow}>Canonical call intelligence</p>
            <h2>Investigate what changed, why, and what to do next</h2>
          </div>
          <span className={styles.freshness}>
            <Activity aria-hidden="true" size={14} />
            Updated{' '}
            {new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className={styles.scopeRow}>
          <div className={styles.periods} role="group" aria-label="Intelligence period">
            {periods.map(([value, label]) => (
              <button
                className={period === value ? styles.periodActive : ''}
                key={value}
                onClick={() => setPeriod(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <div className={styles.filters}>
            <Select
              label="Park"
              value={park}
              options={unique(initialRows, 'park')}
              onChange={setPark}
            />
            <Select
              label="Language"
              value={language}
              options={unique(initialRows, 'language')}
              onChange={setLanguage}
            />
            <Select
              label="Origin"
              value={origin}
              options={unique(initialRows, 'origin')}
              onChange={setOrigin}
            />
            <Select
              label="Reason"
              value={reason}
              options={unique(initialRows, 'intent')}
              onChange={setReason}
            />
          </div>
        </div>
        <div className={styles.scopeSummary}>
          <strong>{formatNumber(filtered.length)} calls in scope</strong>
          <span>{[park, language, origin, reason].filter(Boolean).length} active dimensions</span>
          <button
            onClick={() => {
              setPark('');
              setLanguage('');
              setOrigin('');
              setReason('');
              setPeriod('30D');
            }}
            type="button"
          >
            Reset view
          </button>
        </div>
      </section>

      <section className={styles.copilot} aria-labelledby="copilot-title">
        <div className={styles.copilotRail}>
          <span className={styles.copilotMark}>
            <BrainCircuit aria-hidden="true" size={22} />
          </span>
          <div>
            <p className={styles.eyebrow}>AI Copilot</p>
            <h2 id="copilot-title">Your operational briefing</h2>
            <p>
              Prioritised from the selected cohort, with evidence links and governed next actions.
            </p>
          </div>
          <span className={styles.modeBadge}>
            {copilotState === 'routed'
              ? 'Routed AI'
              : copilotState === 'unavailable'
                ? 'AI unavailable · evidence fallback'
                : 'Evidence engine · AI ready'}
          </span>
        </div>
        <div className={styles.copilotTabs} role="tablist" aria-label="Copilot mode">
          <button
            aria-selected={copilotMode === 'brief'}
            onClick={() => setCopilotMode('brief')}
            role="tab"
            type="button"
          >
            <Sparkles aria-hidden="true" size={15} /> Priority brief
          </button>
          <button
            aria-selected={copilotMode === 'ask'}
            onClick={() => setCopilotMode('ask')}
            role="tab"
            type="button"
          >
            <MessageSquareText aria-hidden="true" size={15} /> Ask about this cohort
          </button>
        </div>
        {copilotMode === 'brief' ? (
          <div className={styles.priorityGrid}>
            {priorities.slice(0, 4).map((priority, index) => (
              <button
                className={`${styles.priority} ${styles[`severity_${priority.severity}`]}`}
                key={priority.id}
                onClick={() =>
                  inspect(priority.title, priority.why, priority.rows, 'Copilot priority signal')
                }
                type="button"
              >
                <span className={styles.priorityIndex}>{String(index + 1).padStart(2, '0')}</span>
                <span>
                  <strong>{priority.title}</strong>
                  <small>{priority.why}</small>
                  <em>
                    Recommended: {priority.action} <ArrowRight aria-hidden="true" size={13} />
                  </em>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.askPanel}>
            <div className={styles.askInput}>
              <Search aria-hidden="true" size={17} />
              <input
                aria-label="Question for Intelligence Copilot"
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="What should I investigate first, and why?"
                value={question}
              />
              <button
                disabled={isAsking || question.trim().length < 8}
                onClick={askCopilot}
                type="button"
              >
                {isAsking ? 'Analysing…' : 'Ask Copilot'}
              </button>
            </div>
            <div className={styles.suggestedQuestions}>
              {[
                'Where is containment weakest?',
                'What is driving unresolved calls?',
                'Which knowledge gap should we fix first?',
              ].map((suggestion) => (
                <button key={suggestion} onClick={() => setQuestion(suggestion)} type="button">
                  {suggestion}
                </button>
              ))}
            </div>
            {answer ? (
              <div className={styles.answer}>
                <Bot aria-hidden="true" size={18} />
                <p>{answer}</p>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <div className={styles.kpis}>
        <Kpi
          label="Calls received"
          value={formatNumber(filtered.length)}
          detail={`${formatNumber(completed.length)} fully processed`}
          tone="neutral"
          icon={Activity}
          onClick={() =>
            inspect(
              'Calls received',
              'Every canonical call in the selected cohort.',
              filtered,
              'Conversation records',
            )
          }
        />
        <Kpi
          label="Containment"
          value={
            filtered.length ? formatPercent(containedRows.length / filtered.length) : 'No data'
          }
          detail={`${formatNumber(containedRows.length)} resolved by the agent`}
          tone={
            filtered.length && containedRows.length / filtered.length >= 0.7 ? 'good' : 'warning'
          }
          icon={CheckCircle2}
          onClick={() =>
            inspect(
              'Contained calls',
              'Deterministic outcome: resolved by agent.',
              containedRows,
              'Call outcomes',
            )
          }
        />
        <Kpi
          label="Needs attention"
          value={formatNumber(unresolvedRows.length)}
          detail="Failed or deterministically unresolved"
          tone={unresolvedRows.length ? 'danger' : 'good'}
          icon={ShieldAlert}
          onClick={() =>
            inspect(
              'Calls needing attention',
              'Failed processing, technical failure, or unresolved knowledge gap.',
              unresolvedRows,
              'Processing state and outcomes',
            )
          }
        />
        <Kpi
          label="Negative sentiment"
          value={filtered.length ? formatPercent(negativeRows.length / filtered.length) : 'No data'}
          detail={`${formatNumber(negativeRows.length)} calls with persisted evidence`}
          tone={negativeRows.length ? 'warning' : 'good'}
          icon={Users}
          onClick={() =>
            inspect(
              'Negative sentiment cohort',
              'Sentiment read from persisted interaction evidence.',
              negativeRows,
              'AI evidence artefacts',
            )
          }
        />
        <Kpi
          label="Average duration"
          value={durationRows.length ? formatDuration(average(durationRows)) : 'No data'}
          detail={`${formatNumber(durationRows.length)} timed calls`}
          tone="neutral"
          icon={Clock3}
          onClick={() =>
            inspect(
              'Timed calls',
              'Calls with both a persisted start and end time.',
              filtered.filter((row) => row.durationSeconds !== null),
              'Conversation timestamps',
            )
          }
        />
        <Kpi
          label="Classification confidence"
          value={confidenceRows.length ? formatPercent(average(confidenceRows)) : 'No data'}
          detail={`${formatNumber(confidenceRows.length)} scored classifications`}
          tone={average(confidenceRows) >= 0.8 ? 'good' : 'warning'}
          icon={Target}
          onClick={() =>
            inspect(
              'Classification evidence',
              'Calls with a persisted intent confidence score.',
              filtered.filter((row) => row.classificationConfidence !== null),
              'Latest call classifications',
            )
          }
        />
      </div>

      <nav className={styles.lensTabs} aria-label="Intelligence lens">
        {(
          [
            ['command', 'Command view', Activity],
            ['demand', 'Demand & timing', CalendarDays],
            ['resolution', 'Resolution & knowledge', CheckCircle2],
            ['experience', 'Experience & quality', Users],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            aria-current={lens === value ? 'page' : undefined}
            key={value}
            onClick={() => setLens(value)}
            type="button"
          >
            <Icon aria-hidden="true" size={16} /> {label}
          </button>
        ))}
      </nav>

      {lens === 'command' || lens === 'demand' ? (
        <>
          <div className={styles.twoThirds}>
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <p className={styles.eyebrow}>Demand pulse</p>
                  <h2>Calls and resolution over time</h2>
                </div>
                <button
                  onClick={() =>
                    inspect(
                      'Demand timeline',
                      'Calls represented by the visible time series.',
                      filtered,
                      'Conversation timestamps',
                    )
                  }
                  type="button"
                >
                  View sources
                </button>
              </div>
              <AreaChart
                title="Demand, resolved, and attention-required calls"
                data={timeline}
                series={[
                  { key: 'calls', label: 'Calls' },
                  { key: 'resolved', label: 'Resolved' },
                  { key: 'attention', label: 'Needs attention', color: '#b44639' },
                ]}
                height={290}
              />
            </section>
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <p className={styles.eyebrow}>Outcome mix</p>
                  <h2>How calls ended</h2>
                </div>
                <Link href="/reports">Open BI</Link>
              </div>
              <DonutChart
                title="Deterministic call outcomes"
                centreValue={formatNumber(filtered.length)}
                centreLabel="calls"
                data={groupBy(filtered, (row) => title(row.outcome))
                  .map((group) => ({ label: group.label, value: group.rows.length }))
                  .sort((left, right) => right.value - left.value)}
                height={245}
              />
              <div className={styles.sourceList}>
                {groupBy(filtered, (row) => title(row.outcome))
                  .sort((left, right) => right.rows.length - left.rows.length)
                  .slice(0, 4)
                  .map((group) => (
                    <button
                      key={group.label}
                      onClick={() =>
                        inspect(
                          group.label,
                          'Calls sharing this deterministic outcome.',
                          group.rows,
                          'Call outcomes',
                        )
                      }
                      type="button"
                    >
                      <span>{group.label}</span>
                      <strong>{group.rows.length}</strong>
                    </button>
                  ))}
              </div>
            </section>
          </div>

          <div className={styles.equalGrid}>
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <p className={styles.eyebrow}>Demand drivers</p>
                  <h2>Top call reasons</h2>
                </div>
                <Link href="/intelligence/call-reasons">Full analysis</Link>
              </div>
              <ComparisonChart
                title="Calls by reason"
                data={reasons
                  .slice(0, 8)
                  .map((group) => ({ label: group.label, value: group.rows.length }))}
                series={[{ key: 'value', label: 'Calls' }]}
                height={285}
              />
              <div className={styles.rankList}>
                {reasons.slice(0, 6).map((group, index) => (
                  <button
                    key={group.label}
                    onClick={() =>
                      inspect(
                        group.label,
                        'Calls classified with this primary reason.',
                        group.rows,
                        'Latest call classifications',
                      )
                    }
                    type="button"
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{group.label}</strong>
                    <em>{formatPercent(group.rows.length / Math.max(1, filtered.length))}</em>
                    <ArrowRight aria-hidden="true" size={14} />
                  </button>
                ))}
              </div>
            </section>
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <p className={styles.eyebrow}>Peak-call timing</p>
                  <h2>When demand arrives</h2>
                </div>
                <span className={styles.legendText}>Stronger colour = busier</span>
              </div>
              <div
                className={styles.heatmap}
                role="group"
                aria-label="Calls by day and time of day"
              >
                <span />
                {timeBands.map((band) => (
                  <strong key={band}>{band}</strong>
                ))}
                {dayNames.map((day) => (
                  <div className={styles.heatRow} key={day}>
                    <strong>{day.slice(0, 3)}</strong>
                    {timeBands.map((band) => {
                      const cell = heat.find((entry) => entry.day === day && entry.band === band)!;
                      const heatLevel =
                        cell.rows.length === 0
                          ? 0
                          : Math.max(1, Math.ceil((cell.rows.length / maxHeat) * 5));
                      return (
                        <button
                          aria-label={`${day} ${band}: ${cell.rows.length} calls`}
                          data-heat-level={heatLevel}
                          key={band}
                          onClick={() =>
                            inspect(
                              `${day} ${band}`,
                              'Calls received in this peak-time cell.',
                              cell.rows,
                              'Conversation timestamps',
                            )
                          }
                          type="button"
                        >
                          {cell.rows.length}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              <p className={styles.provenance}>
                Source: persisted call receipt timestamps, grouped in the operator’s local time.
              </p>
            </section>
          </div>
        </>
      ) : null}

      {lens === 'command' || lens === 'resolution' ? (
        <div className={styles.twoThirds}>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <p className={styles.eyebrow}>Park comparison</p>
                <h2>Where performance diverges</h2>
              </div>
              <Link href="/reports">Slice further</Link>
            </div>
            <div className={styles.matrix}>
              <div className={styles.matrixHead}>
                <span>Park</span>
                <span>Calls</span>
                <span>Containment</span>
                <span>Attention</span>
                <span>Avg. duration</span>
              </div>
              {parks.map((group) => {
                const timed = group.rows.flatMap((row) =>
                  row.durationSeconds === null ? [] : [row.durationSeconds],
                );
                return (
                  <button
                    key={group.label}
                    onClick={() =>
                      inspect(
                        group.label,
                        'Every call attributed to this park in the current cohort.',
                        group.rows,
                        'Conversation park dimension',
                      )
                    }
                    type="button"
                  >
                    <strong>{group.label}</strong>
                    <span>{group.rows.length}</span>
                    <span>
                      {formatPercent(group.rows.filter(contained).length / group.rows.length)}
                    </span>
                    <span className={group.rows.some(unresolved) ? styles.riskValue : ''}>
                      {group.rows.filter(unresolved).length}
                    </span>
                    <span>{timed.length ? formatDuration(average(timed)) : '—'}</span>
                  </button>
                );
              })}
            </div>
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <p className={styles.eyebrow}>Knowledge pressure</p>
                <h2>Gaps demanding action</h2>
              </div>
              <Link href="/intelligence/knowledge-gaps">Review all</Link>
            </div>
            <div className={styles.gapList}>
              {gaps.slice(0, 5).map((gap) => {
                const gapRows = filtered.filter((row) => gap.evidenceIds.includes(row.id));
                return (
                  <button
                    key={gap.id}
                    onClick={() =>
                      inspect(
                        gap.title,
                        `${gap.frequency} asks · ${gap.status.toLowerCase()} knowledge gap.`,
                        gapRows,
                        'Knowledge gap evidence IDs',
                      )
                    }
                    type="button"
                  >
                    <span className={styles.gapCount}>{gap.frequency}</span>
                    <span>
                      <strong>{gap.title}</strong>
                      <small>
                        {gap.park ? title(gap.park) : 'All parks'} · {gap.evidenceIds.length}{' '}
                        evidence calls
                      </small>
                    </span>
                    <ArrowRight aria-hidden="true" size={15} />
                  </button>
                );
              })}
              {gaps.length === 0 ? (
                <p className={styles.empty}>No knowledge gaps are currently recorded.</p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {lens === 'experience' ? (
        <div className={styles.equalGrid}>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <p className={styles.eyebrow}>Customer signal</p>
                <h2>Sentiment evidence</h2>
              </div>
              <button
                onClick={() =>
                  inspect(
                    'Sentiment evidence',
                    'Calls carrying persisted sentiment evidence.',
                    filtered.filter((row) => row.sentiment !== null),
                    'AI evidence artefacts',
                  )
                }
                type="button"
              >
                View sources
              </button>
            </div>
            <DonutChart
              title="Sentiment distribution"
              data={groupBy(filtered, (row) => title(row.sentiment)).map((group) => ({
                label: group.label,
                value: group.rows.length,
              }))}
              height={275}
            />
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <p className={styles.eyebrow}>Evidence quality</p>
                <h2>What is safe to conclude</h2>
              </div>
              <Link href="/calls/corrections">Corrections</Link>
            </div>
            <div className={styles.qualityList}>
              {[
                [
                  'Outcome coverage',
                  filtered.filter((row) => row.outcome !== null).length,
                  'Deterministic outcome records',
                ],
                [
                  'Sentiment coverage',
                  filtered.filter((row) => row.sentiment !== null).length,
                  'Persisted interaction evidence',
                ],
                [
                  'Reason coverage',
                  filtered.filter((row) => row.intent !== null).length,
                  'Latest classification revisions',
                ],
                [
                  'Duration coverage',
                  filtered.filter((row) => row.durationSeconds !== null).length,
                  'Start and end timestamps',
                ],
              ].map(([label, count, source]) => {
                const numeric = Number(count);
                return (
                  <button
                    key={String(label)}
                    onClick={() =>
                      inspect(
                        String(label),
                        String(source),
                        filtered.slice(0, numeric),
                        String(source),
                      )
                    }
                    type="button"
                  >
                    <span>
                      <strong>{String(label)}</strong>
                      <small>{String(source)}</small>
                    </span>
                    <em>{formatPercent(numeric / Math.max(1, filtered.length))}</em>
                    <span className={styles.qualityBar}>
                      <i style={{ width: `${(numeric / Math.max(1, filtered.length)) * 100}%` }} />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}

      <section className={styles.signalStrip}>
        <div>
          <p className={styles.eyebrow}>Detected movements</p>
          <h2>Signals worth watching</h2>
        </div>
        <div className={styles.trendCards}>
          {trends.slice(0, 4).map((trend) => (
            <Link href="/intelligence/trends" key={trend.id}>
              <TrendingUp aria-hidden="true" size={16} />
              <span>
                <strong>{humaniseState(trend.trendType)}</strong>
                <small>
                  {Object.values(trend.dimensions).map(humaniseState).join(' · ') || 'All calls'}
                </small>
              </span>
              <em>
                {trend.metric >= 0 ? '+' : ''}
                {trend.metric.toFixed(1)}%
              </em>
            </Link>
          ))}
          {trends.length === 0 ? (
            <p className={styles.empty}>
              Two comparable periods are needed before trend signals appear.
            </p>
          ) : null}
        </div>
      </section>

      <section className={styles.deepLinks}>
        {intelligenceLinks.map(([href, label, detail, Icon]) => (
          <Link href={href} key={href}>
            <Icon aria-hidden="true" size={18} />
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
            <ExternalLink aria-hidden="true" size={14} />
          </Link>
        ))}
      </section>

      {investigation ? (
        <aside className={styles.evidence} id="evidence-drawer" aria-label="Evidence drawer">
          <div className={styles.evidenceHead}>
            <div>
              <p className={styles.eyebrow}>Source evidence</p>
              <h2>{investigation.title}</h2>
              <p>{investigation.detail}</p>
            </div>
            <button
              aria-label="Close evidence drawer"
              onClick={() => setInvestigation(null)}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          <div className={styles.evidenceMeta}>
            <span>{formatNumber(investigation.rows.length)} matching calls</span>
            <span>Source: {investigation.source}</span>
            <Link href={callQuery(investigation.rows)}>
              Open matching call register <ExternalLink aria-hidden="true" size={13} />
            </Link>
          </div>
          <div className={styles.evidenceRows}>
            {investigation.rows.slice(0, 8).map((row) => (
              <Link href={`/calls/${row.id}`} key={row.id}>
                <span>
                  <strong>{row.summary ?? title(row.intent)}</strong>
                  <small>
                    {new Date(row.receivedAt).toLocaleString()} · {title(row.park)} ·{' '}
                    {(row.language ?? '—').toUpperCase()}
                  </small>
                </span>
                <span>
                  <em>{title(row.outcome)}</em>
                  <small>
                    {row.classificationConfidence === null
                      ? 'Confidence unavailable'
                      : `${formatPercent(row.classificationConfidence)} confidence`}
                  </small>
                </span>
                <ArrowRight aria-hidden="true" size={15} />
              </Link>
            ))}
            {investigation.rows.length === 0 ? (
              <p className={styles.empty}>
                No source calls match this signal in the current scope.
              </p>
            ) : null}
          </div>
          <p className={styles.provenance}>
            No chart or Copilot recommendation is evidence by itself. Open a source call to inspect
            its canonical transcript, intelligence revisions, outcome, and audit trail.
          </p>
        </aside>
      ) : null}
    </div>
  );
}
