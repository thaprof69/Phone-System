import { Panel } from '@quantum-parks/ui';
import { SettingsPage as DomainPage, LoadFailure } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import { SessionRows, type ReceptionistSessionRow } from '../session-rows';

export const dynamic = 'force-dynamic';

export default async function ReceptionistSessionsPage() {
  const response = await apiGet<ReceptionistSessionRow[]>('/receptionist-sessions', {
    purpose: 'QUALITY_REVIEW',
  });

  const eyebrow = 'Simulation Lab';
  const title = 'Sessions';
  const description = 'Every live receptionist test session, most recent first.';

  if (!response.ok) {
    return (
      <DomainPage eyebrow={eyebrow} title={title} description={description}>
        <LoadFailure subject="Receptionist sessions" reason={response.reason} />
      </DomainPage>
    );
  }

  return (
    <DomainPage eyebrow={eyebrow} title={title} description={description}>
      <Panel title="All sessions" eyebrow={`${response.data.length} sessions`}>
        <SessionRows sessions={response.data} />
      </Panel>
    </DomainPage>
  );
}
