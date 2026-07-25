'use client';

import { usePathname } from 'next/navigation';
import { Breadcrumbs, NavList } from '@quantum-parks/ui';
import { SETTINGS_GROUPS, settingsAreaForPath, settingsGroupForPath } from '../navigation';

/**
 * Settings has too many areas across too many groups for a horizontal tab bar
 * (see navigation.ts) — each group gets a vertical rail instead, and the
 * breadcrumb carries the group context a flat tab strip would otherwise lose.
 * Both derive the active group/area from the pathname, the same way `DomainNav`
 * does for the other four domains, so a moved page never has to pass its own
 * location down by hand.
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
    <NavList
      label={`${group.label} areas`}
      current={area?.href ?? group.areas[0]?.href ?? ''}
      items={group.areas.map((entry) => ({ href: entry.href, label: entry.label }))}
    />
  );
}
