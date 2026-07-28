'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Database,
  ExternalLink,
  Filter,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { ComparisonChart, formatDuration, formatNumber, formatPercent } from '@quantum-parks/ui';
import styles from './detail-explorer.module.css';

export type DetailMetric = {
  key: string;
  label: string;
  format: 'number' | 'percent' | 'duration' | 'milliseconds' | 'currency' | 'signed-percent';
  currency?: string;
  higherIsBetter?: boolean;
};

export type DetailRow = {
  id: string;
  label: string;
  subtitle: string;
  href?: string;
  metrics: Record<string, number | null>;
  evidence: Array<{ label: string; value: string }>;
};

function formatMetric(value: number | null, metric: DetailMetric) {
  if (value === null) return 'Not instrumented';
  if (metric.format === 'percent') return formatPercent(value);
  if (metric.format === 'signed-percent') return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  if (metric.format === 'duration') return formatDuration(value);
  if (metric.format === 'milliseconds') return `${formatNumber(Math.round(value))} ms`;
  if (metric.format === 'currency')
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: metric.currency ?? 'GBP',
      maximumFractionDigits: 4,
    }).format(value);
  return formatNumber(value);
}

export function IntelligenceDetailExplorer({
  eyebrow,
  title,
  description,
  rows,
  metrics,
  sourceLabel,
  sourceHref,
}: {
  eyebrow: string;
  title: string;
  description: string;
  rows: DetailRow[];
  metrics: DetailMetric[];
  sourceLabel: string;
  sourceHref?: string;
}) {
  const [metricKey, setMetricKey] = useState(metrics[0]?.key ?? '');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<DetailRow | null>(null);
  const metric = metrics.find((entry) => entry.key === metricKey) ?? metrics[0];
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter((row) => !query || `${row.label} ${row.subtitle}`.toLowerCase().includes(query))
      .sort(
        (left, right) =>
          (right.metrics[metricKey] ?? Number.NEGATIVE_INFINITY) -
          (left.metrics[metricKey] ?? Number.NEGATIVE_INFINITY),
      );
  }, [metricKey, rows, search]);
  if (!metric) return null;

  const measured = visible.filter((row) => row.metrics[metric.key] !== null);
  const values = measured.map((row) => row.metrics[metric.key] as number);
  const total = values.reduce((sum, value) => sum + value, 0);
  const average = values.length ? total / values.length : null;
  const top = measured[0];

  return (
    <section className={styles.explorer} aria-label={`${title} interactive analysis`}>
      <div className={styles.header}>
        <div>
          <p>{eyebrow}</p>
          <h2>{title}</h2>
          <span>{description}</span>
        </div>
        {sourceHref ? (
          <Link href={sourceHref}>
            {sourceLabel} <ExternalLink aria-hidden="true" size={13} />
          </Link>
        ) : (
          <span className={styles.source}>
            <Database aria-hidden="true" size={13} /> {sourceLabel}
          </span>
        )}
      </div>

      <div className={styles.controls}>
        <label>
          <span>Measure</span>
          <select value={metricKey} onChange={(event) => setMetricKey(event.target.value)}>
            {metrics.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.search}>
          <span>Find a cohort</span>
          <span>
            <Search aria-hidden="true" size={14} />
            <input
              placeholder="Search name or dimension"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
        </label>
        <div className={styles.coverage}>
          <ShieldCheck aria-hidden="true" size={16} />
          <span>
            <strong>
              {formatNumber(measured.length)} of {formatNumber(visible.length)}
            </strong>
            <small>cohorts measured</small>
          </span>
        </div>
      </div>

      <div className={styles.stats}>
        <div>
          <span>Selected measure</span>
          <strong>{metric.label}</strong>
        </div>
        <div>
          <span>Measured average</span>
          <strong>{formatMetric(average, metric)}</strong>
        </div>
        <div>
          <span>Highest cohort</span>
          <strong>{top?.label ?? 'No evidence'}</strong>
        </div>
        <div>
          <span>Visible cohorts</span>
          <strong>{formatNumber(visible.length)}</strong>
        </div>
      </div>

      <div className={styles.visualGrid}>
        <div className={styles.chart}>
          <div className={styles.sectionTitle}>
            <h3>
              <BarChart3 aria-hidden="true" size={15} /> Ranked comparison
            </h3>
            <small>Choose a row to inspect its source facts</small>
          </div>
          <ComparisonChart
            title={`${metric.label} by cohort`}
            data={visible.slice(0, 12).map((row) => ({
              label: row.label,
              value: row.metrics[metric.key],
            }))}
            series={[{ key: 'value', label: metric.label }]}
            valueFormatter={(value) => formatMetric(value, metric)}
            height={Math.max(240, Math.min(420, visible.length * 35))}
          />
        </div>
        <div className={styles.ranking}>
          <div className={styles.sectionTitle}>
            <h3>
              <Filter aria-hidden="true" size={15} /> Investigate cohorts
            </h3>
            <small>{formatNumber(visible.length)} in current view</small>
          </div>
          <div className={styles.rows}>
            {visible.map((row, index) => (
              <button key={row.id} onClick={() => setSelected(row)} type="button">
                <span className={styles.rank}>{String(index + 1).padStart(2, '0')}</span>
                <span>
                  <strong>{row.label}</strong>
                  <small>{row.subtitle}</small>
                </span>
                <em>{formatMetric(row.metrics[metric.key] ?? null, metric)}</em>
                <ArrowRight aria-hidden="true" size={14} />
              </button>
            ))}
            {visible.length === 0 ? (
              <p className={styles.empty}>No cohorts match this search.</p>
            ) : null}
          </div>
        </div>
      </div>

      {selected ? (
        <aside className={styles.drawer} aria-label="Investigation details">
          <div className={styles.drawerHead}>
            <div>
              <p>Evidence-backed cohort</p>
              <h3>{selected.label}</h3>
              <span>{selected.subtitle}</span>
            </div>
            <button
              aria-label="Close investigation details"
              onClick={() => setSelected(null)}
              type="button"
            >
              <X aria-hidden="true" size={17} />
            </button>
          </div>
          <div className={styles.metricStrip}>
            {metrics.map((entry) => (
              <div key={entry.key}>
                <span>{entry.label}</span>
                <strong>{formatMetric(selected.metrics[entry.key] ?? null, entry)}</strong>
              </div>
            ))}
          </div>
          <dl className={styles.evidence}>
            {selected.evidence.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
          {selected.href ? (
            <Link className={styles.openLink} href={selected.href}>
              Open source records <ExternalLink aria-hidden="true" size={14} />
            </Link>
          ) : null}
          <p className={styles.boundary}>
            This view explains the persisted cohort. It does not establish causation or authorise an
            operational change.
          </p>
        </aside>
      ) : null}
    </section>
  );
}
