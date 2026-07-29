import { describe, expect, it } from 'vitest';
import {
  agentLabel,
  compactIdentifier,
  formValuesFrom,
  keyLabel,
  normaliseTransferConfiguration,
  settingsPayload,
  type ProviderStatus,
} from './provider-card.logic.js';

const saved: ProviderStatus = {
  provider: 'ELEVENLABS',
  status: 'CONNECTED',
  connectionLabel: 'Quantum Parks',
  environment: 'SANDBOX',
  credentialReference: 'EL-A1B2C3D4',
  credentialLastFour: '9f0c',
  defaultAgentId: 'agent_45f5caf1-2184-4e55-a9f0-3eaa9d9b8ed6',
  defaultVoiceId: 'voice_1',
  receptionistDisplayName: 'Quantum Parks Receptionist',
  greetingOverride: 'Hi, you have reached Quantum Park. How can I help today?',
  language: 'en',
  voiceTestingEnabled: true,
  chatTestingEnabled: false,
  transcriptCapture: false,
  summaryGeneration: true,
  escalationDetection: true,
  voiceMode: 'WEBSOCKET_ONLY',
  transferConfiguration: {
    enabled: true,
    executionOwner: 'ELEVENLABS',
    transferTool: 'transfer_to_number',
    defaultTransferType: 'sip_refer',
    warmHandoffPreferred: false,
    preserveCallerIdPreferred: true,
    passConversationContext: true,
    destinations: [
      {
        id: 'ops',
        label: 'Operations',
        type: 'sip_uri',
        value: 'sip:ops@example.com',
        availability: 'Always',
        priority: 1,
        notes: 'Primary escalation route',
      },
    ],
    rules: [
      {
        id: 'complaint',
        label: 'Complaint',
        enabled: true,
        priority: 1,
        destinationId: 'ops',
        transferType: 'sip_refer',
        reasonCode: 'COMPLAINT',
        condition: 'Transfer formal complaints to operations.',
        clientMessage: 'I will connect you with operations.',
        operatorMessage: 'Complaint escalation. Review the transcript first.',
      },
    ],
    fallback: {
      type: 'callback',
      destinationId: 'ops',
      instructions: 'Create a callback task if the transfer fails.',
    },
    copilotContext: 'Keep handoff rules concise and provider neutral.',
  },
};

describe('keyLabel', () => {
  it('masks a stored key down to its last four characters', () => {
    expect(keyLabel(saved)).toBe('Key sk_...9f0c');
  });

  it('reports no saved key when nothing is stored', () => {
    expect(keyLabel({ provider: 'ELEVENLABS', status: 'NOT_CONFIGURED' })).toBe('Key not saved');
  });

  it('still reports a stored key when the last four are unknown', () => {
    expect(keyLabel({ ...saved, credentialLastFour: null })).toBe('Key saved');
  });

  it('never includes anything beyond the last four characters', () => {
    expect(keyLabel(saved)).not.toContain('A1B2C3D4');
  });
});

describe('agentLabel', () => {
  it('truncates a long agent id to twelve characters', () => {
    expect(agentLabel(saved)).toBe('Agent agent_45f5ca...');
  });

  it('reports an unconfigured agent', () => {
    expect(agentLabel({ ...saved, defaultAgentId: null })).toBe('Agent not configured');
  });

  it('leaves a short identifier intact', () => {
    expect(compactIdentifier('agent_1', 12)).toBe('agent_1');
  });
});

