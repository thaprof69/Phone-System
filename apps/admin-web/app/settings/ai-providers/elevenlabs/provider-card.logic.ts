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
  transferConfiguration?: TransferConfiguration | null;
};

export type TransferType = 'provider_default' | 'conference' | 'blind' | 'sip_refer';
export type TransferDestinationType = 'alias' | 'phone' | 'sip_uri';
export type TransferFallbackType = 'callback' | 'voicemail' | 'message_only';

export type TransferDestination = {
  id: string;
  label: string;
  type: TransferDestinationType;
  value: string;
  availability: string;
  priority: number;
  notes: string;
};

export type TransferRule = {
  id: string;
  label: string;
  enabled: boolean;
  priority: number;
  destinationId: string;
  transferType: TransferType;
  reasonCode: string;
  condition: string;
  clientMessage: string;
  operatorMessage: string;
};

export type TransferConfiguration = {
  enabled: boolean;
  executionOwner: 'ELEVENLABS';
  transferTool: 'transfer_to_number';
  defaultTransferType: TransferType;
  warmHandoffPreferred: boolean;
  preserveCallerIdPreferred: boolean;
  passConversationContext: boolean;
  destinations: TransferDestination[];
  rules: TransferRule[];
  fallback: {
    type: TransferFallbackType;
    destinationId: string | null;
    instructions: string;
  };
  copilotContext: string;
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
  transferConfiguration: TransferConfiguration;
};

export const DEFAULT_TRANSFER_CONFIGURATION: TransferConfiguration = {
  enabled: false,
  executionOwner: 'ELEVENLABS',
  transferTool: 'transfer_to_number',
  defaultTransferType: 'provider_default',
  warmHandoffPreferred: true,
  preserveCallerIdPreferred: true,
  passConversationContext: true,
  destinations: [
    {
      id: 'main_operator',
      label: 'Main operator',
      type: 'alias',
      value: 'main_operator',
      availability: 'Business hours and emergency escalation rota',
      priority: 1,
      notes:
        'Resolve this alias to an approved phone number or SIP URI in the connected telephony provider.',
    },
  ],
  rules: [
    {
      id: 'caller_requests_person',
      label: 'Caller asks for a person',
      enabled: true,
      priority: 1,
      destinationId: 'main_operator',
      transferType: 'provider_default',
      reasonCode: 'HUMAN_REQUESTED',
      condition:
        'Transfer when the caller explicitly asks to speak to a person, repeats that request, or rejects automated help.',
      clientMessage: "I'll connect you with a member of the team who can help from here.",
      operatorMessage:
        'Caller requested a person. Review the live transcript and summary in Quantum Parks before taking action.',
    },
  ],
  fallback: {
    type: 'callback',
    destinationId: 'main_operator',
    instructions:
      'If transfer cannot be completed, offer to create a callback task with the caller name, phone number, and reason for contact.',
  },
  copilotContext:
    'Draft concise escalation rules for a provider-neutral ElevenLabs transfer_to_number setup. Quantum Parks owns approved policy; ElevenLabs executes the live transfer through the connected telephony provider.',
};

const allowedDestinationTypes = new Set<TransferDestinationType>(['alias', 'phone', 'sip_uri']);
const allowedTransferTypes = new Set<TransferType>([
  'provider_default',
  'conference',
  'blind',
  'sip_refer',
]);
const allowedFallbackTypes = new Set<TransferFallbackType>([
  'callback',
  'voicemail',
  'message_only',
]);

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
    transferConfiguration: normaliseTransferConfiguration(status.transferConfiguration),
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
    transferConfiguration: normaliseTransferConfiguration(values.transferConfiguration),
  };
}

