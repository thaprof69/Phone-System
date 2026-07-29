import type { ReactNode } from 'react';
import { ErrorState, PageHeading } from '@quantum-parks/ui';
import { AppShell } from '../shell';
import { SettingsBreadcrumbs, SettingsRail } from './settings-nav';

/**
 * The frame every Settings sub-page shares: application shell, breadcrumb, page
 * heading, the group's submenu, then the page's own content. Mirrors
 * `DomainPage`'s prop shape exactly so a page moving under Settings only has to
 * change which component it imports, not how it calls it.
 */
export function SettingsPage({
  eyebrow,
  title,
  description,
  actions,
  meta,
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
      <SettingsBreadcrumbs />
      <PageHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
        {...(actions ? { actions } : {})}
        {...(meta ? { meta } : {})}
      />
      <SettingsRail />
      <div className="administration-content">{children}</div>
    </AppShell>
  );
}

/** Re-exported so a moved page changes one import line, not two. */
export function LoadFailure({ reason, subject }: { reason: string; subject: string }) {
  return <ErrorState title={`${subject} could not be loaded`} detail={reason} />;
}
