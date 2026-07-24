import { describe, expect, it } from 'vitest';
import type {
  CapabilityVersion,
  ContextSourceType,
  ExecuteCapabilityRequest,
} from '@quantum-parks/aios-contracts';
import { AIOSContextBuilder, AIOSDependencyPlanner, AIOSEvidenceResolver } from './index.js';

const capability = (
  key: CapabilityVersion['capabilityKey'],
  dependencies = [],
): CapabilityVersion => ({
  id: key,
  capabilityKey: key,
  version: 1,
  serviceVersionId: 'service-v1',
  contextPolicyVersionId: 'context-v1',
  dependencies,
  allowedClassifications: ['CONFIDENTIAL'],
  maximumContextTokens: 100,
  confidenceThreshold: 0.8,
  critical: true,
  state: 'ACTIVE',
});

describe('AIOS governance', () => {
  it('builds minimum evidence context with deterministic references', async () => {
    const builder = new AIOSContextBuilder([
      {
        sourceType: 'TRANSCRIPT' as ContextSourceType,
        async resolve(sourceId) {
          return {
            included: true as const,
            item: {
              sourceType: 'TRANSCRIPT' as const,
              sourceId,
              sourceVersion: '1',
              checksum: 'checksum',
              classification: 'CONFIDENTIAL' as const,
              verified: true,
              retrievedAt: new Date().toISOString(),
              content: 'What time does the park open?',
              transformations: ['REDACTED'],
            },
          };
        },
      },
    ]);
    const request: ExecuteCapabilityRequest = {
      capabilityKey: 'CALL_SUMMARY',
      executionContext: {
        environment: 'development',
        callerService: 'test',
        actorId: 'test',
        purpose: 'QUALITY_REVIEW',
        correlationId: 'correlation',
        sourceRecordId: 'call-1',
        sourceRevisionId: 'revision-1',
      },
      contextSources: [{ sourceType: 'TRANSCRIPT', sourceId: 'turn-1' }],
    };
    const result = await builder.build(capability('CALL_SUMMARY'), request);
    expect(result.state).toBe('SUCCESS');
    if (result.state === 'SUCCESS')
      expect(result.data.items[0]?.evidenceId).toMatch(/^ev_[a-f0-9]{24}$/);
  });

  it('rejects capability dependency cycles', async () => {
    const call = capability('CALL_SUMMARY', [
      { capabilityKey: 'REPORT_AUTHORING', required: true, parallelizable: false },
    ]);
    const report = capability('REPORT_AUTHORING', [
      { capabilityKey: 'CALL_SUMMARY', required: true, parallelizable: false },
    ]);
    const planner = new AIOSDependencyPlanner({
      async getActiveCapability(key) {
        return key === 'CALL_SUMMARY' ? call : report;
      },
    } as never);
    const result = await planner.plan(call);
    expect(result).toMatchObject({ state: 'POLICY_REJECTED', code: 'AIOS_DEPENDENCY_CYCLE' });
  });

  it('rejects evidence outside the governed manifest and fabricated completion', () => {
    const resolver = new AIOSEvidenceResolver();
    const manifest = {
      id: 'manifest',
      version: 1 as const,
      items: [
        {
          evidenceId: 'ev_allowed',
          sourceType: 'TRANSCRIPT' as const,
          sourceId: 'turn-1',
          sourceVersion: '1',
          checksum: 'checksum',
          classification: 'CONFIDENTIAL' as const,
          verified: true,
          retrievedAt: new Date().toISOString(),
          content: 'redacted',
          tokenEstimate: 2,
          transformations: ['REDACTED'],
        },
      ],
      totalTokenEstimate: 2,
      excluded: [],
    };
    expect(
      resolver.validate({ purpose: { text: 'claim', evidence_ids: ['ev_unknown'] } }, manifest),
    ).toMatchObject({ state: 'EVIDENCE_INSUFFICIENT' });
    expect(
      resolver.validate(
        {
          purpose: { text: 'claim', evidence_ids: ['ev_allowed'] },
          payment_received: true,
        },
        manifest,
      ),
    ).toMatchObject({ state: 'POLICY_REJECTED', code: 'AIOS_FALSE_COMPLETION' });
  });
});
