import type { ReactNode } from 'react';
import { collapseContext, diffLines, summariseDiff } from './diff';
import type { Tone } from './status';

/* ------------------------------------------------------------ definition list */

export type DefinitionItem = {
  term: string;
  value: ReactNode;
  /** Optional clarification rendered under the value in muted text. */
  hint?: string;
};

export function DefinitionList({
  items,
  columns = 2,
}: {
  items: readonly DefinitionItem[];
  columns?: 1 | 2 | 3;
}) {
  return (
    <dl className={`definition-list columns-${columns}`}>
      {items.map((item) => (
        <div className="definition-item" key={item.term}>
          <dt>{item.term}</dt>
          <dd>
            {item.value}
            {item.hint ? <small>{item.hint}</small> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="key-value">
      <span className="key-value-label">{label}</span>
      <span className="key-value-content">{children}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ timeline */

export type TimelineEntry = {
  id: string;
  title: string;
  timestamp: string;
  detail?: ReactNode;
  tone?: Tone;
  actor?: string;
};

export function Timeline({ entries }: { entries: readonly TimelineEntry[] }) {
  return (
    <ol className="timeline">
      {entries.map((entry) => (
        <li className={`timeline-entry tone-${entry.tone ?? 'neutral'}`} key={entry.id}>
          <span className="timeline-marker" aria-hidden="true" />
          <div className="timeline-body">
            <div className="timeline-heading">
              <strong>{entry.title}</strong>
              <time>{entry.timestamp}</time>
            </div>
            {entry.actor ? <p className="timeline-actor">{entry.actor}</p> : null}
            {entry.detail ? <div className="timeline-detail">{entry.detail}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------------- diff view */

export function DiffView({
  before,
  after,
  beforeLabel = 'Current',
  afterLabel = 'Proposed',
  contextLines = 3,
}: {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
  contextLines?: number;
}) {
  const lines = diffLines(before, after);
  const summary = summariseDiff(lines);

  if (!summary.changed) {
    return (
      <div className="diff-view">
        <p className="diff-summary" role="status">
          No differences between {beforeLabel.toLowerCase()} and {afterLabel.toLowerCase()}.
        </p>
      </div>
    );
  }

  const groups = collapseContext(lines, contextLines);

  return (
    <div className="diff-view">
      <p className="diff-summary" role="status">
        <span className="diff-count added">+{summary.added}</span>{' '}
        <span className="diff-count removed">−{summary.removed}</span> across{' '}
        {summary.unchanged + summary.added + summary.removed} lines. {beforeLabel} compared with{' '}
        {afterLabel}.
      </p>
      <table className="diff-table">
        <caption className="sr-only">
          Line differences between {beforeLabel} and {afterLabel}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="sr-only">
              {beforeLabel} line
            </th>
            <th scope="col" className="sr-only">
              {afterLabel} line
            </th>
            <th scope="col" className="sr-only">
              Change
            </th>
            <th scope="col" className="sr-only">
              Content
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group, index) =>
            group.collapsed ? (
              <tr className="diff-collapsed" key={`gap-${index}`}>
                <td colSpan={4}>{group.count} unchanged lines</td>
              </tr>
            ) : (
              <tr className={`diff-line diff-${group.line.type}`} key={`line-${index}`}>
                <td className="diff-gutter">{group.line.beforeLine ?? ''}</td>
                <td className="diff-gutter">{group.line.afterLine ?? ''}</td>
                <td className="diff-sign" aria-hidden="true">
                  {group.line.type === 'added' ? '+' : group.line.type === 'removed' ? '−' : ' '}
                </td>
                <td className="diff-content">
                  <span className="sr-only">
                    {group.line.type === 'added'
                      ? 'Added: '
                      : group.line.type === 'removed'
                        ? 'Removed: '
                        : 'Unchanged: '}
                  </span>
                  <code>{group.line.content || ' '}</code>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------- disclosure */

/**
 * The single sanctioned home for provider identifiers, request ids, checksums,
 * schema versions and raw errors. Operator surfaces read as business language;
 * engineering evidence lives behind this control.
 */
export function TechnicalDetails({
  summary = 'Technical detail',
  children,
}: {
  summary?: string;
  children: ReactNode;
}) {
  return (
    <details className="technical-details">
      <summary>{summary}</summary>
      <div className="technical-details-body">{children}</div>
    </details>
  );
}

export function JsonInspector({ value, label }: { value: unknown; label: string }) {
  let serialised: string;
  try {
    serialised = JSON.stringify(value, null, 2) ?? 'null';
  } catch {
    serialised = 'Value could not be serialised for display.';
  }
  return (
    <figure className="json-inspector">
      <figcaption>{label}</figcaption>
      <pre tabIndex={0}>
        <code>{serialised}</code>
      </pre>
    </figure>
  );
}

/* ------------------------------------------------------------- breadcrumbs */

export function Breadcrumbs({ trail }: { trail: ReadonlyArray<{ label: string; href?: string }> }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={`${crumb.label}-${index}`}>
              {crumb.href && !isLast ? (
                <a href={crumb.href}>{crumb.label}</a>
              ) : (
                <span {...(isLast ? { 'aria-current': 'page' as const } : {})}>{crumb.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
