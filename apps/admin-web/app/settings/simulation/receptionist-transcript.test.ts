import { describe, expect, it } from 'vitest';
import { shouldRecordProviderTranscriptEvent } from './receptionist-transcript.js';

describe('shouldRecordProviderTranscriptEvent', () => {
  it('records both sides of a voice conversation', () => {
    expect(shouldRecordProviderTranscriptEvent('VOICE', 'user')).toBe(true);
    expect(shouldRecordProviderTranscriptEvent('VOICE', 'agent')).toBe(true);
  });

  it('does not duplicate text caller messages already recorded on send', () => {
    expect(shouldRecordProviderTranscriptEvent('TEXT', 'user')).toBe(false);
    expect(shouldRecordProviderTranscriptEvent('TEXT', 'agent')).toBe(true);
  });
});
