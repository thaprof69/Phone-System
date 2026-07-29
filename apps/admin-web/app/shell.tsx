'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BellRing,
  ChartNoAxesCombined,
  FileText,
  Gauge,
  Menu,
  MessageSquare,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { DOMAINS, domainForPath } from './navigation';
import { ThemeToggle } from './theme-toggle';
import { LiveCallBanner } from './live-call-banner';

const ICONS: Record<string, LucideIcon> = {
  Gauge,
  Activity,
  MessageSquare,
  BellRing,
  ChartNoAxesCombined,
  FileText,
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
  environmentLabel = 'Development · live ElevenLabs',
}: {
  children: React.ReactNode;
  environmentLabel?: string;
}) {
  const pathname = usePathname() ?? '/';
  const activeDomain = domainForPath(pathname);

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
          <Image
            className="brand-logo"
            src="/brand/quantum-logo.png"
            alt=""
            width={42}
            height={42}
            priority
          />
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
        <div className="workspace-chrome">
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
              <ThemeToggle />
              <Link className="header-logo" href="/" aria-label="Quantum Parks operations home">
                <Image
                  className="user-logo"
                  src="/brand/quantum-logo.png"
                  alt=""
                  width={30}
                  height={30}
                />
              </Link>
            </div>
          </header>
          <LiveCallBanner />
        </div>
        <main id="main">{children}</main>
      </div>
    </div>
  );
}
