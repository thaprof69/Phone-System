import Link from 'next/link';
import { Banner, StatusPill, humaniseState } from '@quantum-parks/ui';
import { SettingsPage as DomainPage, LoadFailure } from '../../../settings-page';
import {
  ReceptionistSessionEvidence,
  loadReceptionistSession,
} from '../../../../receptionist-session-detail';

export const dynamic = 'force-dynamic';

export default async function ReceptionistSessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const response = await loadReceptionistSession(sessionId);

  const eyebrow = 'Simulation Lab';
  const title = 'Session detail';
  const description =
    'Transcript, evidence and the deterministic policy and routing decisions derived from it.';

  if (!response.ok) {
    return (
      <DomainPage eyebrow={eyebrow} title={title} description={description}>
        <LoadFailure subject="Receptionist session" reason={response.reason} />
      </DomainPage>
    );
  }

  if (!response.data) {
    return (
      <DomainPage eyebrow={eyebrow} title={title} description={description}>
        <Banner tone="danger" title="Session not found">
          This receptionist session no longer exists.{' '}
          <Link href="/settings/simulation/sessions">Back to sessions</Link>
        </Banner>
      </DomainPage>
    );
  }

  const { session } = response.data;

  return (
    <DomainPage
      eyebrow={eyebrow}
      title={session.label}
      description={description}
      meta={
        <StatusPill tone={session.status === 'ACTIVE' ? 'warning' : 'neutral'}>
          {humaniseState(session.status)}
        </StatusPill>
      }
    >
      <ReceptionistSessionEvidence detail={response.data} userLabel="Caller" />
    </DomainPage>
  );
}
