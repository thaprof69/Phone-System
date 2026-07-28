'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  AreaChart,
  ComparisonChart,
  DonutChart,
  MetricCard,
  MetricGrid,
  formatDuration,
  formatNumber,
  formatPercent,
  humaniseState,
} from '@quantum-parks/ui';
import styles from './bi-report-explorer.module.css';
import { downloadReport, type ExportableReportRow } from './report-export';

export type ReportRow = ExportableReportRow & {
  startedAt: string | null;
  endedAt: string | null;
  synthetic: boolean;
  secondaryIntents: string[];
};

type Period = '7D' | '30D' | '90D' | 'YTD' | 'ALL' | 'CUSTOM';
type View = 'dashboard' | 'pivot' | 'records';
type TimeGrain = 'day' | 'week' | 'month' | 'quarter' | 'year';
type Breakdown =
  | 'park'
  | 'language'
  | 'intent'
  | 'outcome'
  | 'sentiment'
  | 'origin'
  | 'status'
  | 'urgency'
  | 'agentVersion'
  | 'dayOfWeek'
  | 'hour';
type Metric = 'calls' | 'averageDuration' | 'completionRate' | 'containmentRate' | 'confidence';

type Filters = {
  search: string;
  park: string;
  language: string;
  status: string;
  intent: string;
  origin: string;
  outcome: string;
  sentiment: string;
  urgency: string;
  agentVersion: string;
  duration: string;
  dayOfWeek: string;
  hour: string;
  sensitive: string;
};

const emptyFilters: Filters = {
  search: '',
  park: '',
  language: '',
  status: '',
  intent: '',
  origin: '',
  outcome: '',
  sentiment: '',
  urgency: '',
  agentVersion: '',
  duration: '',
  dayOfWeek: '',
  hour: '',
  sensitive: '',
};

const periodOptions: Array<[Period, string]> = [
  ['7D', '7 days'],
  ['30D', '30 days'],
  ['90D', '90 days'],
  ['YTD', 'Year to date'],
  ['ALL', 'All time'],
  ['CUSTOM', 'Custom'],
];

