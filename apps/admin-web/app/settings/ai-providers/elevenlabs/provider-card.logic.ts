/**
 * Pure derivations behind the ElevenLabs provider form, kept out of the component so they can
 * be tested without a DOM. Behaviour mirrors the source implementation's `ProviderCard`
 * (Quantum Park Lite — src/app/settings/phone/_components/phone-panels.tsx).
 */

export type ProviderStatus = {
  provider: 'ELEVENLABS';
  status: string;
  connectionLabel?: string | null;
  environment?: 'SANDBOX' | 'PRODUCTION';
  credentialReference?: string | null;
  credentialLastFour?: string | null;
  defaultAgentId?: string | null;
  defaultVoiceId?: string | null;
  receptionistDisplayName?: string | null;
  greetingOverride?: string | null;
  language?: string | null;
  voiceTestingEnabled?: boolean;
  chatTestingEnabled?: boolean;
  transcriptCapture?: boolean;
  summaryGeneration?: boolean;
  escalationDetection?: boolean;
  voiceMode?: 'WEBRTC_PREFERRED' | 'WEBSOCKET_ONLY';
};

export type FormValues = {
  agentId: string;
  voiceMode: 'WEBRTC_PREFERRED' | 'WEBSOCKET_ONLY';
  language: string;
  receptionistDisplayName: string;
  greetingOverride: string;
  enableVoiceTest: boolean;
  captureTranscripts: boolean;
  detectEscalations: boolean;
  enableChatTest: boolean;
  generateSummaries: boolean;
};

/** Source: `compactIdentifier(value, head = 10)`. */
export function compactIdentifier(value: string, head = 10) {
  if (value.length <= head + 3) return value;
  return `${value.slice(0, head)}...`;
}

/** Source: `Key sk_...${lastFour}` when a key is stored, otherwise "Key not saved". */
export function keyLabel(status: ProviderStatus) {
  if (status.credentialLastFour) return `Key sk_...${status.credentialLastFour}`;
  return status.credentialReference ? 'Key saved' : 'Key not saved';
}

/** Source: `Agent ${compactIdentifier(agentId, 12)}` / "Agent not configured". */
export function agentLabel(status: ProviderStatus) {
  return status.defaultAgentId
    ? `Agent ${compactIdentifier(status.defaultAgentId, 12)}`
    : 'Agent not configured';
}

/** The form state a saved status loads into, matching the source's defaults. */
export function formValuesFrom(status: ProviderStatus): FormValues {
  return {
    agentId: status.defaultAgentId ?? '',
    voiceMode: status.voiceMode ?? 'WEBRTC_PREFERRED',
    language: status.language ?? '',
    receptionistDisplayName: status.receptionistDisplayName ?? '',
    greetingOverride: status.greetingOverride ?? '',
    enableVoiceTest: status.voiceTestingEnabled ?? true,
    captureTranscripts: status.transcriptCapture ?? true,
    detectEscalations: status.escalationDetection ?? false,
    enableChatTest: status.chatTestingEnabled ?? true,
    generateSummaries: status.summaryGeneration ?? false,
  };
}

/**
 * The non-secret settings payload. `connectionLabel`, `environment` and `defaultVoiceId` have
 * no control on the source page, so stored values are carried through rather than surfaced —
 * and the API key is never part of this payload.
 */
export function settingsPayload(status: ProviderStatus, values: FormValues) {
  return {
    connectionLabel: status.connectionLabel ?? 'Quantum Parks',
    defaultAgentId: values.agentId.trim() || null,
    defaultVoiceId: status.defaultVoiceId ?? null,
    receptionistDisplayName: values.receptionistDisplayName.trim() || null,
    greetingOverride: values.greetingOverride.trim() || null,
    language: values.language.trim() || null,
    voiceMode: values.voiceMode,
    voiceTestingEnabled: values.enableVoiceTest,
    chatTestingEnabled: values.enableChatTest,
    transcriptCapture: values.captureTranscripts,
    summaryGeneration: values.generateSummaries,
    escalationDetection: values.detectEscalations,
  };
}