describe('formValuesFrom', () => {
  it('loads every saved value back into the form', () => {
    expect(formValuesFrom(saved)).toEqual({
      agentId: 'agent_45f5caf1-2184-4e55-a9f0-3eaa9d9b8ed6',
      voiceMode: 'WEBSOCKET_ONLY',
      language: 'en',
      receptionistDisplayName: 'Quantum Parks Receptionist',
      greetingOverride: 'Hi, you have reached Quantum Park. How can I help today?',
      enableVoiceTest: true,
      captureTranscripts: false,
      detectEscalations: true,
      enableChatTest: false,
      generateSummaries: true,
      transferConfiguration: saved.transferConfiguration,
    });
  });

  it('restores checkbox state rather than defaulting it when a stored value is false', () => {
    const values = formValuesFrom({ ...saved, voiceTestingEnabled: false });
    expect(values.enableVoiceTest).toBe(false);
  });

  it('falls back to the source defaults when nothing is configured', () => {
    const values = formValuesFrom({ provider: 'ELEVENLABS', status: 'NOT_CONFIGURED' });
    expect(values).toMatchObject({
      agentId: '',
      voiceMode: 'WEBRTC_PREFERRED',
      enableVoiceTest: true,
      captureTranscripts: true,
      enableChatTest: true,
      detectEscalations: false,
      generateSummaries: false,
    });
  });
});

describe('transfer configuration', () => {
  it('defaults to a provider-neutral ElevenLabs transfer policy', () => {
    const values = formValuesFrom({ provider: 'ELEVENLABS', status: 'NOT_CONFIGURED' });
    expect(values.transferConfiguration).toMatchObject({
      enabled: false,
      executionOwner: 'ELEVENLABS',
      transferTool: 'transfer_to_number',
      defaultTransferType: 'provider_default',
    });
    expect(values.transferConfiguration.destinations[0]).toMatchObject({
      id: 'main_operator',
      type: 'alias',
    });
  });

  it('repairs an empty migration-default transfer object', () => {
    const config = normaliseTransferConfiguration({});
    expect(config.fallback).toMatchObject({
      type: 'callback',
      destinationId: 'main_operator',
    });
    expect(config.rules[0]!.destinationId).toBe('main_operator');
  });

  it('keeps transfer policy inside the non-secret settings payload', () => {
    const payload = settingsPayload(saved, formValuesFrom(saved));
    expect(payload.transferConfiguration).toMatchObject({
      enabled: true,
      defaultTransferType: 'sip_refer',
      rules: [
        expect.objectContaining({
          destinationId: 'ops',
          reasonCode: 'COMPLAINT',
        }),
      ],
    });
  });

  it('normalises stale rule destinations to an approved destination', () => {
    const firstRule = saved.transferConfiguration!.rules[0]!;
    const config = normaliseTransferConfiguration({
      ...saved.transferConfiguration!,
      rules: [
        {
          ...firstRule,
          destinationId: 'missing',
          transferType: 'conference',
        },
      ],
    });
    expect(config.rules[0]!.destinationId).toBe('ops');
    expect(config.rules[0]!.transferType).toBe('conference');
  });
});

describe('settingsPayload', () => {
  const values = formValuesFrom(saved);

  it('never carries the API key', () => {
    expect(Object.keys(settingsPayload(saved, values))).not.toContain('apiKey');
  });

  it('preserves the stored connection label and voice id that the form does not expose', () => {
    const payload = settingsPayload(saved, values);
    expect(payload.connectionLabel).toBe('Quantum Parks');
    expect(payload.defaultVoiceId).toBe('voice_1');
  });

  it('sends every toggle so a cleared checkbox is persisted rather than dropped', () => {
    const payload = settingsPayload(saved, {
      ...values,
      enableVoiceTest: false,
      captureTranscripts: false,
      detectEscalations: false,
      enableChatTest: false,
      generateSummaries: false,
    });
    expect(payload).toMatchObject({
      voiceTestingEnabled: false,
      chatTestingEnabled: false,
      transcriptCapture: false,
      summaryGeneration: false,
      escalationDetection: false,
    });
  });

  it('normalises blank text fields to null instead of empty strings', () => {
    const payload = settingsPayload(saved, {
      ...values,
      agentId: '   ',
      language: '',
      receptionistDisplayName: '  ',
      greetingOverride: '',
    });
    expect(payload).toMatchObject({
      defaultAgentId: null,
      language: null,
      receptionistDisplayName: null,
      greetingOverride: null,
    });
  });

  it('carries an edited voice mode through to the payload', () => {
    expect(settingsPayload(saved, { ...values, voiceMode: 'WEBRTC_PREFERRED' })).toMatchObject({
      voiceMode: 'WEBRTC_PREFERRED',
    });
  });
});
