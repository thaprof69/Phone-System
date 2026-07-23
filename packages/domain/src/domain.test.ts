import { describe, expect, it } from 'vitest';
import {
  deriveDeterministicOutcome,
  evaluateReleaseGate,
  redactPaymentData,
  redactSensitiveToolInput,
} from './index.js';

describe('deterministic outcomes', () => {
  it('does not convert a queued callback into a completed callback outcome', () => {
    const result = deriveDeterministicOutcome([
      { type: 'CALLBACK_PERSISTED', status: 'QUEUED', referenceId: 'callback-1' },
      { type: 'CONVERSATION_END', status: 'SUCCESS', referenceId: 'call-end' },
    ]);
    expect(result.outcome).toBe('NO_ACTION_REQUIRED');
  });

  it('requires trusted success evidence for transfer completion', () => {
    const result = deriveDeterministicOutcome([
      { type: 'TRANSFER_RESULT', status: 'SUCCESS', referenceId: 'transfer-1' },
    ]);
    expect(result).toEqual({ outcome: 'TRANSFER_COMPLETED', evidenceIds: ['transfer-1'] });
  });
});

describe('production release gate', () => {
  it('rejects synthetic and drifted dependencies', () => {
    const result = evaluateReleaseGate({
      environment: 'production',
      capabilities: { agentVersioning: 'SUPPORTED' },
      requiredCapabilities: ['agentVersioning'],
      dependencies: [
        {
          id: 'agent-v1',
          kind: 'AGENT',
          approved: true,
          active: true,
          synthetic: true,
          expired: false,
          syncState: 'DRIFTED',
        },
      ],
      criticalTestsPassed: true,
      approvalsComplete: true,
      privacyApproved: true,
      retentionApproved: true,
      disclosureApproved: true,
      developmentIdentity: false,
      fakeAdapters: [],
      securityHighOrCriticalFindings: 0,
    });
    expect(result.allowed).toBe(false);
    expect(result.readiness).toBe('EXTERNALLY_BLOCKED');
  });
});

describe('payment redaction', () => {
  it('redacts a Luhn-valid card-like sequence', () => {
    const result = redactPaymentData('Use 4111 1111 1111 1111 now');
    expect(result.text).toContain('[PAYMENT_DATA_REDACTED]');
    expect(result.paymentDataDetected).toBe(true);
  });

  it('never persists verification factors in tool audit input', () => {
    expect(
      redactSensitiveToolInput({
        customer_id: 'customer-1',
        otp: '123456',
        booking_reference: 'QP-1',
      }),
    ).toEqual({
      customer_id: 'customer-1',
      otp: '[REDACTED]',
      booking_reference: '[REDACTED]',
    });
  });
});
