import Link from 'next/link';
import { CardGrid, Panel, StatusPill, humaniseState, toneForState } from '@quantum-parks/ui';
import { apiGet } from '../../../lib/api';
import { SettingsPage } from '../settings-page';
import { SETTINGS_GROUPS } from '../../navigation';

export const dynamic = 'force-dynamic';

type Readiness = { state: string; blockers: string[] };
type VoiceStatus = { status: string; productionRoutingEnabled: boolean };
type AIWorkspace = {
  overview: {
    readiness: { status: string; blockers: Array<{ code: string; description: string }> };
  };
};

const administration = SETTINGS_GROUPS.find((group) => group.key === 'administration');

export default async function AdministrationPage() {
  const [platform, voice, ai] = await Promise.all([
    apiGet<Readiness>('/readiness', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<VoiceStatus>('/admin/integrations/elevenlabs/status', {
      purpose: 'RELEASE_MANAGEMENT',
    }),
    apiGet<AIWorkspace>('/admin/ai/workspace', { purpose: 'RELEASE_MANAGEMENT' }),
  ]);

  // The three readiness domains are deliberately reported separately. A single
  // combined score would hide which one is actually blocking production.
  const domains = [
    {
      label: 'Voice runtime',
      status: voice.ok ? voice.data.status : 'UNAVAILABLE',
      detail: 'The ElevenLabs connection, its capabilities, health and drift.',
      href: '/settings/ai-providers/elevenlabs',
    },
    {
      label: 'AI routing',
      status: ai.ok ? ai.data.overview.readiness.status : 'UNAVAILABLE',
      detail: 'Providers, models, capability routing, prompts, budgets and execution evidence.',
      href: '/settings/ai-routing',
    },
    {
      label: 'Platform',
      status: platform.ok ? platform.data.state : 'UNAVAILABLE',
      detail: 'Approvals, tests, privacy, retention and identity gates.',
      href: '/settings/administration/readiness',
    },
  ];

  const areas = (administration?.areas ?? []).filter(
    (area) => area.href !== '/settings/administration',
  );

  return (
    <SettingsPage
      eyebrow="Administration"
      title="Overview"
      description="Configure the platform, inspect each readiness domain independently, govern access and control releases."
    >
      <Panel
        title="Readiness by domain"
        eyebrow="Reported separately, never combined into one score"
      >
        <div className="readiness-domain-grid">
          {domains.map((domain) => (
            <Link className="readiness-domain-card" href={domain.href} key={domain.label}>
              <div>
                <strong>{domain.label}</strong>
                <StatusPill tone={toneForState(domain.status)}>
                  {humaniseState(domain.status)}
                </StatusPill>
              </div>
              <p>{domain.detail}</p>
            </Link>
          ))}
        </div>
      </Panel>

      <Panel title="All administration areas" eyebrow="Jump to a control">
        <CardGrid columns={3}>
          {areas.map((area) => (
            <Link className="area-card" href={area.href} key={area.href}>
              <strong>{area.label}</strong>
              <span>{area.description}</span>
            </Link>
          ))}
        </CardGrid>
      </Panel>
    </SettingsPage>
  );
}
