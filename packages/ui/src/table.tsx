import type { ReactNode } from 'react';

export type SortDirection = 'asc' | 'desc';

export type Column<T> = {
  /** Stable key; also the value used in sort links. */
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  align?: 'start' | 'end';
  /** Hides the column below the narrow breakpoint rather than letting the table overflow. */
  priority?: 'primary' | 'secondary';
  width?: string;
};

export type TableSort = { key: string; direction: SortDirection };

/**
 * The one table used across the control plane.
 *
 * Sorting is expressed as links rather than client state so that list views stay server
 * components, the URL remains the single source of truth, and a sorted view can be shared
 * or reloaded. `buildSortHref` is supplied by the page, which owns the query string.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowKey,
  sort,
  buildSortHref,
  rowHref,
  empty,
  dense = false,
}: {
  /** Required. Screen readers announce it; sighted users see it only via `captionVisible`. */
  caption: string;
  columns: ReadonlyArray<Column<T>>;
  rows: readonly T[];
  getRowKey: (row: T) => string;
  sort?: TableSort;
  buildSortHref?: (key: string, direction: SortDirection) => string;
  rowHref?: (row: T) => string | undefined;
  empty?: ReactNode;
  dense?: boolean;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="table-scroll">
      <table className={dense ? 'data-table dense' : 'data-table'}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const isSorted = sort?.key === column.key;
              const ariaSort = isSorted
                ? sort.direction === 'asc'
                  ? ('ascending' as const)
                  : ('descending' as const)
                : ('none' as const);
              const nextDirection: SortDirection =
                isSorted && sort.direction === 'asc' ? 'desc' : 'asc';
              return (
                <th
                  key={column.key}
                  scope="col"
                  className={[
                    column.align === 'end' ? 'align-end' : '',
                    column.priority === 'secondary' ? 'column-secondary' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  {...(column.sortable ? { 'aria-sort': ariaSort } : {})}
                  {...(column.width ? { style: { width: column.width } } : {})}
                >
                  {column.sortable && buildSortHref ? (
                    <a
                      className={isSorted ? 'column-sort active' : 'column-sort'}
                      href={buildSortHref(column.key, nextDirection)}
                    >
                      {column.header}
                      <span aria-hidden="true" className="sort-indicator">
                        {isSorted ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </a>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = rowHref?.(row);
            return (
              <tr key={getRowKey(row)} className={href ? 'row-linked' : undefined}>
                {columns.map((column, index) => {
                  const content = column.render(row);
                  const className = [
                    column.align === 'end' ? 'align-end' : '',
                    column.priority === 'secondary' ? 'column-secondary' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  // The first cell carries the row link so keyboard users get one
                  // predictable target per row instead of a click handler on <tr>.
                  if (index === 0) {
                    return (
                      <th scope="row" key={column.key} className={className}>
                        {href ? (
                          <a className="row-link" href={href}>
                            {content}
                          </a>
                        ) : (
                          content
                        )}
                      </th>
                    );
                  }
                  return (
                    <td key={column.key} className={className}>
                      {content}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Link-based pagination. Server components own the offset in the query string.
 */
export function Pagination({
  page,
  pageSize,
  total,
  buildHref,
}: {
  page: number;
  pageSize: number;
  total: number;
  buildHref: (page: number) => string;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage <= 1) return null;
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav className="pagination" aria-label="Pagination">
      <p aria-live="polite">
        Showing <strong>{first}</strong>–<strong>{last}</strong> of <strong>{total}</strong>
      </p>
      <div className="pagination-controls">
        {page > 1 ? (
          <a className="button ghost small" href={buildHref(page - 1)} rel="prev">
            Previous
          </a>
        ) : (
          <span className="button ghost small disabled" aria-disabled="true">
            Previous
          </span>
        )}
        <span className="pagination-position">
          Page {page} of {lastPage}
        </span>
        {page < lastPage ? (
          <a className="button ghost small" href={buildHref(page + 1)} rel="next">
            Next
          </a>
        ) : (
          <span className="button ghost small disabled" aria-disabled="true">
            Next
          </span>
        )}
      </div>
    </nav>
  );
}