function unique(rows: ReportRow[], key: keyof ReportRow): string[] {
  return [
    ...new Set(
      rows
        .map((row) => row[key])
        .filter((value): value is string | number => value !== null && value !== '')
        .map(String),
    ),
  ].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function dateKey(date: Date, grain: TimeGrain): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (grain === 'year') return String(year);
  if (grain === 'quarter') return `${year} Q${Math.floor(month / 3) + 1}`;
  if (grain === 'month') return `${year}-${String(month + 1).padStart(2, '0')}`;
  if (grain === 'week') {
    const start = new Date(date);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return start.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function dayOfWeek(row: ReportRow): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(new Date(row.receivedAt));
}

function hourBand(row: ReportRow): string {
  const hour = new Date(row.receivedAt).getHours();
  if (hour < 6) return 'Overnight';
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  if (hour < 22) return 'Evening';
  return 'Overnight';
}

function durationBand(row: ReportRow): string {
  if (row.durationSeconds === null) return 'Unknown';
  if (row.durationSeconds < 60) return 'Under 1 minute';
  if (row.durationSeconds < 180) return '1–3 minutes';
  if (row.durationSeconds < 300) return '3–5 minutes';
  return '5+ minutes';
}

function periodStart(period: Period, rows: ReportRow[], customFrom: string): Date | null {
  if (period === 'ALL') return null;
  if (period === 'CUSTOM') return customFrom ? new Date(`${customFrom}T00:00:00`) : null;
  const now = rows.length
    ? new Date(Math.max(...rows.map((row) => Date.parse(row.receivedAt))))
    : new Date();
  if (period === 'YTD') return new Date(now.getFullYear(), 0, 1);
  const days = Number(period.slice(0, -1));
  const start = new Date(now);
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

function breakdownValue(row: ReportRow, breakdown: Breakdown): string {
  if (breakdown === 'dayOfWeek') return dayOfWeek(row);
  if (breakdown === 'hour') return hourBand(row);
  if (breakdown === 'status') return humaniseState(row.callStatus);
  if (breakdown === 'agentVersion')
    return row.agentVersion === null ? 'Not assigned' : `Version ${row.agentVersion}`;
  const value = row[breakdown];
  return value === null || value === '' ? 'Not available' : humaniseState(String(value));
}

function breakdownLabel(breakdown: Breakdown): string {
  if (breakdown === 'intent') return 'Call reason';
  if (breakdown === 'hour') return 'Time of day';
  if (breakdown === 'agentVersion') return 'Agent version';
  if (breakdown === 'dayOfWeek') return 'Day of week';
  return humaniseState(breakdown);
}

function isContained(row: ReportRow) {
  return row.outcome === 'RESOLVED_BY_AGENT';
}

function metricValue(rows: ReportRow[], metric: Metric): number {
  if (metric === 'calls') return rows.length;
  if (metric === 'averageDuration') {
    const values = rows.flatMap((row) =>
      row.durationSeconds === null ? [] : [row.durationSeconds],
    );
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }
  if (metric === 'completionRate')
    return rows.length
      ? rows.filter((row) => row.callStatus === 'COMPLETED').length / rows.length
      : 0;
  if (metric === 'containmentRate')
    return rows.length ? rows.filter(isContained).length / rows.length : 0;
  const values = rows.flatMap((row) =>
    row.classificationConfidence === null ? [] : [row.classificationConfidence],
  );
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function formatMetric(value: number, metric: Metric): string {
  if (metric === 'calls') return formatNumber(value);
  if (metric === 'averageDuration') return formatDuration(value);
  return formatPercent(value);
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select
        className={styles.select}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

export function BiReportExplorer({
  initialRows,
  generatedAt,
}: {
  initialRows: ReportRow[];
  generatedAt: string;
}) {
  const [period, setPeriod] = useState<Period>('30D');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [view, setView] = useState<View>('dashboard');
  const [grain, setGrain] = useState<TimeGrain>('day');
  const [breakdown, setBreakdown] = useState<Breakdown>('intent');
  const [metric, setMetric] = useState<Metric>('calls');

  const options = useMemo(
    () => ({
      parks: unique(initialRows, 'park'),
      languages: unique(initialRows, 'language'),
      statuses: unique(initialRows, 'callStatus'),
      intents: unique(initialRows, 'intent'),
      origins: unique(initialRows, 'origin'),
      outcomes: unique(initialRows, 'outcome'),
      sentiments: unique(initialRows, 'sentiment'),
      urgencies: unique(initialRows, 'urgency'),
      versions: unique(initialRows, 'agentVersion'),
    }),
    [initialRows],
  );

  const filtered = useMemo(() => {
    const start = periodStart(period, initialRows, customFrom);
    const end = period === 'CUSTOM' && customTo ? new Date(`${customTo}T23:59:59.999`) : null;
    const search = filters.search.trim().toLowerCase();
    return initialRows.filter((row) => {
      const received = new Date(row.receivedAt);
      if (start && received < start) return false;
      if (end && received > end) return false;
      if (filters.park && row.park !== filters.park) return false;
      if (filters.language && row.language !== filters.language) return false;
      if (filters.status && row.callStatus !== filters.status) return false;
      if (filters.intent && row.intent !== filters.intent) return false;
      if (filters.origin && row.origin !== filters.origin) return false;
      if (filters.outcome && row.outcome !== filters.outcome) return false;
      if (filters.sentiment && row.sentiment !== filters.sentiment) return false;
      if (filters.urgency && row.urgency !== filters.urgency) return false;
      if (filters.agentVersion && String(row.agentVersion ?? '') !== filters.agentVersion)
        return false;
      if (filters.duration && durationBand(row) !== filters.duration) return false;
      if (filters.dayOfWeek && dayOfWeek(row) !== filters.dayOfWeek) return false;
      if (filters.hour && hourBand(row) !== filters.hour) return false;
      if (filters.sensitive && (filters.sensitive === 'yes' ? !row.sensitive : row.sensitive))
        return false;
      if (
        search &&
        ![
          row.summary,
          row.intent,
          row.park,
          row.language,
          row.outcome,
          row.sentiment,
          row.origin,
        ].some((value) => value?.toLowerCase().includes(search))
      )
        return false;
      return true;
    });
  }, [customFrom, customTo, filters, initialRows, period]);

  const timeline = useMemo(() => {
    const groups = new Map<string, ReportRow[]>();
    for (const row of filtered) {
      const key = dateKey(new Date(row.receivedAt), grain);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([label, rows]) => ({
        label,
        calls: rows.length,
        completed: rows.filter((row) => row.callStatus === 'COMPLETED').length,
      }));
  }, [filtered, grain]);

  const breakdownRows = useMemo(() => {
    const groups = new Map<string, ReportRow[]>();
    for (const row of filtered) {
      const key = breakdownValue(row, breakdown);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.entries()]
      .map(([label, rows]) => ({
        label,
        rows,
        value: metricValue(rows, metric),
        share: filtered.length ? rows.length / filtered.length : 0,
        averageDuration: metricValue(rows, 'averageDuration'),
        completionRate: metricValue(rows, 'completionRate'),
        containmentRate: metricValue(rows, 'containmentRate'),
        confidence: metricValue(rows, 'confidence'),
      }))
      .sort((left, right) => right.value - left.value);
  }, [breakdown, filtered, metric]);

  const durationRows = filtered.filter((row) => row.durationSeconds !== null);
  const confidenceRows = filtered.filter((row) => row.classificationConfidence !== null);
  const completed = filtered.filter((row) => row.callStatus === 'COMPLETED').length;
  const contained = filtered.filter(isContained).length;
  const negative = filtered.filter((row) => row.sentiment === 'NEGATIVE').length;
  const activeFilterCount =
    Object.values(filters).filter(Boolean).length + (period === '30D' ? 0 : 1);
  const updateFilter = (key: keyof Filters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));

  return (
    <div className={styles.workspace}>
      <section className={styles.controlBand} aria-label="Report query">
        <div className={styles.controlHeader}>
          <div>
            <p className={styles.eyebrow}>Call intelligence dataset</p>
            <h2>Explore and analyse</h2>
          </div>
          <div className={styles.exportActions} aria-label="Download filtered report">
            <button
              className={styles.exportButton}
              onClick={() => downloadReport(filtered, 'csv', generatedAt)}
              type="button"
            >
              Download CSV
            </button>
            <button
              className={styles.exportButton}
              onClick={() => downloadReport(filtered, 'excel', generatedAt)}
              type="button"
            >
              Download Excel
            </button>
            <button
              className={styles.exportButton}
              onClick={() => downloadReport(filtered, 'pdf', generatedAt)}
              type="button"
            >
              Download PDF
            </button>
          </div>
        </div>

        <div className={styles.periodRow}>
          <div className={styles.periods} role="group" aria-label="Reporting period">
            {periodOptions.map(([value, label]) => (
              <button
                className={`${styles.periodButton} ${period === value ? styles.periodButtonActive : ''}`}
                key={value}
                onClick={() => setPeriod(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <span className={styles.filterSummary}>
            {formatNumber(filtered.length)} of {formatNumber(initialRows.length)} calls
          </span>
        </div>

        {period === 'CUSTOM' ? (
          <div className={styles.customDates}>
            <label className={styles.field}>
              <span>From</span>
              <input
                className={styles.input}
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>To</span>
              <input
                className={styles.input}
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </label>
          </div>
        ) : null}

        <div className={styles.filters}>
          <label className={styles.field}>
            <span>Search</span>
            <input
              className={styles.input}
              placeholder="Summary, reason, park, outcome"
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
            />
          </label>
          <Select
            label="Park"
            value={filters.park}
            options={[
              ['', 'All parks'],
              ...options.parks.map((value) => [value, humaniseState(value)] as [string, string]),
            ]}
            onChange={(value) => updateFilter('park', value)}
          />
          <Select
            label="Language"
            value={filters.language}
            options={[
              ['', 'All languages'],
              ...options.languages.map((value) => [value, value.toUpperCase()] as [string, string]),
            ]}
            onChange={(value) => updateFilter('language', value)}
          />
          <Select
            label="Status"
            value={filters.status}
            options={[
              ['', 'Any status'],
              ...options.statuses.map((value) => [value, humaniseState(value)] as [string, string]),
            ]}
            onChange={(value) => updateFilter('status', value)}
          />
          <Select
            label="Call reason"
            value={filters.intent}
            options={[
              ['', 'Any reason'],
              ...options.intents.map((value) => [value, humaniseState(value)] as [string, string]),
            ]}
            onChange={(value) => updateFilter('intent', value)}
          />
          <Select
            label="Origin"
            value={filters.origin}
            options={[
              ['', 'Any origin'],
              ...options.origins.map((value) => [value, humaniseState(value)] as [string, string]),
            ]}
            onChange={(value) => updateFilter('origin', value)}
          />
          <Select
            label="Outcome"
            value={filters.outcome}
            options={[
              ['', 'Any outcome'],
              ...options.outcomes.map((value) => [value, humaniseState(value)] as [string, string]),
            ]}
            onChange={(value) => updateFilter('outcome', value)}
          />
          <Select
            label="Sentiment"
            value={filters.sentiment}
            options={[
              ['', 'Any sentiment'],
              ...options.sentiments.map(
                (value) => [value, humaniseState(value)] as [string, string],
              ),
            ]}
            onChange={(value) => updateFilter('sentiment', value)}
          />
          <Select
            label="Urgency"
            value={filters.urgency}
            options={[
              ['', 'Any urgency'],
              ...options.urgencies.map(
                (value) => [value, humaniseState(value)] as [string, string],
              ),
            ]}
            onChange={(value) => updateFilter('urgency', value)}
          />
          <Select
            label="Agent version"
            value={filters.agentVersion}
            options={[
              ['', 'All versions'],
              ...options.versions.map((value) => [value, `Version ${value}`] as [string, string]),
            ]}
            onChange={(value) => updateFilter('agentVersion', value)}
          />
          <Select
            label="Duration"
            value={filters.duration}
            options={[
              ['', 'Any duration'],
              ['Under 1 minute', 'Under 1 minute'],
              ['1–3 minutes', '1–3 minutes'],
              ['3–5 minutes', '3–5 minutes'],
              ['5+ minutes', '5+ minutes'],
              ['Unknown', 'Unknown'],
            ]}
            onChange={(value) => updateFilter('duration', value)}
          />
          <Select
            label="Day of week"
            value={filters.dayOfWeek}
            options={[
              ['', 'Any day'],
              ...['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(
                (value) => [value, value] as [string, string],
              ),
            ]}
            onChange={(value) => updateFilter('dayOfWeek', value)}
          />
          <Select
            label="Time of day"
            value={filters.hour}
            options={[
              ['', 'Any time'],
              ['Morning', 'Morning (06–12)'],
              ['Afternoon', 'Afternoon (12–17)'],
              ['Evening', 'Evening (17–22)'],
              ['Overnight', 'Overnight'],
            ]}
            onChange={(value) => updateFilter('hour', value)}
          />
          <Select
            label="Sensitive"
            value={filters.sensitive}
            options={[
              ['', 'All calls'],
              ['yes', 'Sensitive only'],
              ['no', 'Exclude sensitive'],
            ]}
            onChange={(value) => updateFilter('sensitive', value)}
          />
        </div>

        <div className={styles.filterFooter}>
          <div className={styles.activeFilters}>
            <span className={styles.chip}>{activeFilterCount} active filters</span>
            <span className={styles.chip}>{formatNumber(filtered.length)} matching records</span>
          </div>
          <button
            className={styles.clearButton}
            onClick={() => {
              setFilters(emptyFilters);
              setPeriod('30D');
              setCustomFrom('');
              setCustomTo('');
            }}
            type="button"
          >
            Clear all
          </button>
        </div>
      </section>

      <div className={styles.analysisToolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Report view">
          {(
            [
              ['dashboard', 'Dashboard'],
              ['pivot', 'Pivot analysis'],
              ['records', 'Call records'],
            ] as Array<[View, string]>
          ).map(([value, label]) => (
            <button
              aria-selected={view === value}
              className={`${styles.tabButton} ${view === value ? styles.tabButtonActive : ''}`}
              key={value}
              onClick={() => setView(value)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.analysisControls}>
          <Select
            label="Time grain"
            value={grain}
            options={[
              ['day', 'Day'],
              ['week', 'Week'],
              ['month', 'Month'],
              ['quarter', 'Quarter'],
              ['year', 'Year'],
            ]}
            onChange={(value) => setGrain(value as TimeGrain)}
          />
          <Select
            label="Break down by"
            value={breakdown}
            options={[
              ['intent', 'Call reason'],
              ['park', 'Park'],
              ['language', 'Language'],
              ['outcome', 'Outcome'],
              ['sentiment', 'Sentiment'],
              ['origin', 'Origin'],
              ['status', 'Status'],
              ['urgency', 'Urgency'],
              ['agentVersion', 'Agent version'],
              ['dayOfWeek', 'Day of week'],
              ['hour', 'Time of day'],
            ]}
            onChange={(value) => setBreakdown(value as Breakdown)}
          />
          <Select
            label="Measure"
            value={metric}
            options={[
              ['calls', 'Call volume'],
              ['averageDuration', 'Average duration'],
              ['completionRate', 'Completion rate'],
              ['containmentRate', 'Containment rate'],
              ['confidence', 'Classification confidence'],
            ]}
            onChange={(value) => setMetric(value as Metric)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>No calls match this query. Adjust the period or filters.</div>
      ) : view === 'dashboard' ? (
        <div className={styles.view} role="tabpanel">
          <MetricGrid>
            <MetricCard
              label="Calls"
              value={formatNumber(filtered.length)}
              detail={`${formatNumber(completed)} fully processed`}
            />
            <MetricCard
              label="Completion"
              value={formatPercent(completed / filtered.length)}
              detail="Post-call processing completed"
            />
            <MetricCard
              label="Containment"
              value={formatPercent(contained / filtered.length)}
              detail="Resolved by the receptionist"
            />
            <MetricCard
              label="Average duration"
              value={
                durationRows.length
                  ? formatDuration(
                      durationRows.reduce((sum, row) => sum + (row.durationSeconds ?? 0), 0) /
                        durationRows.length,
                    )
                  : 'Not available'
              }
              detail={`${formatNumber(durationRows.length)} calls with timing`}
            />
            <MetricCard
              label="Negative sentiment"
              value={formatPercent(negative / filtered.length)}
              detail="Persisted interaction evidence"
              tone={negative / filtered.length > 0.25 ? 'warning' : 'neutral'}
            />
            <MetricCard
              label="Classification confidence"
              value={
                confidenceRows.length
                  ? formatPercent(
                      confidenceRows.reduce(
                        (sum, row) => sum + (row.classificationConfidence ?? 0),
                        0,
                      ) / confidenceRows.length,
                    )
                  : 'Not available'
              }
              detail={`${formatNumber(confidenceRows.length)} classified calls`}
            />
          </MetricGrid>
          <div className={styles.chartGrid}>
            <section className={styles.chartPanel}>
              <h3>Demand over time</h3>
              <p>Received calls against fully processed calls at the selected grain.</p>
              <AreaChart
                title="Call demand"
                description="Filtered call volume over time."
                data={timeline}
                series={[
                  { key: 'calls', label: 'Received' },
                  { key: 'completed', label: 'Completed' },
                ]}
              />
            </section>
            <section className={styles.chartPanel}>
              <h3>{breakdownLabel(breakdown)}</h3>
              <p>{humaniseState(metric)} across the selected call population.</p>
              <ComparisonChart
                title={`Calls by ${breakdownLabel(breakdown)}`}
                data={breakdownRows
                  .slice(0, 10)
                  .map((row) => ({ label: row.label, value: row.value }))}
                series={[{ key: 'value', label: humaniseState(metric) }]}
                height={260}
              />
            </section>
          </div>
          <div className={styles.chartGrid}>
            <section className={styles.chartPanel}>
              <h3>Outcome mix</h3>
              <p>Deterministic outcomes only; missing outcomes remain visible.</p>
              <DonutChart
                title="Call outcomes"
                description="How filtered calls ended."
                data={[
                  'RESOLVED_BY_AGENT',
                  'TRANSFER_COMPLETED',
                  'TRANSFER_FAILED_CALLBACK_CREATED',
                  'UNRESOLVED_KNOWLEDGE_GAP',
                  'CUSTOMER_DISCONNECTED',
                  'TECHNICAL_FAILURE',
                  null,
                ]
                  .map((outcome) => ({
                    label: outcome ? humaniseState(outcome) : 'No outcome',
                    value: filtered.filter((row) => row.outcome === outcome).length,
                  }))
                  .filter((entry) => entry.value > 0)}
              />
            </section>
            <section className={styles.chartPanel}>
              <h3>Sentiment mix</h3>
              <p>Read from persisted interaction evidence, never inferred in the browser.</p>
              <DonutChart
                title="Caller sentiment"
                description="Sentiment evidence for filtered calls."
                data={['POSITIVE', 'NEUTRAL', 'NEGATIVE', null]
                  .map((sentiment) => ({
                    label: sentiment ? humaniseState(sentiment) : 'Not available',
                    value: filtered.filter((row) => row.sentiment === sentiment).length,
                  }))
                  .filter((entry) => entry.value > 0)}
              />
            </section>
          </div>
        </div>
      ) : view === 'pivot' ? (
        <section className={styles.tablePanel} role="tabpanel">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Pivot analysis</p>
              <h2>{breakdownLabel(breakdown)} performance</h2>
            </div>
            <span className={styles.chip}>{formatNumber(breakdownRows.length)} groups</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{breakdownLabel(breakdown)}</th>
                  <th className={styles.number}>Calls</th>
                  <th className={styles.number}>Share</th>
                  <th className={styles.number}>Avg duration</th>
                  <th className={styles.number}>Completion</th>
                  <th className={styles.number}>Containment</th>
                  <th className={styles.number}>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {breakdownRows.map((row) => (
                  <tr key={row.label}>
                    <td>
                      <strong>{row.label}</strong>
                    </td>
                    <td className={styles.number}>{formatNumber(row.rows.length)}</td>
                    <td className={styles.number}>{formatPercent(row.share)}</td>
                    <td className={styles.number}>
                      {row.averageDuration ? formatDuration(row.averageDuration) : '—'}
                    </td>
                    <td className={styles.number}>{formatPercent(row.completionRate)}</td>
                    <td className={styles.number}>{formatPercent(row.containmentRate)}</td>
                    <td className={styles.number}>
                      {row.confidence ? formatPercent(row.confidence) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className={styles.tablePanel} role="tabpanel">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Canonical call register</p>
              <h2>Matching call records</h2>
            </div>
            <span className={styles.chip}>
              Showing {formatNumber(Math.min(filtered.length, 100))} of{' '}
              {formatNumber(filtered.length)}
            </span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Call reason</th>
                  <th>Park</th>
                  <th>Language</th>
                  <th>Outcome</th>
                  <th>Sentiment</th>
                  <th className={styles.number}>Duration</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/calls/${row.id}`}>
                        {new Date(row.receivedAt).toLocaleString('en-GB')}
                      </Link>
                    </td>
                    <td>
                      {humaniseState(row.intent ?? 'Unclassified')}
                      <small className="cell-sub">{row.summary ?? 'No summary available'}</small>
                    </td>
                    <td>{row.park ? humaniseState(row.park) : '—'}</td>
                    <td>{row.language?.toUpperCase() ?? '—'}</td>
                    <td>{row.outcome ? humaniseState(row.outcome) : '—'}</td>
                    <td>{row.sentiment ? humaniseState(row.sentiment) : '—'}</td>
                    <td className={styles.number}>
                      {row.durationSeconds === null ? '—' : formatDuration(row.durationSeconds)}
                    </td>
                    <td>{humaniseState(row.callStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className={styles.evidenceNote}>
        Generated from canonical conversations, latest persisted classification and summary
        revisions, deterministic outcomes, receptionist sessions, and evidence-linked AI artifacts.
        Downloads contain the complete filtered result, not only the first 100 rows shown on screen.
      </p>
    </div>
  );
}
