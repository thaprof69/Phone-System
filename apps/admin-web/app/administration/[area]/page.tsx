import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, ShieldAlert } from 'lucide-react';
import { StatusPill } from '@quantum-parks/ui';
import { apiGet } from '../../../lib/api';
import { AdministrationShell, ConfigurationPlaceholder } from '../admin-shell';

const areas = {
  security: ['Security', 'Identity, roles, service access, credential boundaries, and controls.'],
  integrations: [
    'Integrations',
    'Provider, customer, booking, support, messaging, and business-system connections.',
  ],
  audit: ['Audit', 'Tamper-evident lifecycle, configuration, access, and operational activity.'],
  release: ['Release', 'Approvals, evidence, rollout, rollback, and production-routing decisions.'],
} as const;

export default async function AdministrationAreaPage({
  params,
}: {
  params: Promise<{ area: string }>;
}) {
  const { area } = await params;
  if (area === 'readiness') {
    const readiness = await apiGet<{
      state: string;
      blockers: string[];
      domains?: { voiceRuntime?: string; aios?: string; platform?: string };
    }>('/readiness');
    return (
      <AdministrationShell
        area="Readiness"
        title="Readiness"
        description="Review independent server-computed Voice Runtime, AI Intelligence, and Platform decisions."
      >
        <section className="panel">
          <header className="panel-header">
            <div>
              <p className="eyebrow">Server-computed platform gate</p>
              <h2>Current decision</h2>
            </div>
            <StatusPill tone="warning">
              {readiness.ok ? readiness.data.state : 'UNAVAILABLE'}
            </StatusPill>
          </header>
          <div className="gate-list">
            {(readiness.ok ? readiness.data.blockers : ['READINESS_SERVICE_UNAVAILABLE']).map(
              (blocker) => (
                <div className="gate" key={blocker}>
                  <div className="gate-icon danger">
                    <ShieldAlert />
                  </div>
                  <div>
                    <strong>{blocker.replaceAll('_', ' ')}</strong>
                    <p>Production routing remains blocked until this evidence is satisfied.</p>
                  </div>
                  <StatusPill tone="danger">Blocked</StatusPill>
                </div>
              ),
            )}
          </div>
        </section>
        <div className="heading-actions admin-follow-links">
          <Link className="button secondary" href="/administration/settings/voice-runtime">
            Voice Runtime <ArrowRight size={14} />
          </Link>
          <Link className="button secondary" href="/administration/settings/ai-intelligence">
            AI Intelligence <ArrowRight size={14} />
          </Link>
        </div>
      </AdministrationShell>
    );
  }
  const item = areas[area as keyof typeof areas];
  if (!item) notFound();
  return (
    <AdministrationShell area={item[0]} title={item[0]} description={item[1]}>
      <ConfigurationPlaceholder title={item[0]} description={item[1]} />
    </AdministrationShell>
  );
}
