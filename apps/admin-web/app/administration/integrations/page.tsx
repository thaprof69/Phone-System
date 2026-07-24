import Link from 'next/link';
import {
  DataTable,
  Panel,
  StatusPill,
  formatDateTime,
  humaniseState,
  toneForState,
  type Column,
} from '@quantum-parks/ui';
import { AdministrationShell } from '../admin-shell';
import { apiGet } from '../../../lib/api';

export const dynamic = 'force-dynamic';

type IntegrationStatus = { status: string; lastVerifiedAt?: string | null };
type AIWorkspace = {
  overview?: { readiness?: { status?: string } };
};

type IntegrationRow = {
  key: string;
  name: string;
  purpose: string;
  status: string;
  configured: boolean;
  lastVerifiedAt: string | null;
  href: string | null;
  note: string;
};

/**
 * Business integrations.
 *
 * Adapters that are not installed are reported as not installed. There is deliberately
 * no connect control for them: offering one would imply a capability the platform does
 * not have.
 */
export default async function IntegrationsPage() {
  const [voice, ai] = await Promise.all([
    apiGet<IntegrationStatus>('/admin/integrations/elevenlabs/status', {
      purpose: 'RELEASE_MANAGEMENT',
    }),
    apiGet<AIWorkspace>('/admin/ai/workspace', { purpose: 'RELEASE_MANAGEMENT' }),
  ]);

  const rows: IntegrationRow[] = [
    {
      key: 'elevenlabs',
      name: 'ElevenLabs',
      purpose: 'Live voice runtime: speech recognition, voice generation and the published agent.',
      status: voice.ok ? voice.data.status : 'UNAVAILABLE',
      configured: voice.ok && voice.data.status === 'CONNECTED',
      lastVerifiedAt: voice.ok ? (voice.data.lastVerifiedAt ?? null) : null,
      href: '/administration/voice-runtime',
      note: 'Required. The platform does not implement a voice runtime of its own.',
    },
    {
      key: 'ai',
      name: 'AI provider',
      purpose: 'Post-call enrichment: summaries, classification and gap detection.',
      status: ai.ok ? (ai.data.overview?.readiness?.status ?? 'NOT_CONFIGURED') : 'UNAVAILABLE',
      configured: ai.ok,
      lastVerifiedAt: null,
      href: '/administration/ai',
      note: 'Provider-neutral. Enrichment failing degrades a call to partial rather than losing it.',
    },
    {
      key: 'zendesk',
      name: 'Zendesk',
      purpose: 'Support ticket context and case creation.',
      status: 'NOT_CONFIGURED',
      configured: false,
      lastVerifiedAt: null,
      href: null,
      note: 'Adapter not installed. Support snapshots on calls are unpopulated.',
    },
    {
      key: 'booking',
      name: 'Booking system',
      purpose: 'Booking lookups and, once approved, capacity-affecting writes.',
      status: 'NOT_CONFIGURED',
      configured: false,
      lastVerifiedAt: null,
      href: null,
      note: 'Adapter not installed. Booking writes are separately gated even once it is.',
    },
    {
      key: 'customer',
      name: 'Customer system',
      purpose: 'Customer identification and contact preferences.',
      status: 'NOT_CONFIGURED',
      configured: false,
      lastVerifiedAt: null,
      href: null,
      note: 'Adapter not installed. Customer links are recorded but not resolved externally.',
    },
    {
      key: 'messaging',
      name: 'WhatsApp and SMS',
      purpose: 'Outbound links and confirmations after a call.',
      status: 'NOT_CONFIGURED',
      configured: false,
      lastVerifiedAt: null,
      href: '/operations/messages',
      note: 'Adapter not installed. Message records exist; delivery is simulated.',
    },
  ];

  const columns: Column<IntegrationRow>[] = [
    {
      key: 'name',
      header: 'Integration',
      render: (row) => (
        <>
          {row.name}
          <small className="cell-sub">{row.purpose}</small>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusPill tone={toneForState(row.status)}>{humaniseState(row.status)}</StatusPill>
      ),
    },
    {
      key: 'note',
      header: 'Coverage',
      render: (row) => row.note,
    },
    {
      key: 'verified',
      header: 'Last verified',
      render: (row) =>
        row.lastVerifiedAt ? (
          formatDateTime(row.lastVerifiedAt)
        ) : (
          <span className="muted-cell">Never</span>
        ),
      priority: 'secondary',
    },
    {
      key: 'action',
      header: 'Next step',
      render: (row) =>
        row.href ? (
          <Link className="row-link" href={row.href}>
            Open
          </Link>
        ) : (
          <span className="muted-cell">Adapter not installed</span>
        ),
    },
  ];

  return (
    <AdministrationShell
      current="/administration/integrations"
      title="Business integrations"
      description="External systems the receptionist can draw on, and how much of each is actually installed."
    >
      <Panel
        title="Integrations"
        eyebrow="Honest coverage"
        description="An adapter that is not installed shows no connect control. Offering one would imply a capability that does not exist."
      >
        <DataTable
          caption="Integrations with their status, coverage and next step"
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.key}
        />
      </Panel>
    </AdministrationShell>
  );
}
