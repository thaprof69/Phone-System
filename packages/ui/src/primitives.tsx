import type { ComponentProps, ReactNode } from 'react';
import type { Tone } from './status';

/* ------------------------------------------------------------------ status */

export function StatusPill({
  tone = 'neutral',
  children,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={`status-pill status-${tone}`} {...(title ? { title } : {})}>
      {children}
    </span>
  );
}

/**
 * Marks a record that exists only because of the local synthetic seed.
 * Required by ADR-0011 and risks R-06 / R-15: synthetic evidence must never
 * be mistaken for production evidence.
 */
export function SyntheticBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span className="synthetic-badge" title="Synthetic record created by the local seed">
      {compact ? 'Synthetic' : 'Synthetic data'}
    </span>
  );
}

/* ------------------------------------------------------------------ buttons */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

type ButtonOwnProps = {
  variant?: ButtonVariant;
  size?: 'small' | 'medium';
  icon?: ReactNode;
  children: ReactNode;
};

export function Button({
  variant = 'secondary',
  size = 'medium',
  icon,
  children,
  className = '',
  ...rest
}: ButtonOwnProps & Omit<ComponentProps<'button'>, 'children'>) {
  return (
    <button className={`button ${variant} ${size} ${className}`.trim()} {...rest}>
      {icon ? (
        <span className="button-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}

/**
 * An icon-only control. `label` is mandatory — an unlabelled icon button is
 * invisible to assistive technology.
 */
export function IconButton({
  label,
  icon,
  variant = 'ghost',
  className = '',
  ...rest
}: {
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
} & Omit<ComponentProps<'button'>, 'children'>) {
  return (
    <button
      className={`icon-button ${variant} ${className}`.trim()}
      aria-label={label}
      title={label}
      {...rest}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ surfaces */

export function Panel({
  title,
  eyebrow,
  description,
  action,
  children,
  className = '',
  id,
}: {
  title?: string;
  eyebrow?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={`panel ${className}`.trim()} {...(id ? { id } : {})}>
      {title || eyebrow || action ? (
        <header className="panel-header">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            {title ? <h2>{title}</h2> : null}
            {description ? <p className="panel-description">{description}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = 'neutral',
  href,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: Tone;
  href?: string;
}) {
  const body = (
    <>
      <p className="eyebrow">{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </>
  );
  if (href) {
    return (
      <a className={`metric-card metric-${tone} metric-link`} href={href}>
        {body}
      </a>
    );
  }
  return <article className={`metric-card metric-${tone}`}>{body}</article>;
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="metric-grid">{children}</div>;
}

/* ------------------------------------------------------------------ feedback */

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

/**
 * A read failed. Distinct from EmptyState: empty means "no records yet",
 * this means "we could not find out". Conflating them hides outages.
 */
export function ErrorState({
  title = 'This view could not be loaded',
  detail,
  action,
}: {
  title?: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="error-state" role="alert">
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}

export function Banner({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`banner banner-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <div>
        <strong>{title}</strong>
        {children ? <p>{children}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className="skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <span className="skeleton-row" key={index} aria-hidden="true" />
      ))}
    </div>
  );
}

export function ProgressBar({
  value,
  label,
  tone = 'neutral',
}: {
  value: number;
  label: string;
  tone?: Tone;
}) {
  const bounded = Math.max(0, Math.min(Number.isFinite(value) ? value : 0, 100));
  return (
    <div className="progress-wrap">
      <div className="progress-copy">
        <span>{label}</span>
        <strong>{bounded}%</strong>
      </div>
      <div
        className={`progress-track progress-${tone}`}
        role="progressbar"
        aria-valuenow={bounded}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <span style={{ width: `${bounded}%` }} />
      </div>
    </div>
  );
}
