import type { PostCallActivities } from './index.js';

export type FinalisationStageKind = 'DETERMINISTIC' | 'AI_CAPABILITY';

/**
 * One entry in the conversation finalisation pipeline. Adding a future capability (Quality,
 * Knowledge Gap, Compliance, Customer Effort, Follow-up, etc.) means writing one activity
 * function with the shared `FinalisationActivity` shape below, adding it to `PostCallActivities`,
 * and appending one entry here — `postCallWorkflow` never needs to change.
 *
 * This is deliberately static, versioned TypeScript data (safe for Temporal replay), not a
 * dynamic/DB-driven pipeline: a runtime stage lookup or admin-editable stage list would fight
 * Temporal's determinism model.
 */
export interface FinalisationStage {
  key: string;
  activityName: keyof PostCallActivities;
  kind: FinalisationStageKind;
  requiresTranscriptState: 'NONE' | 'REDACTED';
  blocking: boolean;
  outputArtifactTable: string;
  retryPolicy: { maximumAttempts: number };
}

export const CONVERSATION_FINALISATION_PIPELINE: readonly FinalisationStage[] = [
  {
    key: 'NORMALIZE_AND_REDACT',
    activityName: 'normalizeAndRedact',
    kind: 'DETERMINISTIC',
    requiresTranscriptState: 'NONE',
    blocking: true,
    outputArtifactTable: 'transcript_revisions',
    retryPolicy: { maximumAttempts: 5 },
  },
  {
    key: 'CALL_SUMMARY',
    activityName: 'enrichConversation',
    kind: 'AI_CAPABILITY',
    requiresTranscriptState: 'REDACTED',
    blocking: false,
    outputArtifactTable: 'call_summaries',
    retryPolicy: { maximumAttempts: 5 },
  },
  {
    key: 'INTERACTION_ANALYSIS',
    activityName: 'classifyInteraction',
    kind: 'AI_CAPABILITY',
    requiresTranscriptState: 'REDACTED',
    blocking: false,
    outputArtifactTable: 'call_classifications',
    retryPolicy: { maximumAttempts: 5 },
  },
  {
    key: 'DERIVE_OUTCOME',
    activityName: 'deriveOutcome',
    kind: 'DETERMINISTIC',
    requiresTranscriptState: 'REDACTED',
    blocking: false,
    outputArtifactTable: 'call_outcomes',
    retryPolicy: { maximumAttempts: 5 },
  },
  {
    key: 'LINK_AND_FOLLOW_UP',
    activityName: 'linkAndFollowUp',
    kind: 'DETERMINISTIC',
    requiresTranscriptState: 'REDACTED',
    blocking: false,
    outputArtifactTable: 'conversations',
    retryPolicy: { maximumAttempts: 5 },
  },
  {
    key: 'AGGREGATE',
    activityName: 'aggregateConversation',
    kind: 'DETERMINISTIC',
    requiresTranscriptState: 'REDACTED',
    blocking: false,
    outputArtifactTable: 'aggregate_facts',
    retryPolicy: { maximumAttempts: 5 },
  },
  {
    key: 'BUILD_INTELLIGENCE_MANIFEST',
    activityName: 'buildConversationIntelligenceManifest',
    kind: 'DETERMINISTIC',
    requiresTranscriptState: 'REDACTED',
    blocking: false,
    outputArtifactTable: 'conversation_intelligence_manifests',
    retryPolicy: { maximumAttempts: 5 },
  },
] as const;

/** The uniform shape every stage after NORMALIZE_AND_REDACT is invoked with and returns. */
export type FinalisationStageInput = { conversationId: string; transcriptRevisionId: string };
export type FinalisationStageOutput = { state: 'COMPLETED' | 'PARTIAL' };
