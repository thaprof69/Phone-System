/**
 * The AI provider definition registry.
 *
 * A provider is only usable when an adapter for it exists in `packages/aios-adapters`.
 * This file describes what each adapter needs and what it can do, so the connection
 * form is generated from the definition rather than hand-written around one vendor.
 *
 * Two rules keep this honest:
 *
 *  1. **`installed` reflects reality.** An entry is installed only when the adapter is
 *     genuinely present and reachable through `AiosPlatformService`. Everything else is
 *     listed so an operator can see it was considered, and reports "Adapter not
 *     installed" with no connect action — offering one would promise a capability the
 *     platform does not have.
 *  2. **Nothing here is invented.** Capabilities, regions and retention behaviour are
 *     recorded only where the provider documents them. Where a property is unknown it
 *     is absent, not guessed.
 */

export type ProviderSupport = 'SUPPORTED' | 'NON_PRODUCTION_ONLY' | 'UNSUPPORTED';

export type CredentialField = {
  name: string;
  label: string;
  /** `secret` is never echoed back to the browser once stored. */
  kind: 'secret' | 'text';
  required: boolean;
  hint: string;
  /** Applied server-side before the credential is tested. */
  pattern?: string;
  minLength?: number;
  maxLength?: number;
};

export type ProviderDefinition = {
  key: string;
  displayName: string;
  installed: boolean;
  support: ProviderSupport;
  description: string;
  credentialFields: CredentialField[];
  capabilities: {
    structuredOutput: boolean;
    embeddings: boolean;
    modelDiscovery: boolean;
    healthCheck: boolean;
  };
  /** Null where the provider does not let a caller pin a region. */
  regions: string[] | null;
  /** What the provider does with submitted data, as documented by the provider. */
  retention: string;
  /** Everything that must be true before this provider may serve production traffic. */
  productionRequirements: string[];
  /** Why it cannot be connected, when it cannot. */
  unavailableReason?: string;
};

const OPENAI_KEY_FIELD: CredentialField = {
  name: 'apiKey',
  label: 'API key',
  kind: 'secret',
  required: true,
  hint: 'Validated against the provider before it is stored. Never returned to the browser.',
  minLength: 20,
  maxLength: 512,
};

export const PROVIDER_DEFINITIONS: readonly ProviderDefinition[] = [
  {
    key: 'OPENAI',
    displayName: 'OpenAI',
    installed: true,
    support: 'SUPPORTED',
    description:
      'The first installed production-grade adapter. Uses the Responses API with strict JSON schema output and store disabled.',
    credentialFields: [
      OPENAI_KEY_FIELD,
      {
        name: 'organizationReference',
        label: 'Organisation reference',
        kind: 'text',
        required: false,
        hint: 'Optional. Recorded for attribution; not sent to the provider.',
        minLength: 2,
        maxLength: 200,
      },
      {
        name: 'approvedDataRegion',
        label: 'Approved data region',
        kind: 'text',
        required: false,
        hint: 'The region a reviewer has approved for this connection.',
        minLength: 2,
        maxLength: 100,
      },
    ],
    capabilities: {
      structuredOutput: true,
      embeddings: true,
      modelDiscovery: true,
      healthCheck: true,
    },
    regions: null,
    retention:
      'Requests are sent with store disabled, so the provider is asked not to retain them.',
    productionRequirements: [
      'A credential validated against the provider and stored encrypted',
      'At least one model approved for production',
      'An approved data region recorded on the connection',
      'A recorded retention decision',
      'A passing evaluation for every production capability',
    ],
  },
  {
    key: 'SIMULATOR',
    displayName: 'Deterministic simulator',
    installed: true,
    support: 'NON_PRODUCTION_ONLY',
    description:
      'Deterministic adapter used for local development and acceptance testing. It can reproduce every failure state the orchestrator handles.',
    credentialFields: [],
    capabilities: {
      structuredOutput: true,
      embeddings: false,
      modelDiscovery: true,
      healthCheck: true,
    },
    regions: ['eu-simulator'],
    retention: 'Nothing leaves this platform; the simulator runs in-process.',
    productionRequirements: [
      'Cannot serve production. A simulator in a production path is a readiness blocker by design.',
    ],
  },
  // Listed so an operator can see they were considered. No adapter exists for any of
  // them, so there is deliberately no connect action.
  {
    key: 'ANTHROPIC',
    displayName: 'Anthropic',
    installed: false,
    support: 'UNSUPPORTED',
    description: 'No adapter is installed for this provider.',
    credentialFields: [],
    capabilities: {
      structuredOutput: false,
      embeddings: false,
      modelDiscovery: false,
      healthCheck: false,
    },
    regions: null,
    retention: 'Not applicable while no adapter is installed.',
    productionRequirements: ['An adapter must be built and installed first'],
    unavailableReason: 'Adapter not installed.',
  },
  {
    key: 'GOOGLE_GEMINI',
    displayName: 'Google Gemini',
    installed: false,
    support: 'UNSUPPORTED',
    description: 'No adapter is installed for this provider.',
    credentialFields: [],
    capabilities: {
      structuredOutput: false,
      embeddings: false,
      modelDiscovery: false,
      healthCheck: false,
    },
    regions: null,
    retention: 'Not applicable while no adapter is installed.',
    productionRequirements: ['An adapter must be built and installed first'],
    unavailableReason: 'Adapter not installed.',
  },
  {
    key: 'AZURE_OPENAI',
    displayName: 'Azure OpenAI',
    installed: false,
    support: 'UNSUPPORTED',
    description: 'No adapter is installed for this provider.',
    credentialFields: [],
    capabilities: {
      structuredOutput: false,
      embeddings: false,
      modelDiscovery: false,
      healthCheck: false,
    },
    regions: null,
    retention: 'Not applicable while no adapter is installed.',
    productionRequirements: ['An adapter must be built and installed first'],
    unavailableReason: 'Adapter not installed.',
  },
  {
    key: 'AWS_BEDROCK',
    displayName: 'AWS Bedrock',
    installed: false,
    support: 'UNSUPPORTED',
    description: 'No adapter is installed for this provider.',
    credentialFields: [],
    capabilities: {
      structuredOutput: false,
      embeddings: false,
      modelDiscovery: false,
      healthCheck: false,
    },
    regions: null,
    retention: 'Not applicable while no adapter is installed.',
    productionRequirements: ['An adapter must be built and installed first'],
    unavailableReason: 'Adapter not installed.',
  },
  {
    key: 'OPENAI_COMPATIBLE',
    displayName: 'OpenAI-compatible endpoint',
    installed: false,
    support: 'UNSUPPORTED',
    description: 'No adapter is installed for this provider.',
    credentialFields: [],
    capabilities: {
      structuredOutput: false,
      embeddings: false,
      modelDiscovery: false,
      healthCheck: false,
    },
    regions: null,
    retention: 'Not applicable while no adapter is installed.',
    productionRequirements: ['An adapter must be built and installed first'],
    unavailableReason: 'Adapter not installed.',
  },
] as const;

