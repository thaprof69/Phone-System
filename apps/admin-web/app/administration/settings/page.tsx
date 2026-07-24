import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { AdministrationShell } from '../admin-shell';

const settings = [
  ['General', 'Environment identity and organisation-level defaults.', 'general'],
  ['Voice Runtime', 'ElevenLabs connection and governed runtime configuration.', 'voice-runtime'],
  [
    'AI Intelligence',
    'Quantum Parks AIOS capabilities, execution, and governance.',
    'ai-intelligence',
  ],
  ['Knowledge', 'Knowledge lifecycle and publication controls.', 'knowledge'],
  ['Policies', 'Disclosure, retention, privacy, and business policies.', 'policies'],
  ['Feature Flags', 'Governed availability and emergency-disable controls.', 'feature-flags'],
] as const;

export default function SettingsPage() {
  return (
    <AdministrationShell
      area="Settings"
      title="Settings"
      description="Manage authoritative application configuration without deployment-time environment edits."
    >
      <div className="settings-card-grid">
        {settings.map(([label, detail, slug]) => (
          <Link className="settings-card" href={`/administration/settings/${slug}`} key={slug}>
            <span>{label}</span>
            <p>{detail}</p>
            <strong>
              Open settings <ArrowRight size={14} />
            </strong>
          </Link>
        ))}
      </div>
    </AdministrationShell>
  );
}
