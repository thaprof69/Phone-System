import { describe, expect, it } from 'vitest';
import { DeterministicLocalProvider, SummarySchema, enrichNonBlocking } from './index.js';

describe('non-blocking enrichment', () => {
  it('creates evidence-linked local intelligence', async () => {
    const result = await enrichNonBlocking(new DeterministicLocalProvider(), {
      turns: [{ id: 'turn-1', speaker: 'user', content: 'What time do you open?' }],
      languageHint: 'en',
    });
    expect(result.state).toBe('COMPLETED');
    if (result.state === 'COMPLETED')
      expect(result.output.classification.primary_intent).toBe('OPENING_HOURS');
  });

  it('rejects model-authored completion claims', () => {
    const result = SummarySchema.safeParse({
      purpose: { text: 'Caller requested a callback', evidence_ids: ['turn-1'] },
      caller_requests: [],
      information_provided: [],
      confirmed_actions: [
        { text: 'Callback created', evidence_ids: ['turn-1'], result_status: 'SUCCESS' },
      ],
      unconfirmed_requests: [],
      unresolved_items: [],
      handoff: null,
      quality_flags: [],
      evidence_coverage: 1,
    });
    expect(result.success).toBe(false);
  });
});
