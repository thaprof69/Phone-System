import { describe, expect, it } from 'vitest';
import { parseDocumentAnalysis, parseEnhancementResponse } from './knowledge-copilot.js';

describe('knowledge copilot response validation', () => {
  it('accepts a bounded field enhancement', () => {
    const result = parseEnhancementResponse(
      JSON.stringify({
        enhancedText: 'Open daily, subject to approved seasonal and weather exceptions.',
      }),
    );

    expect(result.success).toBe(true);
  });

  it('accepts evidence quotes that exist in the extracted source', () => {
    const source = 'The park opens at 10:00. Weather closures are announced on the website.';
    const result = parseDocumentAnalysis(
      JSON.stringify({
        shortSummary: 'Opening hours and weather closure guidance.',
        detailedSummary:
          'The document states the normal opening time and where weather closures are announced.',
        documentPurpose: 'Provide guest-facing opening and closure information.',
        topics: ['Opening hours', 'Weather closures'],
        keyFacts: [
          {
            fact: 'The park opens at 10:00.',
            evidenceQuote: 'The park opens at 10:00.',
          },
        ],
        ambiguities: ['No closing time is stated.'],
        knowledgeContribution: 'Candidate opening-hours guidance for human review.',
        confidence: 'HIGH',
      }),
      source,
    );

    expect(result.success).toBe(true);
  });

  it('rejects invented evidence quotes', () => {
    const result = parseDocumentAnalysis(
      JSON.stringify({
        shortSummary: 'Opening hours and weather closure guidance.',
        detailedSummary:
          'The document states the normal opening time and where weather closures are announced.',
        documentPurpose: 'Provide guest-facing opening and closure information.',
        topics: ['Opening hours'],
        keyFacts: [
          {
            fact: 'The park closes at 22:00.',
            evidenceQuote: 'The park closes at 22:00.',
          },
        ],
        ambiguities: [],
        knowledgeContribution: 'Candidate opening-hours guidance for human review.',
        confidence: 'HIGH',
      }),
      'The park opens at 10:00.',
    );

    expect(result.success).toBe(false);
  });
});
