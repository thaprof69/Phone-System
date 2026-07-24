'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Bot,
  ChartNoAxesCombined,
  ClipboardCheck,
  Gauge,
  Library,
  Menu,
  Settings,
  ShieldCheck,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { DOMAINS, areaForPath, domainForPath } from './navigation';

const ICONS: Record<string, LucideIcon> = {
  Gauge,
  Bot,
  Library,
  ClipboardCheck,
  Activity,
  Workflow,
  ChartNoAxesCombined,
  Settings,
};

/**
 * The application frame.
 *
 * Active state is derived from the current pathname rather than from a label string
 * passed down by each page, so a page can never disagree with the navigation about
 * where the user is.
 */
export function AppShell({
  children,
  environmentLabel = 'Development · simulator',
}: {
  children: React.ReactNode;
  environmentLabel?: string;
}) {
  const pathname = usePathname() ?? '/';
  const activeDomain = domainForPath(pathname);
  const activeArea = areaForPath(activeDomain, pathname);

  const links = DOMAINS.map((domain) => {
    const Icon = ICONS[domain.icon] ?? Gauge;
    const active = domain.key === activeDomain.key;
    return (
      <Link
        key={domain.key}
        href={domain.href}
        className={active ? 'nav-link active' : 'nav-link'}
        {...(active ? { 'aria-current': 'page' as const } : {})}
      >
        <Icon size={18} aria-hidden="true" />
        <span>{domain.label}</span>
      </Link>
    );
  });

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Quantum Parks operations home">
          <span className="brand-mark">QP</span>
          <span>
            Quantum Parks<small>Voice operations</small>
          </span>
        </Link>
        <nav aria-label="Primary navigation">{links}</nav>
        <div className="side-status">
          <div>
            <ShieldCheck size={17} aria-hidden="true" />
            <strong>Live voice runtime</strong>
          </div>
          <p>ElevenLabs answers the calls</p>
          <span>Quantum Parks holds the approved configuration</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <details className="mobile-navigation">
            <summary className="mobile-menu" aria-label="Open navigation">
              <Menu size={20} />
            </summary>
            <nav className="mobile-nav-panel" aria-label="Mobile primary navigation">
              {links}
            </nav>
          </details>
          <div className="environment">
            <span aria-hidden="true" /> {environmentLabel}
          </div>
          <div className="top-actions">
            <div className="user">
              <span>QP</span>
              <div>
                <strong>Authenticated user</strong>
                <small>{activeArea ? activeArea.label : activeDomain.label}</small>
              </div>
            </div>
          </div>
        </header>
        <main id="main">{children}</main>
      </div>
    </div>
  );
}
