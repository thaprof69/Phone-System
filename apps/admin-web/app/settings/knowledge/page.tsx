import { StatusPill } from '@quantum-parks/ui';
import { SettingsPage, LoadFailure } from '../settings-page';
import { apiGet } from '../../../lib/api';
import { KnowledgeHubConsole } from './knowledge-hub-console';

export const dynamic = 'force-dynamic';

type KnowledgeRecord = {
  id: string;
  title: string;
  language: string;
  state?: string;
  versionId?: string;
};

export default async function KnowledgeHubPage() {
  const response = await apiGet<{ items: KnowledgeRecord[] }>('/knowledge', {
    purpose: 'RELEASE_MANAGEMENT',
  });

  return (
    <SettingsPage
      eyebrow="Knowledge"
      title="Knowledge Hub"
      description="Ingest, structure, approve and test the company intelligence that feeds the receptionist."
      meta={
        <StatusPill tone={response.ok ? 'good' : 'warning'}>
          {response.ok ? `${response.data.items.length} local assets` : 'Local service unavailable'}
        </StatusPill>
      }
    >
      {!response.ok ? (
        <div className="knowledge-load-state">
          <LoadFailure subject="Approved knowledge" reason={response.reason} />
        </div>
      ) : null}
      <KnowledgeHubConsole
        records={response.ok ? response.data.items : []}
        unavailableReason={response.ok ? null : response.reason}
      />
    </SettingsPage>
  );
}
