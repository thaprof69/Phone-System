import Link from 'next/link';
import { DataTable, StatusPill, formatDateTime, toneForState } from '@quantum-parks/ui';
import { SettingsPage } from '../../../settings-page';
import { apiGet } from '../../../../../lib/api';

export const dynamic = 'force-dynamic';

type DiagnosticRun = {
  id: string;
  status: 'PASS' | 'WARNING' | 'FAIL' | 'NOT_CONFIGURED';
  checks: Array<{
    key: string;
    label: string;
    status: 'PASS' | 'WARNING' | 'FAIL';
    detail: string;
  }>;
  warnings: string[];
  errors: string[];
  checkedAt: string;
  checkedBy: string;
};

export default async function ElevenLabsDiagnosticsHistoryPage() {
  const response = await apiGet<DiagnosticRun[]>('/admin/integrations/elevenlabs/diagnostics', {
    purpose: 'RELEASE_MANAGEMENT',
  });
  const runs = response.ok ? response.data : [];

  return (
    <SettingsPage
      eyebrow="AI Providers"
      title="ElevenLabs diagnostics history"
      description="Every diagnostics run persisted, most recent first. Each check was a real round trip against the provider at the time it ran, or an honest static note where the provider API doesn't expose the fact."
      actions={
        <Link className="button ghost small" href="/settings/ai-providers/elevenlabs">
          Back to ElevenLabs
        </Link>
      }
    >
      <DataTable
        caption="ElevenLabs diagnostics runs"
        rows={runs}
        getRowKey={(row) => row.id}
        empty={<p className="panel-description">No diagnostics runs yet.</p>}
        columns={[
          {
            key: 'checkedAt',
            header: 'Checked',
            render: (row) => formatDateTime(row.checkedAt),
          },
          {
            key: 'status',
            header: 'Status',
            render: (row) => <StatusPill tone={toneForState(row.status)}>{row.status}</StatusPill>,
          },
          {
            key: 'warnings',
            header: 'Warnings',
            render: (row) => String(row.warnings.length),
            align: 'end',
          },
          {
            key: 'errors',
            header: 'Errors',
            render: (row) => String(row.errors.length),
            align: 'end',
          },
          {
            key: 'checkedBy',
            header: 'Checked by',
            render: (row) => row.checkedBy,
            priority: 'secondary',
          },
        ]}
      />
    </SettingsPage>
  );
}
