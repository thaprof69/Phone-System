import { describe, expect, it } from 'vitest';
import {
  buildAggregateRows,
  buildClassificationInsert,
  buildManifestWarnings,
  computeManifestCompleteness,
  deriveManifestStatus,
} from './activities.js';

describe('buildAggregateRows', () => {
  it('always contributes the three total dimension rows for one conversation', () => {
    const rows = buildAggregateRows({
      park: null,
      language: null,
      intent: null,
      outcome: null,
      durationSeconds: 120,
      completed: true,
      synthetic: false,
    });
    expect(rows).toEqual([
      {
        dimensionKey: 'total',
        dimensionValue: 'all',
        metric: 'calls_received',
        count: 1,
        sum: 0,
        synthetic: false,
      },
      {
        dimensionKey: 'total',
        dimensionValue: 'all',
        metric: 'calls_completed',
        count: 1,
        sum: 0,
        synthetic: false,
      },
      {
        dimensionKey: 'total',
        dimensionValue: 'all',
        metric: 'call_duration_seconds',
        count: 1,
        sum: 120,
        synthetic: false,
      },
    ]);
  });

  it('marks calls_completed as 0 when the pipeline was partial', () => {
    const rows = buildAggregateRows({
      park: null,
      language: null,
      intent: null,
      outcome: null,
      durationSeconds: 0,
      completed: false,
      synthetic: false,
    });
    expect(rows.find((row) => row.metric === 'calls_completed')?.count).toBe(0);
  });

  it('adds park, language, intent and outcome rows only when present', () => {
    const rows = buildAggregateRows({
      park: 'northshore',
      language: 'en',
      intent: 'booking_change',
      outcome: 'RESOLVED_BY_AGENT',
      durationSeconds: 45,
      completed: true,
      synthetic: false,
    });
    const dimensionKeys = rows.map((row) => row.dimensionKey);
    expect(dimensionKeys).toEqual([
      'total',
      'total',
      'total',
      'park',
      'language',
      'intent',
      'outcome',
    ]);
    expect(rows.find((row) => row.dimensionKey === 'park')).toMatchObject({
      dimensionValue: 'northshore',
      metric: 'calls_received',
      count: 1,
    });
    expect(rows.find((row) => row.dimensionKey === 'intent')).toMatchObject({
      dimensionValue: 'booking_change',
    });
    expect(rows.find((row) => row.dimensionKey === 'outcome')).toMatchObject({
      dimensionValue: 'RESOLVED_BY_AGENT',
    });
  });

  it('omits park/language/intent/outcome rows when those fields are null', () => {
    const rows = buildAggregateRows({
      park: null,
      language: null,
      intent: null,
      outcome: null,
      durationSeconds: 10,
      completed: true,
      synthetic: false,
    });
    expect(rows).toHaveLength(3);
  });

  it('propagates synthetic onto every row so real and synthetic conversations never collide', () => {
    const rows = buildAggregateRows({
      park: 'northshore',
      language: 'en',
      intent: 'booking_change',
      outcome: 'RESOLVED_BY_AGENT',
      durationSeconds: 45,
      completed: true,
      synthetic: true,
    });
    expect(rows.every((row) => row.synthetic === true)).toBe(true);
  });
});

