import { CallStateView } from '../call-views';

export const dynamic = 'force-dynamic';

export default async function LiveActivityPage() {
  return (
    <CallStateView
      title="Live activity"
      description="Calls still in flight: enrichment has not finished. The transcript is authoritative; the summary, classification or outcome may be missing."
      states={['PARTIAL', 'SUMMARIZING', 'CLASSIFYING', 'LINKING', 'NORMALIZING', 'REDACTED']}
      emptyTitle="Nothing is part-processed"
      emptyDetail="Every ingested call has completed its post-call workflow."
      banner={{
        tone: 'warning',
        title: 'These calls have incomplete intelligence',
        body: 'Enrichment failing does not lose evidence. Transcripts and deterministic outcomes are unaffected and the work can be replayed.',
      }}
    />
  );
}
