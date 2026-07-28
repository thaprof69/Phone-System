import { describe, expect, it } from 'vitest';
import { parseIntelligenceAdvice } from './intelligence-copilot-advice.js';

describe('parseIntelligenceAdvice', () => {
  it('accepts bounded advice citing supplied signals', () => {
    const result = parseIntelligenceAdvice(
      JSON.stringify({
        answer:
          'Unresolved calls are the strongest current signal. Review that cohort before changing approved knowledge.',
        citedSignalIds: ['unresolved'],
      }),
      ['unresolved', 'demand'],
    );
    expect(result.success).toBe(true);
  });

  it('rejects invented signal citations', () => {
    const result = parseIntelligenceAdvice(
      JSON.stringify({
        answer: 'A fabricated signal should never pass the evidence boundary.',
        citedSignalIds: ['invented'],
      }),
      ['unresolved'],
    );
    expect(result.success).toBe(false);
  });
});
