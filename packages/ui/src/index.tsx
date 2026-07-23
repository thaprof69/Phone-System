import type { ReactNode } from 'react';

export function StatusPill({
  tone = 'neutral',
  children,
}: {
  tone?: 'good' | 'warning' | 'danger' | 'neutral' | 'info';
  children: ReactNode;
}) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}

export function MetricCard({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'neutral' | 'good' | 'warning' | 'danger';
}) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <p className="eyebrow">{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state" role="status">
      <div className="empty-mark" aria-hidden="true">
        Q
      </div>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}

export function Panel({
  title,
  eyebrow,
  action,
  children,
  className = '',
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-header">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const bounded = Math.max(0, Math.min(value, 100));
  return (
    <div className="progress-wrap">
      <div className="progress-copy">
        <span>{label}</span>
        <strong>{bounded}%</strong>
      </div>
      <div className="progress-track">
        <span style={{ width: `${bounded}%` }} />
      </div>
    </div>
  );
}
