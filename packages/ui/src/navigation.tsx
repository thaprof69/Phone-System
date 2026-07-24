import type { ReactNode } from 'react';

export type RouteTabItem = {
  href: string;
  label: string;
  /** Optional count or status shown beside the label. */
  badge?: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
};

/**
 * Tabs whose panels are separate routes.
 *
 * These are deliberately a navigation landmark of links with `aria-current`, not an
 * ARIA `tablist`. `role="tab"` promises that the tab controls a panel in the same
 * document; when activating the control navigates to a new URL that promise is false
 * and screen-reader users are misled. Genuine in-page switching uses `Tabs` from
 * `interactive.tsx` instead.
 */
export function RouteTabs({
  items,
  current,
  label,
}: {
  items: readonly RouteTabItem[];
  /** The href of the active tab. */
  current: string;
  label: string;
}) {
  return (
    <nav className="route-tabs" aria-label={label}>
      <ul>
        {items.map((item) => {
          const active = item.href === current;
          if (item.disabled) {
            return (
              <li key={item.href}>
                <span
                  className="route-tab disabled"
                  aria-disabled="true"
                  {...(item.disabledReason ? { title: item.disabledReason } : {})}
                >
                  {item.label}
                  {item.badge !== undefined ? (
                    <span className="route-tab-badge">{item.badge}</span>
                  ) : null}
                </span>
              </li>
            );
          }
          return (
            <li key={item.href}>
              <a
                className={active ? 'route-tab active' : 'route-tab'}
                href={item.href}
                {...(active ? { 'aria-current': 'page' as const } : {})}
              >
                {item.label}
                {item.badge !== undefined ? (
                  <span className="route-tab-badge">{item.badge}</span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export type NavItem = {
  href: string;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
};

/** Vertical navigation used by section rails such as Administration. */
export function NavList({
  items,
  current,
  label,
}: {
  items: readonly NavItem[];
  current: string;
  label: string;
}) {
  return (
    <nav className="nav-list" aria-label={label}>
      <ul>
        {items.map((item) => {
          const active = item.href === current;
          return (
            <li key={item.href}>
              <a
                className={active ? 'nav-list-link active' : 'nav-list-link'}
                href={item.href}
                {...(active ? { 'aria-current': 'page' as const } : {})}
              >
                {item.icon ? (
                  <span className="nav-list-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                ) : null}
                <span>{item.label}</span>
                {item.badge !== undefined ? (
                  <span className="nav-list-badge">{item.badge}</span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
