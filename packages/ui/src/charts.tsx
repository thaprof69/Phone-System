'use client';

import type { ReactNode } from 'react';
import {
  Area,
  AreaChart as RechartsAreaChart,
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CHART_AXIS,
  CHART_GRID,
  CHART_SURFACE,
  MARK,
  MAX_SERIES,
  seriesColor,
} from './chart-theme';

/**
 * Charts are wrapped so feature pages never import Recharts directly. Every wrapper
 * supplies the validated palette, consistent formatting, a responsive container, an
 * accessible caption and description, and a keyboard-reachable table of the same
 * numbers. The visual is marked `aria-hidden` because the table is the accessible
 * representation — announcing both duplicates every value.
 */

export type ChartDatum = { label: string } & Record<string, string | number | null | undefined>;

export type ChartSeries = {
  key: string;
  label: string;
  /** Overrides the palette slot. Use only for reserved status meanings. */
  color?: string;
};

type ChartFrameProps = {
  title: string;
  description?: string;
  series: readonly ChartSeries[];
  data: readonly ChartDatum[];
  valueFormatter?: (value: number) => string;
  height?: number;
  footer?: ReactNode;
  children: ReactNode;
};

const defaultFormatter = (value: number) => new Intl.NumberFormat('en-GB').format(value);

