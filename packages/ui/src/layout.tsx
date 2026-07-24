import type { ReactNode } from 'react';

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Status pills or badges rendered beside the title. */
  meta?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <div className="page-heading-title">
          <h1>{title}</h1>
          {meta ? <div className="page-heading-meta">{meta}</div> : null}
        </div>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="heading-actions">{actions}</div> : null}
    </header>
  );
}

export function Toolbar({
  children,
  align = 'between',
}: {
  children: ReactNode;
  align?: 'between' | 'start' | 'end';
}) {
  return <div className={`toolbar toolbar-${align}`}>{children}</div>;
}

export function Section({
  title,
  description,
  action,
  children,
  id,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="content-section" {...(id ? { id } : {})}>
      <header className="content-section-header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/**
 * Primary content beside a contextual rail. Collapses to a single column on narrow
 * viewports so the rail never squeezes the workspace on a 13-inch laptop.
 */
export function SplitView({
  main,
  aside,
  asideLabel,
  asidePosition = 'end',
}: {
  main: ReactNode;
  aside: ReactNode;
  asideLabel: string;
  asidePosition?: 'start' | 'end';
}) {
  return (
    <div className={`split-view aside-${asidePosition}`}>
      <div className="split-main">{main}</div>
      <aside className="split-aside" aria-label={asideLabel}>
        {aside}
      </aside>
    </div>
  );
}

export function CardGrid({ children, columns = 3 }: { children: ReactNode; columns?: 2 | 3 | 4 }) {
  return <div className={`card-grid card-grid-${columns}`}>{children}</div>;
}