describe('buildClassificationInsert', () => {
  const baseEvidence = {
    intent: 'group_booking',
    confidence: 0.87,
    evidence_ids: ['ev_abc123'],
    entities: [
      { entity_type: 'PARK', text: 'Northshore', evidence_ids: ['ev_abc123'] },
      { entity_type: 'DATE', text: 'Saturday', evidence_ids: ['ev_def456'] },
    ],
  };

  it('maps the evidence pack onto a call_classifications row', () => {
    const { classification } = buildClassificationInsert({
      conversationId: 'conversation-1',
      transcriptRevisionId: 'revision-1',
      evidence: baseEvidence,
      taxonomyVersion: 'interaction-analysis-freeform-v1',
      provider: 'OPENAI',
      model: 'model-1',
      promptVersion: 'prompt-version-1',
      schemaVersion: 'schema-version-1',
      aiArtifactId: 'artifact-1',
    });
    expect(classification).toEqual({
      conversationId: 'conversation-1',
      transcriptRevisionId: 'revision-1',
      revision: 1,
      primaryIntent: 'group_booking',
      secondaryIntents: [],
      taxonomyVersion: 'interaction-analysis-freeform-v1',
      provider: 'OPENAI',
      model: 'model-1',
      promptVersion: 'prompt-version-1',
      schemaVersion: 'schema-version-1',
      aiArtifactId: 'artifact-1',
      confidence: '0.87',
      evidenceIds: ['ev_abc123'],
    });
  });

  it('maps every entity, carrying the overall confidence since entities have no per-item confidence', () => {
    const { entities } = buildClassificationInsert({
      conversationId: 'conversation-1',
      transcriptRevisionId: 'revision-1',
      evidence: baseEvidence,
      taxonomyVersion: 'interaction-analysis-freeform-v1',
      provider: 'OPENAI',
      model: 'model-1',
      promptVersion: 'prompt-version-1',
      schemaVersion: 'schema-version-1',
      aiArtifactId: 'artifact-1',
    });
    expect(entities).toEqual([
      { entityType: 'PARK', value: 'Northshore', confidence: '0.87', evidenceIds: ['ev_abc123'] },
      { entityType: 'DATE', value: 'Saturday', confidence: '0.87', evidenceIds: ['ev_def456'] },
    ]);
  });

  it('produces an empty entities array when the evidence pack found no entities', () => {
    const { entities } = buildClassificationInsert({
      conversationId: 'conversation-1',
      transcriptRevisionId: 'revision-1',
      evidence: { ...baseEvidence, entities: [] },
      taxonomyVersion: 'interaction-analysis-freeform-v1',
      provider: 'OPENAI',
      model: 'model-1',
      promptVersion: 'prompt-version-1',
      schemaVersion: 'schema-version-1',
      aiArtifactId: null,
    });
    expect(entities).toEqual([]);
  });
});

describe('computeManifestCompleteness', () => {
  it('counts all three required outputs present as full completeness', () => {
    expect(
      computeManifestCompleteness({ summary: true, classification: true, outcome: true }),
    ).toEqual({ expectedArtifactCount: 3, presentArtifactCount: 3, completenessRatio: 1 });
  });

  it('counts zero present outputs as zero completeness', () => {
    expect(
      computeManifestCompleteness({ summary: false, classification: false, outcome: false }),
    ).toEqual({ expectedArtifactCount: 3, presentArtifactCount: 0, completenessRatio: 0 });
  });

  it('counts a partial mix correctly', () => {
    expect(
      computeManifestCompleteness({ summary: true, classification: false, outcome: true }),
    ).toEqual({
      expectedArtifactCount: 3,
      presentArtifactCount: 2,
      completenessRatio: 2 / 3,
    });
  });
});

describe('deriveManifestStatus', () => {
  it('is INSUFFICIENT_EVIDENCE whenever no transcript is available, regardless of completeness', () => {
    expect(deriveManifestStatus(1, false, false)).toBe('INSUFFICIENT_EVIDENCE');
    expect(deriveManifestStatus(0, false, false)).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('is FAILED when the transcript exists but zero required outputs are present', () => {
    expect(deriveManifestStatus(0, false, true)).toBe('FAILED');
  });

  it('is COMPLETE only at full completeness with no partial finalisation stage', () => {
    expect(deriveManifestStatus(1, false, true)).toBe('COMPLETE');
  });

  it('is PARTIAL at full completeness if an earlier stage still reported partial', () => {
    expect(deriveManifestStatus(1, true, true)).toBe('PARTIAL');
  });

  it('is PARTIAL for any incomplete-but-nonzero completeness', () => {
    expect(deriveManifestStatus(2 / 3, false, true)).toBe('PARTIAL');
    expect(deriveManifestStatus(1 / 3, true, true)).toBe('PARTIAL');
  });
});

describe('buildManifestWarnings', () => {
  it('warns about each missing required output by name', () => {
    expect(
      buildManifestWarnings({ summary: false, classification: false, outcome: true }, false),
    ).toEqual(['Missing call summary', 'Missing call classification']);
  });

  it('produces no warnings when everything is present and nothing was partial', () => {
    expect(
      buildManifestWarnings({ summary: true, classification: true, outcome: true }, false),
    ).toEqual([]);
  });

  it('warns about an earlier partial stage even when all three outputs are present', () => {
    expect(
      buildManifestWarnings({ summary: true, classification: true, outcome: true }, true),
    ).toEqual(['An earlier finalisation stage reported partial completion']);
  });
});
