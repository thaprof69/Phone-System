import type { ReactNode } from 'react';
import { ErrorState, PageHeading } from '@quantum-parks/ui';
import { AppShell } from './shell';
import { DomainNav } from './domain-nav';

/**
 * The frame every domain list view shares: application shell, page heading, the
 * domain's own sub-navigation, then the view's content.
 *
 * Having one frame keeps the heading, description and sub-navigation consistent
 * across ten domains instead of each page assembling its own.
 */
export function DomainPage({
  eyebrow,
  title,
  description,
  actions,
  meta,
  badges,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  meta?: ReactNode;
  badges?: Record<string, number>;
  children: ReactNode;
}) {
  return (
    <AppShell>
      <PageHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
        {...(actions ? { actions } : {})}
        {...(meta ? { meta } : {})}
      />
      <DomainNav {...(badges ? { badges } : {})} />
      {children}
    </AppShell>
  );
}

/** Consistent presentation for a read that failed, rather than a blank page. */
export function LoadFailure({ reason, subject }: { reason: string; subject: string }) {
  return <ErrorState title={`${subject} could not be loaded`} detail={reason} />;
}
