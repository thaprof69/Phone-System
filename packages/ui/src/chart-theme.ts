/**
 * Chart colour system.
 *
 * The categorical order below is not a taste decision — candidate orderings were
 * enumerated and validated, and only a passing order was kept. Against the light
 * chart surface `#fcfcf8` on the default *adjacent* pairlist (lines, bars, stacked
 * segments, donut slices) it clears every gate:
 *
 *   lightness band  PASS  all six inside L 0.43–0.77
 *   chroma floor    PASS  all six >= 0.1
 *   CVD separation  PASS  worst adjacent gold↔green ΔE 8.7 (protan), tritan 12.9
 *   normal vision   PASS  worst adjacent gold↔green ΔE 17.7
 *   contrast        PASS  all six >= 3:1 against the surface
 *
 * The application renders a single light theme — there is no dark mode in this
 * product — so only the light steps are defined. If dark mode is ever introduced,
 * the dark steps must be selected and validated against the dark surface as their
 * own set, never derived by flipping these.
 */

/** Fixed categorical order. Assign by slot; never cycle, never reorder per chart. */
export const CATEGORICAL_SERIES = [
  '#e2701a', // 1 orange
  '#1c6d99', // 2 blue
  '#d13f3f', // 3 red
  '#7a4ac4', // 4 violet
  '#0f8a63', // 5 green
  '#b1860c', // 6 gold
] as const;

/**
 * Forms that compare every series against every other — scatter, bubble — cannot
 * use all six: the full set does not clear the all-pairs floors. Cap those at this
 * validated subset and fold the remainder into "Other" or facet instead.
 */
export const CATEGORICAL_ALL_PAIRS_SAFE = ['#1c6d99', '#e2701a', '#7a4ac4'] as const;

/** Single-hue ramp for continuous magnitude (heatmaps). Light to dark. */
export const SEQUENTIAL_BLUE = [
  '#d6e6f0',
  '#b0cee1',
  '#85b3d0',
  '#5a97bd',
  '#3580a8',
  '#1c6d99',
  '#12547a',
] as const;

/**
 * Ordinal ramps (discrete ordered marks) must stay readable against the surface,
 * so they start at the third step rather than the palest one.
 */
export const ORDINAL_BLUE = SEQUENTIAL_BLUE.slice(2);

/** Diverging pair with a neutral midpoint — never a hue in the middle. */
export const DIVERGING = {
  negative: ['#a8332f', '#c86a63', '#e0a9a2'],
  neutral: '#eceae4',
  positive: ['#a7c7d8', '#5a97bd', '#12547a'],
} as const;

/**
 * Status colours are reserved. They never double as "series 4", and they always
 * ship with a label or icon so state is never carried by colour alone.
 */
export const STATUS_COLORS = {
  good: '#0f8a63',
  warning: '#b1860c',
  serious: '#e2701a',
  critical: '#c8302c',
  neutral: '#59645f',
} as const;

export const CHART_SURFACE = '#fcfcf8';
export const CHART_GRID = '#e4e7de';
export const CHART_AXIS = '#59645f';
export const CHART_INK = '#17201d';

/** Marks: thin lines, generous hit targets, a surface-coloured gap between fills. */
export const MARK = {
  lineWidth: 2,
  dotRadius: 4,
  activeDotRadius: 6,
  barRadius: 4,
  /** Rendered as a stroke in the surface colour so stacked segments read as separate. */
  segmentGap: 2,
} as const;

export function seriesColor(index: number): string {
  // Deliberately clamps rather than wrapping: a cycled palette makes series 7 and
  // series 1 identical, which silently misreads as the same entity.
  const clamped = Math.min(Math.max(index, 0), CATEGORICAL_SERIES.length - 1);
  return CATEGORICAL_SERIES[clamped] ?? CATEGORICAL_SERIES[0];
}

export const MAX_SERIES = CATEGORICAL_SERIES.length;
