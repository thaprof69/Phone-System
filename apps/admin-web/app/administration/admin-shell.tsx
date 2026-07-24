import Link from 'next/link';
import {
  Bot,
  BookOpenText,
  CheckCircle2,
  FileClock,
  Flag,
  Gauge,
  KeyRound,
  LockKeyhole,
  PlugZap,
  Settings,
  ShieldCheck,
  Tags,
  Volume2,
} from 'lucide-react';
import { AppShell, PageHeading } from '../shell';

const administrationAreas = [
  { href: '/administration/settings', label: 'Settings', icon: Settings },
  { href: '/administration/readiness', label: 'Readiness', icon: Gauge },
  { href: '/administration/security', label: 'Security', icon: LockKeyhole },
  { href: '/administration/integrations', label: 'Integrations', icon: PlugZap },
  { href: '/administration/audit', label: 'Audit', icon: FileClock },
  { href: '/administration/release', label: 'Release', icon: CheckCircle2 },
] as const;

const settingsAreas = [
  { href: '/administration/settings/general', label: 'General', icon: Settings },
  {
    href: '/administration/settings/voice-runtime',
    label: 'Voice Runtime',
    icon: Volume2,
  },
  {
    href: '/administration/settings/ai-intelligence',
    label: 'AI Intelligence',
    icon: Bot,
  },
  { href: '/administration/settings/knowledge', label: 'Knowledge', icon: BookOpenText },
  { href: '/administration/settings/policies', label: 'Policies', icon: ShieldCheck },
  { href: '/administration/settings/feature-flags', label: 'Feature Flags', icon: Flag },
] as const;

export function AdministrationShell({
  children,
  area,
  setting,
  title,
  description,
  eyebrow = 'Administration',
  actions,
}: {
  children: React.ReactNode;
  area?: string;
  setting?: string;
  title: string;
  description: string;
  eyebrow?: string;
  actions?: React.ReactNode;
}) {
  return (
    <AppShell active="Administration">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href="/administration">Administration</Link>
        {area ? (
          <>
            <span aria-hidden="true">/</span>
            <span>{area}</span>
          </>
        ) : null}
        {setting ? (
          <>
            <span aria-hidden="true">/</span>
            <span>{setting}</span>
          </>
        ) : null}
      </nav>
      <PageHeading eyebrow={eyebrow} title={title} description={description} actions={actions} />
      <nav className="administration-nav" aria-label="Administration sections">
        {administrationAreas.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={area === label ? 'active' : undefined}
            aria-current={area === label ? 'page' : undefined}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>
      {area === 'Settings' ? (
        <nav className="settings-nav" aria-label="Administration settings">
          {settingsAreas.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={setting === label ? 'active' : undefined}
              aria-current={setting === label ? 'page' : undefined}
            >
              <Icon size={15} />
              {label}
            </Link>
          ))}
        </nav>
      ) : null}
      {children}
    </AppShell>
  );
}

export function ConfigurationPlaceholder({
  title,
  description,
  records = 0,
}: {
  title: string;
  description: string;
  records?: number;
}) {
  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Authoritative local configuration</p>
          <h2>{title}</h2>
        </div>
        <Tags />
      </header>
      <div className="empty-state">
        <strong>{records} governed records</strong>
        <p>{description}</p>
        <span className="capability-note">
          Changes require backend authorization and are recorded in audit history.
        </span>
      </div>
    </section>
  );
}