/** Provider keys that can actually be connected. Drives the API contract. */
export const CONNECTABLE_PROVIDER_KEYS = PROVIDER_DEFINITIONS.filter(
  (definition) => definition.installed && definition.credentialFields.length > 0,
).map((definition) => definition.key);

export function findProviderDefinition(key: string): ProviderDefinition | undefined {
  return PROVIDER_DEFINITIONS.find((definition) => definition.key === key);
}

export type CredentialValidationIssue = { field: string; message: string };

/**
 * Validates a submitted credential payload against the provider's own field
 * definitions. Server-side, so a browser cannot post a shape the provider never
 * declared.
 */
export function validateCredentialPayload(
  key: string,
  payload: Record<string, unknown>,
): { valid: true } | { valid: false; issues: CredentialValidationIssue[] } {
  const definition = findProviderDefinition(key);
  if (!definition) {
    return { valid: false, issues: [{ field: 'providerKey', message: 'Unknown provider' }] };
  }
  if (!definition.installed) {
    return {
      valid: false,
      issues: [
        {
          field: 'providerKey',
          message: definition.unavailableReason ?? 'Adapter not installed.',
        },
      ],
    };
  }

  const issues: CredentialValidationIssue[] = [];
  for (const field of definition.credentialFields) {
    const value = payload[field.name];
    if (value === undefined || value === null || value === '') {
      if (field.required) issues.push({ field: field.name, message: `${field.label} is required` });
      continue;
    }
    if (typeof value !== 'string') {
      issues.push({ field: field.name, message: `${field.label} must be text` });
      continue;
    }
    if (field.minLength !== undefined && value.length < field.minLength) {
      issues.push({
        field: field.name,
        message: `${field.label} must be at least ${field.minLength} characters`,
      });
    }
    if (field.maxLength !== undefined && value.length > field.maxLength) {
      issues.push({
        field: field.name,
        message: `${field.label} must be at most ${field.maxLength} characters`,
      });
    }
    if (field.pattern && !new RegExp(field.pattern).test(value)) {
      issues.push({ field: field.name, message: `${field.label} is not in the expected format` });
    }
  }

  // Fields the provider never declared are rejected rather than ignored, so a stray
  // key cannot be quietly persisted alongside a credential.
  const declared = new Set(definition.credentialFields.map((field) => field.name));
  for (const supplied of Object.keys(payload)) {
    if (!declared.has(supplied)) {
      issues.push({ field: supplied, message: 'This provider does not accept that field' });
    }
  }

  return issues.length > 0 ? { valid: false, issues } : { valid: true };
}
