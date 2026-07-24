/**
 * Presentation formatters shared by every control-plane surface.
 *
 * These are deliberately pure and locale-fixed to `en-GB`: operator screens,
 * exported reports and browser tests must agree on the same rendered string.
 */

const LOCALE = 'en-GB';

/** Provider costs are stored as integer micros to avoid float drift. */
const MICROS_PER_UNIT = 1_000_000;

export function formatCurrencyFromMicros(
  micros: number | null | undefined,
  currency = 'GBP',
): string {
  if (micros === null || micros === undefined || !Number.isFinite(micros)) return '—';
  const units = micros / MICROS_PER_UNIT;
  // Sub-penny spend is common for a single model call; show enough precision to be useful.
  const fractionDigits = units !== 0 && Math.abs(units) < 0.01 ? 4 : 2;
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(units);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(LOCALE).format(value);
}

export function formatPercent(value: number | null | undefined, fractionDigits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** `ratio(3, 4)` → 0.75. Returns null when the denominator carries no evidence. */
export function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' }).format(date);
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function formatTime(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(LOCALE, { timeStyle: 'short' }).format(date);
}

/** ISO date key (`2026-07-24`) — used for date-range inputs and aggregate keys. */
export function toDateKey(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '';
  return date.toISOString().slice(0, 10);
}

const RELATIVE_UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: 'year', ms: 31_536_000_000 },
  { unit: 'month', ms: 2_592_000_000 },
  { unit: 'day', ms: 86_400_000 },
  { unit: 'hour', ms: 3_600_000 },
  { unit: 'minute', ms: 60_000 },
  { unit: 'second', ms: 1000 },
];

export function formatRelativeTime(
  value: string | number | Date | null | undefined,
  now: Date = new Date(),
): string {
  const date = toDate(value);
  if (!date) return '—';
  const deltaMs = date.getTime() - now.getTime();
  const formatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  for (const { unit, ms } of RELATIVE_UNITS) {
    if (Math.abs(deltaMs) >= ms) return formatter.format(Math.round(deltaMs / ms), unit);
  }
  return formatter.format(0, 'second');
}

/** Seconds → `4m 12s`. Call durations and SLA timers use this everywhere. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainder}s`;
  return `${remainder}s`;
}

export function formatLatency(milliseconds: number | null | undefined): string {
  if (milliseconds === null || milliseconds === undefined || !Number.isFinite(milliseconds))
    return '—';
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(2)} s`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index] ?? 'B'}`;
}

/**
 * Turns a machine state such as `APPROVED_FOR_PUBLISH` into `Approved for publish`.
 * Operator surfaces should read as English; the raw token belongs in technical detail.
 */
export function humaniseState(state: string | null | undefined): string {
  if (!state) return '—';
  const lower = state.replaceAll('_', ' ').toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Shortens identifiers for dense tables while keeping them recognisable. */
export function shortId(id: string | null | undefined, length = 8): string {
  if (!id) return '—';
  return id.length <= length ? id : `${id.slice(0, length)}…`;
}

export function formatChecksum(checksum: string | null | undefined): string {
  if (!checksum) return '—';
  return checksum.length <= 16 ? checksum : `${checksum.slice(0, 8)}…${checksum.slice(-4)}`;
}

export function formatList(values: readonly string[] | null | undefined, empty = '—'): string {
  if (!values || values.length === 0) return empty;
  return new Intl.ListFormat(LOCALE, { style: 'short', type: 'conjunction' }).format(values);
}

export function formatTokens(tokens: number | null | undefined): string {
  if (tokens === null || tokens === undefined || !Number.isFinite(tokens)) return '—';
  if (tokens < 1000) return String(tokens);
  return `${(tokens / 1000).toFixed(1)}k`;
}
