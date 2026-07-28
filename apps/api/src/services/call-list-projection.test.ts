import { describe, expect, it } from 'vitest';
import { deriveCallListStatus, deriveCallOrigin } from './call-list-projection.js';

describe('deriveCallListStatus', () => {
  it('collapses internal pipeline states into operator-facing completion', () => {
    expect(deriveCallListStatus('COMPLETED')).toBe('COMPLETED');
    expect(deriveCallListStatus('PARTIAL')).toBe('COMPLETED');
    expect(deriveCallListStatus('SUMMARIZING')).toBe('COMPLETED');
  });

  it('reports retryable and final failures as failed calls', () => {
    expect(deriveCallListStatus('FAILED_RETRYABLE')).toBe('FAILED');
    expect(deriveCallListStatus('FAILED_FINAL')).toBe('FAILED');
  });
});

describe('deriveCallOrigin', () => {
  it('recognises a real production-provider call made from Simulation', () => {
    expect(deriveCallOrigin({ hasReceptionistSession: true, synthetic: false })).toBe('SIMULATION');
  });

  it('keeps seeded evidence distinct from live inbound calls', () => {
    expect(deriveCallOrigin({ hasReceptionistSession: false, synthetic: true })).toBe('SYNTHETIC');
    expect(deriveCallOrigin({ hasReceptionistSession: false, synthetic: false })).toBe('LIVE');
  });
});
