import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Banner, StatusPill, humaniseState } from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../../domain-page';
import {
  ReceptionistSessionEvidence,
  loadReceptionistSession,
} from '../../receptionist-session-detail';

export const dynamic = 'force-dynamic';

export default async function ChatSessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const response = await loadReceptionistSession(sessionId);
  const description =
    'Captured transcript, conversation evidence and the policy and routing decisions derived from it.';

  if (!response.ok) {
    return (
      <DomainPage eyebrow="Chat record" title="Chat detail" description={description}>
        <LoadFailure subject="Chat session" reason={response.reason} />
      </DomainPage>
    );
  }

  if (!response.data) {
    return (
      <DomainPage eyebrow="Chat record" title="Chat detail" description={description}>
        <Banner tone="danger" title="Chat not found">
          This chat session no longer exists. <Link href="/chat">Back to chats</Link>
        </Banner>
      </DomainPage>
    );
  }

  const { session } = response.data;

  return (
    <DomainPage
      eyebrow="Chat record"
      title={session.label}
      description={description}
      meta={
        <StatusPill tone={session.status === 'ACTIVE' ? 'warning' : 'neutral'}>
          {humaniseState(session.status)}
        </StatusPill>
      }
      actions={
        <Link className="button secondary" href="/chat">
          <ArrowLeft aria-hidden="true" size={16} />
          Back to chats
        </Link>
      }
    >
      <ReceptionistSessionEvidence detail={response.data} userLabel="Visitor" />
    </DomainPage>
  );
}
