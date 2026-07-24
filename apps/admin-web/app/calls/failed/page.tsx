import { CallStateView } from '../call-views';

export const dynamic = 'force-dynamic';

export default async function FailedIngestionPage() {
  return (
    <CallStateView
      title="Failed ingestion"
      description="Calls that failed to process and need replay, retry or provider import."
      states={['FAILED_RETRYABLE', 'FAILED_FINAL']}
      emptyTitle="No failed ingestion"
      emptyDetail="Every webhook the platform received has been processed to completion."
      banner={{
        tone: 'danger',
        title: 'These calls have no usable record',
        body: 'Raw provider evidence was stored before the failure, so replay can recover them without contacting the provider again.',
      }}
    />
  );
}
