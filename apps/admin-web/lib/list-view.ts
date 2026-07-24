import type { SortDirection, TableSort } from '@quantum-parks/ui';

/**
 * List views keep their state in the URL: sort, filters, search and page.
 *
 * That keeps the pages server components, makes any view shareable and reloadable,
 * and means the browser back button behaves the way an operator expects.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

export function readParam(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

export function readNumber(params: SearchParams, key: string, fallback: number): number {
  const raw = readParam(params, key);
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function readSort(
  params: SearchParams,
  defaultKey: string,
  defaultDirection: SortDirection = 'desc',
): TableSort {
  const key = readParam(params, 'sort') ?? defaultKey;
  const direction =
    readParam(params, 'dir') === 'asc'
      ? 'asc'
      : readParam(params, 'dir') === 'desc'
        ? 'desc'
        : defaultDirection;
  return { key, direction };
}

/** Builds a URL preserving the current query, with `changes` applied on top. */
export function buildHref(
  pathname: string,
  params: SearchParams,
  changes: Record<string, string | number | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single !== undefined && single !== '') query.set(key, single);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === '') query.delete(key);
    else query.set(key, String(value));
  }
  const serialised = query.toString();
  return serialised ? `${pathname}?${serialised}` : pathname;
}

/** Sorts in memory. The existing list endpoints return whole collections. */
export function sortRows<T>(
  rows: readonly T[],
  sort: TableSort,
  accessors: Record<string, (row: T) => string | number | null | undefined>,
): T[] {
  const accessor = accessors[sort.key];
  if (!accessor) return [...rows];
  const factor = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = accessor(left);
    const b = accessor(right);
    // Absent values sort last regardless of direction: an unknown date is not
    // "the earliest date", and floating them to the top would mislead.
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    if (typeof a === 'number' && typeof b === 'number') return (a - b) * factor;
    return String(a).localeCompare(String(b)) * factor;
  });
}

export function paginate<T>(rows: readonly T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

export const DEFAULT_PAGE_SIZE = 25;

/** Case-insensitive substring match across the given fields. */
export function matchesSearch<T>(
  row: T,
  term: string | undefined,
  fields: Array<(row: T) => string | null | undefined>,
): boolean {
  if (!term) return true;
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => (field(row) ?? '').toLowerCase().includes(needle));
}