export function normaliseTransferConfiguration(
  value: Partial<TransferConfiguration> | null | undefined,
): TransferConfiguration {
  if (!value || typeof value !== 'object') return cloneDefaultTransferConfiguration();
  const defaults = cloneDefaultTransferConfiguration();
  const parsedDestinations = Array.isArray(value.destinations)
    ? value.destinations
        .map((destination, index) => ({
          id: cleanIdentifier(destination.id) || `destination_${index + 1}`,
          label: cleanText(destination.label) || `Destination ${index + 1}`,
          type: isDestinationType(destination.type) ? destination.type : 'alias',
          value:
            cleanText(destination.value) ||
            cleanIdentifier(destination.id) ||
            `destination_${index + 1}`,
          availability: cleanText(destination.availability) || 'Availability not specified',
          priority: cleanPriority(destination.priority, index + 1),
          notes: cleanText(destination.notes),
        }))
        .slice(0, 12)
    : defaults.destinations;
  const destinations = parsedDestinations.length > 0 ? parsedDestinations : defaults.destinations;
  const destinationIds = new Set(destinations.map((destination) => destination.id));
  const defaultTransferType = isTransferType(value.defaultTransferType)
    ? value.defaultTransferType
    : defaults.defaultTransferType;
  const fallback = value.fallback ?? defaults.fallback;
  const fallbackDestination = destinationIds.has(fallback.destinationId ?? '')
    ? (fallback.destinationId ?? null)
    : (destinations[0]?.id ?? null);
  const parsedRules = Array.isArray(value.rules)
    ? value.rules
        .map((rule, index) => ({
          id: cleanIdentifier(rule.id) || `rule_${index + 1}`,
          label: cleanText(rule.label) || `Rule ${index + 1}`,
          enabled: rule.enabled ?? true,
          priority: cleanPriority(rule.priority, index + 1),
          destinationId: destinationIds.has(rule.destinationId)
            ? rule.destinationId
            : (fallbackDestination ?? ''),
          transferType: isTransferType(rule.transferType) ? rule.transferType : defaultTransferType,
          reasonCode: cleanIdentifier(rule.reasonCode) || 'HUMAN_HANDOFF',
          condition: cleanText(rule.condition) || defaults.rules[0]!.condition,
          clientMessage: cleanText(rule.clientMessage) || defaults.rules[0]!.clientMessage,
          operatorMessage: cleanText(rule.operatorMessage) || defaults.rules[0]!.operatorMessage,
        }))
        .slice(0, 20)
    : defaults.rules;
  const rules = parsedRules.length > 0 ? parsedRules : defaults.rules;

  return {
    enabled: value.enabled ?? defaults.enabled,
    executionOwner: 'ELEVENLABS',
    transferTool: 'transfer_to_number',
    defaultTransferType,
    warmHandoffPreferred: value.warmHandoffPreferred ?? defaults.warmHandoffPreferred,
    preserveCallerIdPreferred:
      value.preserveCallerIdPreferred ?? defaults.preserveCallerIdPreferred,
    passConversationContext: value.passConversationContext ?? defaults.passConversationContext,
    destinations,
    rules,
    fallback: {
      type: isFallbackType(fallback.type) ? fallback.type : defaults.fallback.type,
      destinationId: fallbackDestination,
      instructions: cleanText(fallback.instructions) || defaults.fallback.instructions,
    },
    copilotContext: cleanText(value.copilotContext) || defaults.copilotContext,
  };
}

export function cloneDefaultTransferConfiguration(): TransferConfiguration {
  return JSON.parse(JSON.stringify(DEFAULT_TRANSFER_CONFIGURATION)) as TransferConfiguration;
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanIdentifier(value: unknown) {
  return cleanText(value)
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function cleanPriority(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(Math.round(value), 99)
    : fallback;
}

function isDestinationType(value: unknown): value is TransferDestinationType {
  return allowedDestinationTypes.has(value as TransferDestinationType);
}

function isTransferType(value: unknown): value is TransferType {
  return allowedTransferTypes.has(value as TransferType);
}

function isFallbackType(value: unknown): value is TransferFallbackType {
  return allowedFallbackTypes.has(value as TransferFallbackType);
}
