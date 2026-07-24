import Link from 'next/link';
import { ArrowRight, Bot, Gauge, PlugZap, Settings, ShieldCheck, Volume2 } from 'lucide-react';
import { StatusPill } from '@quantum-parks/ui';
import { apiGet } from '../../lib/api';
import { AdministrationShell } from './admin-shell';

type Readiness = { state: string; blockers: string[] };
type VoiceStatus = { status: string; productionRoutingEnabled: boolean };
type AIWorkspace = {
  overview: {
    readiness: { status: string; blockers: Array<{ code: string; description: string }> };
  };
};

export default async function AdministrationPage() {
  const [platform, voice, ai] = await Promise.all([
    apiGet<Readiness>('/readiness'),
    apiGet<VoiceStatus>('/admin/integrations/elevenlabs/status'),
    apiGet<AIWorkspace>('/admin/ai/workspace'),
  ]);
  const cards = [
    {
      label: 'Voice Runtime',
      status: voice.ok ? voice.data.status : 'UNAVAILABLE',
      detail: 'ElevenLabs connectivity, releases, tests, drift, telephony, and approvals.',
      href: '/administration/settings/voice-runtime',
      icon: Volume2,
    },
    {
      label: 'AI Intelligence',
      status: ai.ok ? ai.data.overview.readiness.status : 'UNAVAILABLE',
      detail: 'Providers, capabilities, execution, governance, cost, health, and evidence.',
      href: '/administration/settings/ai-intelligence',
      icon: Bot,
    },
    {
      label: 'Platform',
      status: platform.ok ? platform.data.state : 'UNAVAILABLE',
      detail: 'Legal, identity, integration, operational, and final production controls.',
      href: '/administration/readiness',
      icon: Gauge,
    },
  ];
  return (
    <AdministrationShell
      title="Administration"
      description="Configure the platform, inspect independent readiness domains, govern access, and control releases."
    >
      <div className="readiness-domain-grid">
        {cards.map(({ label, status, detail, href, icon: Icon }) => (
          <article className="readiness-domain-card" key={label}>
            <div className="provider-card-heading">
              <Icon size={20} />
              <StatusPill
                tone={
                  status === 'CONNECTED' || status === 'PRODUCTION_APPROVED' ? 'good' : 'warning'
                }
              >
                {status}
              </StatusPill>
            </div>
            <h2>{label}</h2>
            <p>{detail}</p>
            <Link className="text-link" href={href}>
              Open {label} <ArrowRight size={14} />
            </Link>
          </article>
        ))}
      </div>
      <div className="admin-grid">
        <section className="panel">
          <header className="panel-header">
            <div>
              <p className="eyebrow">Configuration</p>
              <h2>Settings</h2>
            </div>
            <Settings />
          </header>
          <div className="decision-card">
            <p>Manage voice, AI, knowledge, policies, and feature flags in one hierarchy.</p>
            <Link className="button secondary" href="/administration/settings">
              Open settings
            </Link>
          </div>
        </section>
        <section className="panel">
          <header className="panel-header">
            <div>
              <p className="eyebrow">No false completion</p>
              <h2>Production routing</h2>
            </div>
            <ShieldCheck />
          </header>
          <div className="decision-card">
            <StatusPill tone="warning">
              {voice.ok && voice.data.productionRoutingEnabled
                ? 'SERVER DECISION REQUIRED'
                : 'BLOCKED'}
            </StatusPill>
            <p>Connecting either provider never activates production.</p>
            <Link className="button secondary" href="/administration/release">
              View release controls
            </Link>
          </div>
        </section>
      </div>
      {!platform.ok || !voice.ok || !ai.ok ? (
        <div className="notice warning" role="status">
          <PlugZap />
          <div>
            <strong>One or more administration read models are unavailable</strong>
            <p>No readiness claim is made for an unavailable domain.</p>
          </div>
        </div>
      ) : null}
    </AdministrationShell>
  );
}
