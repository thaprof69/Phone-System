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

  it('drops unsupported facts while retaining facts with source evidence', () => {
    const result = parseDocumentAnalysis(
      JSON.stringify({
        shortSummary: 'Opening hours and weather closure guidance.',
        detailedSummary:
          'The document states the opening time but contains an unsupported closing-time claim.',
        documentPurpose: 'Provide guest-facing opening and closure information.',
        topics: ['Opening hours'],
        keyFacts: [
          {
            fact: 'The park opens at 10:00.',
            evidenceQuote: 'The park opens at 10:00.',
          },
          {
            fact: 'The park closes at 22:00.',
            evidenceQuote: 'The park closes at 22:00.',
          },
        ],
        ambiguities: [],
        knowledgeContribution: 'Candidate opening-hours guidance for human review.',
        confidence: 'MEDIUM',
      }),
      'The park opens at 10:00.',
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keyFacts).toHaveLength(1);
      expect(result.data.keyFacts[0]?.evidenceQuote).toBe('The park opens at 10:00.');
    }
  });

  it('accepts the same evidence through harmless HTML typography normalisation', () => {
    const result = parseDocumentAnalysis(
      JSON.stringify({
        shortSummary: 'A named climbing activity is available.',
        detailedSummary:
          'The source identifies the Clip N Climb attraction using typographic punctuation.',
        documentPurpose: 'Describe an activity available to visitors.',
        topics: ['Climbing'],
        keyFacts: [
          {
            fact: 'The attraction is named Clip N Climb.',
            evidenceQuote: "Clip 'N Climb",
          },
        ],
        ambiguities: [],
        knowledgeContribution: 'Candidate activity guidance for human review.',
        confidence: 'MEDIUM',
      }),
      'Activities include Clip ‘N Climb and trampolines.',
    );

    expect(result.success).toBe(true);
  });
});
