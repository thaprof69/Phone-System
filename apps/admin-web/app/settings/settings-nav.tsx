'use client';

import { usePathname } from 'next/navigation';
import { Breadcrumbs, NavList } from '@quantum-parks/ui';
import { SETTINGS_GROUPS, settingsAreaForPath, settingsGroupForPath } from '../navigation';

/**
 * Settings has too many areas across too many groups for one global tab bar, so
 * each group gets a dedicated horizontal submenu below the page heading. Both
 * breadcrumbs and submenu derive the active group/area from the pathname.
 */
export function SettingsBreadcrumbs() {
  const pathname = usePathname() ?? '/settings';
  const group = settingsGroupForPath(pathname) ?? SETTINGS_GROUPS[0];
  const area = settingsAreaForPath(group, pathname);
  return (
    <Breadcrumbs
      trail={[
        { label: 'Settings', href: '/settings' },
        { label: group.label, href: group.href },
        ...(area && area.href !== group.href ? [{ label: area.label }] : []),
      ]}
    />
  );
}

export function SettingsRail() {
  const pathname = usePathname() ?? '/settings';
  const group = settingsGroupForPath(pathname) ?? SETTINGS_GROUPS[0];
  const area = settingsAreaForPath(group, pathname);
  return (
    <section className="settings-submenu" aria-labelledby="settings-submenu-title">
      <div className="settings-submenu-heading">
        <span>Section menu</span>
        <strong id="settings-submenu-title">{group.label}</strong>
      </div>
      <NavList
        label={`${group.label} areas`}
        current={area?.href ?? group.areas[0]?.href ?? ''}
        items={group.areas.map((entry) => ({ href: entry.href, label: entry.label }))}
      />
    </section>
  );
}