function ChartFrame({
  title,
  description,
  series,
  data,
  valueFormatter = defaultFormatter,
  height = 280,
  footer,
  children,
}: ChartFrameProps) {
  const format = (value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === '') return '—';
    return typeof value === 'number' ? valueFormatter(value) : value;
  };

  return (
    <figure className="chart-figure">
      <figcaption className="chart-caption">
        <span className="chart-title">{title}</span>
        {description ? <span className="chart-description">{description}</span> : null}
      </figcaption>

      {series.length > 1 ? (
        <ul className="chart-legend">
          {series.map((entry, index) => (
            <li key={entry.key}>
              <span
                className="chart-swatch"
                aria-hidden="true"
                style={{ background: entry.color ?? seriesColor(index) }}
              />
              {entry.label}
            </li>
          ))}
        </ul>
      ) : null}

      {/*
        `inert` rather than `aria-hidden`: the chart library renders its own focusable
        surface, and an aria-hidden subtree containing focusable elements is itself a
        WCAG failure. `inert` removes the subtree from the accessibility tree *and*
        from the tab order, leaving the table below as the accessible representation.
      */}
      <div className="chart-plot" style={{ height }} inert>
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>

      {footer}

      <details className="chart-table">
        <summary>View data as a table</summary>
        <div className="table-scroll">
          <table className="data-table dense">
            <caption className="sr-only">{title} — underlying values</caption>
            <thead>
              <tr>
                <th scope="col">Category</th>
                {series.map((entry) => (
                  <th scope="col" className="align-end" key={entry.key}>
                    {entry.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  {series.map((entry) => (
                    <td className="align-end" key={entry.key}>
                      {format(row[entry.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Guards the series cap — a cycled palette would make series 7 read as series 1. */
function cappedSeries(series: readonly ChartSeries[]): readonly ChartSeries[] {
  return series.length <= MAX_SERIES ? series : series.slice(0, MAX_SERIES);
}

const axisProps = {
  stroke: CHART_AXIS,
  tick: { fill: CHART_AXIS, fontSize: 12 },
  tickLine: false,
} as const;

const tooltipProps = {
  contentStyle: {
    background: CHART_SURFACE,
    border: `1px solid ${CHART_GRID}`,
    borderRadius: 10,
    fontSize: 12,
  },
} as const;

/* ------------------------------------------------------------------ line */

export function LineChart({
  title,
  description,
  data,
  series,
  valueFormatter,
  height,
  xLabel,
}: {
  title: string;
  description?: string;
  data: readonly ChartDatum[];
  series: readonly ChartSeries[];
  valueFormatter?: (value: number) => string;
  height?: number;
  xLabel?: string;
}) {
  const visible = cappedSeries(series);
  return (
    <ChartFrame
      title={title}
      data={data}
      series={visible}
      {...(description ? { description } : {})}
      {...(valueFormatter ? { valueFormatter } : {})}
      {...(height ? { height } : {})}
    >
      <RechartsLineChart
        data={data as ChartDatum[]}
        margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
      >
        <CartesianGrid stroke={CHART_GRID} vertical={false} />
        <XAxis dataKey="label" {...axisProps} {...(xLabel ? { name: xLabel } : {})} />
        <YAxis {...axisProps} width={56} />
        <Tooltip {...tooltipProps} />
        {visible.map((entry, index) => (
          <Line
            key={entry.key}
            type="monotone"
            dataKey={entry.key}
            name={entry.label}
            stroke={entry.color ?? seriesColor(index)}
            strokeWidth={MARK.lineWidth}
            dot={{ r: MARK.dotRadius, strokeWidth: 0 }}
            activeDot={{ r: MARK.activeDotRadius }}
            isAnimationActive={false}
          />
        ))}
      </RechartsLineChart>
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------- bar */

export function BarChart({
  title,
  description,
  data,
  series,
  valueFormatter,
  height,
  horizontal = false,
}: {
  title: string;
  description?: string;
  data: readonly ChartDatum[];
  series: readonly ChartSeries[];
  valueFormatter?: (value: number) => string;
  height?: number;
  horizontal?: boolean;
}) {
  const visible = cappedSeries(series);
  const useCategoryColours = visible.length === 1 && !visible[0]?.color;
  return (
    <ChartFrame
      title={title}
      data={data}
      series={visible}
      {...(description ? { description } : {})}
      {...(valueFormatter ? { valueFormatter } : {})}
      {...(height ? { height } : {})}
    >
      <RechartsBarChart
        data={data as ChartDatum[]}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
      >
        <CartesianGrid stroke={CHART_GRID} vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" {...axisProps} />
            <YAxis type="category" dataKey="label" width={140} {...axisProps} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} width={56} />
          </>
        )}
        <Tooltip {...tooltipProps} cursor={{ fill: 'rgb(23 32 29 / 4%)' }} />
        {visible.map((entry, index) => (
          <Bar
            key={entry.key}
            dataKey={entry.key}
            name={entry.label}
            fill={entry.color ?? seriesColor(index)}
            radius={
              horizontal
                ? [0, MARK.barRadius, MARK.barRadius, 0]
                : [MARK.barRadius, MARK.barRadius, 0, 0]
            }
            isAnimationActive={false}
          >
            {useCategoryColours
              ? data.map((datum, datumIndex) => (
                  <Cell key={`${datum.label}-${datumIndex}`} fill={seriesColor(datumIndex)} />
                ))
              : null}
          </Bar>
        ))}
      </RechartsBarChart>
    </ChartFrame>
  );
}

/* ----------------------------------------------------------- stacked bar */

export function StackedBarChart({
  title,
  description,
  data,
  series,
  valueFormatter,
  height,
}: {
  title: string;
  description?: string;
  data: readonly ChartDatum[];
  series: readonly ChartSeries[];
  valueFormatter?: (value: number) => string;
  height?: number;
}) {
  const visible = cappedSeries(series);
  const lastKey = visible[visible.length - 1]?.key;
  return (
    <ChartFrame
      title={title}
      data={data}
      series={visible}
      {...(description ? { description } : {})}
      {...(valueFormatter ? { valueFormatter } : {})}
      {...(height ? { height } : {})}
    >
      <RechartsBarChart
        data={data as ChartDatum[]}
        margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
      >
        <CartesianGrid stroke={CHART_GRID} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={56} />
        <Tooltip {...tooltipProps} cursor={{ fill: 'rgb(23 32 29 / 4%)' }} />
        {visible.map((entry, index) => (
          <Bar
            key={entry.key}
            dataKey={entry.key}
            name={entry.label}
            stackId="stack"
            fill={entry.color ?? seriesColor(index)}
            // A surface-coloured stroke separates adjacent segments so the boundary
            // is visible without relying on the colour difference alone.
            stroke={CHART_SURFACE}
            strokeWidth={MARK.segmentGap}
            {...(entry.key === lastKey
              ? {
                  radius: [MARK.barRadius, MARK.barRadius, 0, 0] as [
                    number,
                    number,
                    number,
                    number,
                  ],
                }
              : {})}
            isAnimationActive={false}
          />
        ))}
      </RechartsBarChart>
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------ area */

export function AreaChart({
  title,
  description,
  data,
  series,
  valueFormatter,
  height,
  stacked = false,
}: {
  title: string;
  description?: string;
  data: readonly ChartDatum[];
  series: readonly ChartSeries[];
  valueFormatter?: (value: number) => string;
  height?: number;
  stacked?: boolean;
}) {
  const visible = cappedSeries(series);
  return (
    <ChartFrame
      title={title}
      data={data}
      series={visible}
      {...(description ? { description } : {})}
      {...(valueFormatter ? { valueFormatter } : {})}
      {...(height ? { height } : {})}
    >
      <RechartsAreaChart
        data={data as ChartDatum[]}
        margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
      >
        <CartesianGrid stroke={CHART_GRID} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={56} />
        <Tooltip {...tooltipProps} />
        {visible.map((entry, index) => {
          const color = entry.color ?? seriesColor(index);
          return (
            <Area
              key={entry.key}
              type="monotone"
              dataKey={entry.key}
              name={entry.label}
              stroke={color}
              strokeWidth={MARK.lineWidth}
              fill={color}
              fillOpacity={stacked ? 0.85 : 0.18}
              {...(stacked ? { stackId: 'stack' } : {})}
              isAnimationActive={false}
            />
          );
        })}
      </RechartsAreaChart>
    </ChartFrame>
  );
}

/* ----------------------------------------------------------------- donut */

export function DonutChart({
  title,
  description,
  data,
  valueKey = 'value',
  valueFormatter,
  height = 260,
  centreLabel,
  centreValue,
}: {
  title: string;
  description?: string;
  data: readonly ChartDatum[];
  valueKey?: string;
  valueFormatter?: (value: number) => string;
  height?: number;
  centreLabel?: string;
  centreValue?: string;
}) {
  const capped = data.slice(0, MAX_SERIES);
  const series: ChartSeries[] = [{ key: valueKey, label: 'Value' }];
  return (
    <ChartFrame
      title={title}
      data={capped}
      series={series}
      {...(description ? { description } : {})}
      {...(valueFormatter ? { valueFormatter } : {})}
      height={height}
      footer={
        <ul className="chart-legend">
          {capped.map((slice, index) => (
            <li key={slice.label}>
              <span
                className="chart-swatch"
                aria-hidden="true"
                style={{ background: seriesColor(index) }}
              />
              {slice.label}
            </li>
          ))}
        </ul>
      }
    >
      <RechartsPieChart>
        <Tooltip {...tooltipProps} />
        <Pie
          data={capped as ChartDatum[]}
          dataKey={valueKey}
          nameKey="label"
          innerRadius="58%"
          outerRadius="82%"
          paddingAngle={2}
          stroke={CHART_SURFACE}
          strokeWidth={MARK.segmentGap}
          isAnimationActive={false}
        >
          {capped.map((slice, index) => (
            <Cell key={slice.label} fill={seriesColor(index)} />
          ))}
          {centreValue ? (
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontSize: 22, fontWeight: 600 }}
            >
              {centreValue}
            </text>
          ) : null}
          {centreLabel ? (
            <text x="50%" y="50%" dy={22} textAnchor="middle" style={{ fontSize: 11 }}>
              {centreLabel}
            </text>
          ) : null}
        </Pie>
      </RechartsPieChart>
    </ChartFrame>
  );
}

/* -------------------------------------------------------------- sparkline */

/**
 * An inline trend indicator. It carries no axes, so it is always accompanied by the
 * value it annotates and an accessible summary rather than standing alone.
 */
export function Sparkline({
  values,
  label,
  summary,
  tone,
  width = 120,
  height = 32,
}: {
  values: readonly number[];
  label: string;
  summary: string;
  tone?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / span) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <span className="sparkline" role="img" aria-label={`${label}. ${summary}`}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <polyline
          points={points}
          fill="none"
          stroke={tone ?? seriesColor(1)}
          strokeWidth={MARK.lineWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/* ------------------------------------------------------------- comparison */

/**
 * Two comparable dimensions side by side — park against park, language against
 * language. Deliberately a grouped bar rather than a dual axis: two y-scales on one
 * plot invite false correlations.
 */
export function ComparisonChart({
  title,
  description,
  data,
  series,
  valueFormatter,
  height,
}: {
  title: string;
  description?: string;
  data: readonly ChartDatum[];
  series: readonly ChartSeries[];
  valueFormatter?: (value: number) => string;
  height?: number;
}) {
  return (
    <BarChart
      title={title}
      data={data}
      series={series}
      horizontal
      {...(description ? { description } : {})}
      {...(valueFormatter ? { valueFormatter } : {})}
      {...(height ? { height } : {})}
    />
  );
}

/* ------------------------------------------------------------------ trend */

/**
 * A single measure over time with its headline value stated in text, so the trend
 * is readable without interpreting the plot.
 */
export function TrendChart({
  title,
  description,
  data,
  seriesKey = 'value',
  seriesLabel,
  headline,
  change,
  valueFormatter,
  height,
}: {
  title: string;
  description?: string;
  data: readonly ChartDatum[];
  seriesKey?: string;
  seriesLabel: string;
  headline?: string;
  change?: { value: string; tone: 'good' | 'warning' | 'danger' | 'neutral' };
  valueFormatter?: (value: number) => string;
  height?: number;
}) {
  return (
    <div className="trend-chart">
      {headline ? (
        <p className="trend-headline">
          <strong>{headline}</strong>
          {change ? (
            <span className={`trend-change tone-${change.tone}`}>{change.value}</span>
          ) : null}
        </p>
      ) : null}
      <AreaChart
        title={title}
        data={data}
        series={[{ key: seriesKey, label: seriesLabel }]}
        {...(description ? { description } : {})}
        {...(valueFormatter ? { valueFormatter } : {})}
        {...(height ? { height } : {})}
      />
    </div>
  );
}

export { Legend };
