'use client';

import { usePathname } from 'next/navigation';
import { RouteTabs } from '@quantum-parks/ui';
import { areaForPath, domainForPath } from './navigation';

/**
 * Sub-navigation for the current product domain.
 *
 * These are links to distinct routes, so they render as a navigation landmark with
 * `aria-current` rather than an ARIA tablist — see the note on `RouteTabs`.
 */
export function DomainNav({ badges = {} }: { badges?: Record<string, number> }) {
  const pathname = usePathname() ?? '/';
  const domain = domainForPath(pathname);
  const area = areaForPath(domain, pathname);
  if (domain.areas.length < 2) return null;

  return (
    <RouteTabs
      label={`${domain.label} areas`}
      current={area?.href ?? domain.areas[0]?.href ?? ''}
      items={domain.areas.map((entry) => {
        const badge = badges[entry.href];
        return { href: entry.href, label: entry.label, ...(badge !== undefined ? { badge } : {}) };
      })}
    />
  );
}
