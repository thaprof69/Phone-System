import { describe, expect, it } from 'vitest';
import { SummarySchema } from '@quantum-parks/intelligence';
import {
  CAPABILITIES_WITHOUT_CONSUMER,
  CAPABILITY_CONSUMER_STATUS,
  INTELLIGENCE_CAPABILITIES,
  deriveRouteStatus,
  isIntelligenceCapability,
  isIntelligenceProvider,
  parseJsonObject,
} from './intelligence-routing.service.js';

const connected = { enabled: true, status: 'CONNECTED' as const };
const untested = { enabled: true, status: 'NOT_TESTED' as const };
const failed = { enabled: true, status: 'FAILED' as const };
const disabled = { enabled: false, status: 'CONNECTED' as const };

describe('deriveRouteStatus', () => {
  it('is Ready only when the primary passed a live test', () => {
    expect(deriveRouteStatus(connected, undefined).status).toBe('READY');
  });

  it('is not Ready merely because a credential was saved', () => {
    expect(deriveRouteStatus(untested, undefined).status).toBe('PROVIDER_UNAVAILABLE');
  });

  it('reports a missing primary rather than inventing one', () => {
    expect(deriveRouteStatus(undefined, undefined).status).toBe('MISSING_MODEL');
  });

  it('reports Fallback active rather than Ready when the primary failed', () => {
    const result = deriveRouteStatus(failed, connected);
    expect(result.status).toBe('FALLBACK_ACTIVE');
    expect(result.status).not.toBe('READY');
  });

  it('treats a disabled primary as unavailable, not as healthy', () => {
    expect(deriveRouteStatus(disabled, undefined).status).toBe('PROVIDER_UNAVAILABLE');
    expect(deriveRouteStatus(disabled, connected).status).toBe('FALLBACK_ACTIVE');
  });

  it('does not count an untested fallback as usable', () => {
    expect(deriveRouteStatus(failed, untested).status).toBe('PROVIDER_UNAVAILABLE');
  });

  it('keeps the capability serviceable when only the fallback is verified', () => {
    expect(deriveRouteStatus(undefined, connected).status).toBe('FALLBACK_ACTIVE');
  });

  it('explains why a route is not ready', () => {
    expect(deriveRouteStatus(untested, undefined).detail).toContain('has not passed a live test');
    expect(deriveRouteStatus(disabled, undefined).detail).toContain('disabled');
  });
});

describe('capability and provider validation', () => {
  it('accepts only the governed backend capability identifiers', () => {
    for (const capability of INTELLIGENCE_CAPABILITIES)
      expect(isIntelligenceCapability(capability)).toBe(true);
    expect(isIntelligenceCapability('Transcript Summaries')).toBe(false);
    expect(isIntelligenceCapability('ANYTHING_ELSE')).toBe(false);
  });

  it('rejects a provider name the browser might invent', () => {
    expect(isIntelligenceProvider('OPENAI')).toBe(true);
    expect(isIntelligenceProvider('openai')).toBe(false);
    expect(isIntelligenceProvider('SIMULATOR')).toBe(false);
  });

  it('marks future product routes as having no active consumer yet', () => {
    expect(CAPABILITIES_WITHOUT_CONSUMER).toContain('CONTEXTUAL_GUIDE');
    expect(CAPABILITIES_WITHOUT_CONSUMER).not.toContain('EMAIL_AND_ALERTS');
    expect(CAPABILITIES_WITHOUT_CONSUMER).not.toContain('TRANSCRIPT_SUMMARY');
    expect(CAPABILITIES_WITHOUT_CONSUMER).not.toContain('AI_COPILOT');
    expect(CAPABILITIES_WITHOUT_CONSUMER).not.toContain('KNOWLEDGE_HUB');
  });

  it('keeps planned consumer boundaries explicit', () => {
    expect(CAPABILITY_CONSUMER_STATUS.AI_COPILOT).toBeNull();
    expect(CAPABILITY_CONSUMER_STATUS.KNOWLEDGE_HUB).toBeNull();
    expect(CAPABILITY_CONSUMER_STATUS.EMAIL_AND_ALERTS).toBeNull();
  });
});

describe('parseJsonObject', () => {
  it('reads a plain JSON object', () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('tolerates a markdown fence, which models commonly add', () => {
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('tolerates leading prose before the object', () => {
    expect(parseJsonObject('Here you go:\n{"a":1}')).toEqual({ a: 1 });
  });

  it('returns null for prose with no object rather than guessing', () => {
    expect(parseJsonObject('I cannot summarise this call.')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseJsonObject('{"a":')).toBeNull();
  });
});

describe('summary schema enforcement', () => {
  const valid = {
    purpose: { text: 'Booking enquiry', evidence_ids: ['turn-1'] },
    caller_requests: [],
    information_provided: [],
    confirmed_actions: [],
    unconfirmed_requests: [],
    unresolved_items: [],
    handoff: null,
    quality_flags: [],
    evidence_coverage: 0.8,
  };

  it('accepts a well-formed model summary', () => {
    expect(SummarySchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a model that claims a completed business action', () => {
    const result = SummarySchema.safeParse({
      ...valid,
      confirmed_actions: [
        { text: 'Refund issued', evidence_ids: ['turn-2'], result_status: 'SUCCESS' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a summary with an out-of-range evidence coverage', () => {
    expect(SummarySchema.safeParse({ ...valid, evidence_coverage: 1.5 }).success).toBe(false);
  });
});
