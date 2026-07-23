import { ChevronLeft, LockKeyhole } from 'lucide-react';
import Link from 'next/link';
import { EmptyState, Panel, StatusPill } from '@quantum-parks/ui';
import { apiGet } from '../../../lib/api';
import { AppShell, PageHeading } from '../../shell';

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const call = await apiGet<Record<string, unknown>>(`/calls/${encodeURIComponent(id)}`);
  return (
    <AppShell active="Calls">
      <Link href="/calls" className="back-link">
        <ChevronLeft size={16} />
        Back to calls
      </Link>
      <PageHeading
        eyebrow="Canonical call record"
        title={`Call ${id.slice(0, 8)}`}
        description="Provider evidence, canonical records, intelligence, outcomes, and corrections remain independently versioned."
        actions={
          <StatusPill tone={call.ok ? 'info' : 'warning'}>
            {call.ok ? String(call.data.processingState ?? 'RAW STORED') : 'UNAVAILABLE'}
          </StatusPill>
        }
      />
      <div className="call-layout">
        <Panel title="Redacted canonical transcript" eyebrow="Authoritative review view">
          <EmptyState
            title="Transcript is not available"
            detail="The redacted revision will appear after the durable worker completes normalization. Raw evidence requires a restricted purpose grant."
          />
        </Panel>
        <Panel title="Call intelligence" eyebrow="Quantum Parks owned">
          <div className="restricted-note">
            <LockKeyhole size={20} />
            <div>
              <strong>No generated claims shown</strong>
              <p>
                Summary and classification can be delayed without affecting the call record.
                Outcomes require trusted events.
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
