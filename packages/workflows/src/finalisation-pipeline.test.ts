import { describe, expect, it } from 'vitest';
import { CONVERSATION_FINALISATION_PIPELINE } from './finalisation-pipeline.js';
import { shouldHaltPipeline } from './index.js';

describe('CONVERSATION_FINALISATION_PIPELINE', () => {
  it('matches the documented stage order', () => {
    expect(CONVERSATION_FINALISATION_PIPELINE.map((stage) => stage.key)).toEqual([
      'NORMALIZE_AND_REDACT',
      'CALL_SUMMARY',
      'INTERACTION_ANALYSIS',
      'DERIVE_OUTCOME',
      'LINK_AND_FOLLOW_UP',
      'AGGREGATE',
      'BUILD_INTELLIGENCE_MANIFEST',
    ]);
  });

  it('begins with the only blocking stage', () => {
    const [first, ...rest] = CONVERSATION_FINALISATION_PIPELINE;
    expect(first?.blocking).toBe(true);
    expect(rest.every((stage) => stage.blocking === false)).toBe(true);
  });

  it('requires NONE only for the first stage and REDACTED for every stage after it', () => {
    const [first, ...rest] = CONVERSATION_FINALISATION_PIPELINE;
    expect(first?.requiresTranscriptState).toBe('NONE');
    expect(rest.every((stage) => stage.requiresTranscriptState === 'REDACTED')).toBe(true);
  });

  it('every stage names an activity from the known PostCallActivities set', () => {
    const knownActivities = new Set([
      'normalizeAndRedact',
      'enrichConversation',
      'classifyInteraction',
      'deriveOutcome',
      'linkAndFollowUp',
      'aggregateConversation',
      'buildConversationIntelligenceManifest',
      'completeProcessing',
      'publishAgent',
      'readBackAgent',
      'publishKnowledge',
      'readBackKnowledge',
      'reconcileWorkspace',
    ]);
    for (const stage of CONVERSATION_FINALISATION_PIPELINE) {
      expect(knownActivities.has(stage.activityName)).toBe(true);
    }
  });

  it('gives every stage a positive retry attempt count', () => {
    for (const stage of CONVERSATION_FINALISATION_PIPELINE) {
      expect(stage.retryPolicy.maximumAttempts).toBeGreaterThan(0);
    }
  });
});

describe('shouldHaltPipeline', () => {
  it('halts when a blocking stage fails', () => {
    expect(shouldHaltPipeline(true, true)).toBe(true);
  });

  it('continues when a non-blocking stage fails', () => {
    expect(shouldHaltPipeline(false, true)).toBe(false);
  });

  it('never halts a stage that did not fail', () => {
    expect(shouldHaltPipeline(true, false)).toBe(false);
    expect(shouldHaltPipeline(false, false)).toBe(false);
  });
});
