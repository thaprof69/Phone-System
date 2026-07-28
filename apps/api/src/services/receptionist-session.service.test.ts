import { describe, expect, it } from 'vitest';
import {
  deriveCallIntelligenceStatus,
  deriveSummaryIssue,
} from './receptionist-session.service.js';

describe('deriveCallIntelligenceStatus', () => {
  it('waits until transcript intelligence exists', () => {
    expect(
      deriveCallIntelligenceStatus({
        hasSummary: false,
        hasClassification: false,
        sessionEnded: false,
        processingFinished: false,
        hasProvisionalResult: false,
      }),
    ).toBe('WAITING');
  });

  it('exposes live turn analysis as provisional', () => {
    expect(
      deriveCallIntelligenceStatus({
        hasSummary: false,
        hasClassification: false,
        sessionEnded: false,
        processingFinished: false,
        hasProvisionalResult: true,
      }),
    ).toBe('PROVISIONAL');
  });

  it('reports analysis while an ended call is finalising', () => {
    expect(
      deriveCallIntelligenceStatus({
        hasSummary: false,
        hasClassification: false,
        sessionEnded: true,
        processingFinished: false,
        hasProvisionalResult: true,
      }),
    ).toBe('ANALYSING');
  });

  it('requires both final artifacts before reporting ready', () => {
    expect(
      deriveCallIntelligenceStatus({
        hasSummary: true,
        hasClassification: false,
        sessionEnded: true,
        processingFinished: true,
        hasProvisionalResult: true,
      }),
    ).toBe('PARTIAL');
    expect(
      deriveCallIntelligenceStatus({
        hasSummary: true,
        hasClassification: true,
        sessionEnded: true,
        processingFinished: true,
        hasProvisionalResult: true,
      }),
    ).toBe('READY');
  });
});

describe('deriveSummaryIssue', () => {
  it('identifies a missing Transcript Summaries route assignment', () => {
    expect(
      deriveSummaryIssue({
        hasSummary: false,
        processingFinished: true,
      }),
    ).toBe('No AI Router model is assigned to Transcript Summaries.');
  });

  it('identifies a selected model that has not passed its live test', () => {
    expect(
      deriveSummaryIssue({
        hasSummary: false,
        processingFinished: true,
        primaryModel: { enabled: true, status: 'NOT_TESTED' },
      }),
    ).toBe('The AI Router model selected for Transcript Summaries is not connected and tested.');
  });

  it('attributes an invalid final response to the usable selected route', () => {
    expect(
      deriveSummaryIssue({
        hasSummary: false,
        processingFinished: true,
        primaryModel: { enabled: true, status: 'CONNECTED' },
      }),
    ).toBe('The selected AI Router model did not return a valid transcript summary.');
  });

  it('does not report a route issue while processing or after a summary exists', () => {
    expect(
      deriveSummaryIssue({
        hasSummary: false,
        processingFinished: false,
      }),
    ).toBeNull();
    expect(
      deriveSummaryIssue({
        hasSummary: true,
        processingFinished: true,
      }),
    ).toBeNull();
  });
});
