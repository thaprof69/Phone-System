import { Breadcrumbs, NavList, PageHeading } from '@quantum-parks/ui';
import { AppShell } from '../shell';
import { DOMAINS } from '../navigation';

const administration = DOMAINS.find((domain) => domain.key === 'administration');

/**
 * Administration frame.
 *
 * Administration has enough areas that a horizontal tab strip would wrap badly, so it
 * uses a vertical rail. The items come from the same navigation declaration as every
 * other domain — this is presentation, not a second navigation system.
 */
export function AdministrationShell({
  children,
  current,
  title,
  description,
  eyebrow = 'Administration',
  actions,
  meta,
}: {
  children: React.ReactNode;
  /** Href of the current administration area. */
  current: string;
  title: string;
  description: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  const areas = administration?.areas ?? [];
  const active = areas.find((area) => area.href === current);

  return (
    <AppShell>
      <Breadcrumbs
        trail={[
          { label: 'Administration', href: '/administration' },
          ...(active && active.href !== '/administration' ? [{ label: active.label }] : []),
        ]}
      />
      <PageHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
        {...(actions ? { actions } : {})}
        {...(meta ? { meta } : {})}
      />
      <div className="administration-layout">
        <div className="administration-rail">
          <NavList
            label="Administration areas"
            current={current}
            items={areas.map((area) => ({ href: area.href, label: area.label }))}
          />
        </div>
        <div className="administration-content">{children}</div>
      </div>
    </AppShell>
  );
}
