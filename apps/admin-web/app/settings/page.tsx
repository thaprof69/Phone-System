import Link from 'next/link';
import { PageHeading } from '@quantum-parks/ui';
import { AppShell } from '../shell';
import { SETTINGS_GROUPS } from '../navigation';

export default function SettingsLandingPage() {
  return (
    <AppShell>
      <PageHeading
        eyebrow="Settings"
        title="Settings"
        description="Everything used to configure and govern the receptionist, grouped by what it controls."
      />
      <div className="settings-groups">
        {SETTINGS_GROUPS.map((group) => (
          <Link key={group.key} href={group.href} className="settings-group-card">
            <strong>{group.label}</strong>
            <p>{group.description}</p>
            <ul>
              {group.areas.slice(0, 4).map((area) => (
                <li key={area.href}>{area.label}</li>
              ))}
            </ul>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
