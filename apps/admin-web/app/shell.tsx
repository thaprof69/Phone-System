import Link from 'next/link';
import {
  Activity,
  BookOpenText,
  Bot,
  ChartNoAxesCombined,
  ClipboardCheck,
  FileChartColumn,
  Gauge,
  Headphones,
  Library,
  Menu,
  Settings,
  ShieldCheck,
  Workflow,
} from 'lucide-react';

const navigation = [
  { href: '/', label: 'Overview', icon: Gauge },
  { href: '/agent-studio', label: 'Agent Studio', icon: Bot },
  { href: '/knowledge', label: 'Knowledge Hub', icon: Library },
  { href: '/voices', label: 'Voice Library', icon: Headphones },
  { href: '/tests', label: 'Test Studio', icon: ClipboardCheck },
  { href: '/calls', label: 'Calls', icon: Activity },
  { href: '/operations', label: 'Operations', icon: Workflow },
  { href: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
  { href: '/reports', label: 'Reports', icon: FileChartColumn },
  { href: '/administration', label: 'Administration', icon: Settings },
] as const;

export function AppShell({
  children,
  active = 'Overview',
}: {
  children: React.ReactNode;
  active?: string;
}) {
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
        <nav aria-label="Primary navigation">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={active === label ? 'nav-link active' : 'nav-link'}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="side-status">
          <div>
            <ShieldCheck size={17} aria-hidden="true" />
            <strong>Control plane</strong>
          </div>
          <p>Quantum Parks is authoritative</p>
          <span>ElevenLabs runtime mapped</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <details className="mobile-navigation">
            <summary className="mobile-menu" aria-label="Open navigation">
              <Menu size={20} />
            </summary>
            <nav className="mobile-nav-panel" aria-label="Mobile primary navigation">
              {navigation.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className="nav-link">
                  <Icon size={18} aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          </details>
          <div className="environment">
            <span aria-hidden="true" /> Governed control plane
          </div>
          <div className="top-actions">
            <div className="user">
              <span>QP</span>
              <div>
                <strong>Authenticated user</strong>
                <small>Role enforced by OIDC</small>
              </div>
            </div>
          </div>
        </header>
        <main id="main">{children}</main>
      </div>
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="heading-actions">{actions}</div> : null}
    </header>
  );
}
