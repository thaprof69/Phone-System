import { z } from 'zod';

/**
 * The agent conversation contract.
 *
 * This is the shape of what the receptionist is instructed to do, and it is validated
 * here rather than in the interface. A browser can be bypassed; this cannot.
 *
 * Two rules are enforced structurally rather than by convention:
 *
 *  1. **Immutable policy fragments are code-owned.** They are not stored as editable
 *     text that an operator could weaken. They are re-applied from this module on
 *     every save, so a draft cannot ship without them regardless of what was posted.
 *  2. **Provider-supported settings are bounded.** Turn and timeout values outside the
 *     ranges the voice runtime accepts are rejected at save rather than discovered at
 *     publication, when a caller is already on the line.
 */

/* ------------------------------------------------------- immutable policy */

/**
 * Safety instructions that every published agent carries. These exist because of the
 * hallucination and payment boundaries in AGENTS.md: the assistant must disclose that
 * it is automated, must not take payment details, and must never claim it completed an
 * action it did not perform.
 *
 * Editing these requires a separate privileged permission and produces an ADR-worthy
 * change; ordinary agent authors cannot alter them.
 */
export const IMMUTABLE_POLICY_FRAGMENTS = [
  'Disclose on the first turn that this call is handled by an automated assistant.',
  'Answer only from approved knowledge. If the answer is not in approved knowledge, say so and offer a callback.',
  'Never request, accept, confirm or repeat payment card details. Transfer instead.',
  'Never state that a booking, refund, payment or account change has been completed.',
  'Never disclose protected customer details before verification has succeeded.',
  'In a sensitive interaction, do not make commercial offers.',
] as const;

export type ImmutablePolicyFragment = (typeof IMMUTABLE_POLICY_FRAGMENTS)[number];

/* -------------------------------------------------- provider-supported ranges */

/**
 * Bounds the voice runtime accepts. Values are validated against these rather than
 * assumed, so an out-of-range setting fails at save with a message the author can act
 * on instead of failing at publish.
 */
export const RUNTIME_BOUNDS = {
  silenceTimeoutMs: { minimum: 1_000, maximum: 30_000 },
  maximumTurnMs: { minimum: 5_000, maximum: 120_000 },
  maximumCallSeconds: { minimum: 60, maximum: 3_600 },
  responseDelayMs: { minimum: 0, maximum: 3_000 },
} as const;

/**
 * Settings this platform exposes but the voice runtime does not currently support.
 * They are surfaced with an explicit unsupported state rather than silently dropped —
 * an operator setting something that has no effect is worse than being told it cannot.
 */
export const UNSUPPORTED_RUNTIME_SETTINGS = [
  {
    key: 'bargeInSensitivity',
    label: 'Barge-in sensitivity',
    reason: 'The provider exposes interruption as a boolean, not a sensitivity level.',
  },
  {
    key: 'backchannelling',
    label: 'Backchannel acknowledgements',
    reason: 'Not offered by the provider runtime API.',
  },
] as const;

export const LANGUAGE_CODES = ['en', 'pt', 'es', 'fr', 'de', 'it', 'nl'] as const;
export const LanguageCodeSchema = z.enum(LANGUAGE_CODES);
export type LanguageCode = z.infer<typeof LanguageCodeSchema>;

/* ------------------------------------------------------------- the contract */

export const TransferRouteSchema = z
  .object({
    routeKey: z
      .string()
      .trim()
      .min(2)
      .max(60)
      // Route keys are referenced by tests and evidence, so they stay machine-safe.
      .regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers and underscores only'),
    park: z.string().trim().min(2).max(40).nullable(),
    language: LanguageCodeSchema.nullable(),
    intent: z.string().trim().min(2).max(60),
    target: z.string().trim().min(2).max(80),
    fallback: z.enum(['callback', 'voicemail', 'none']),
    callbackPolicy: z.enum(['ALWAYS', 'IF_UNANSWERED', 'NEVER']),
    slaSeconds: z.number().int().min(30).max(86_400),
    operatingHours: z
      .object({
        opensAt: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
        closesAt: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
        days: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).min(1),
      })
      .strict(),
    sensitive: z.boolean(),
    environments: z.array(z.enum(['development', 'staging', 'production'])).min(1),
    enabled: z.boolean(),
    priority: z.number().int().min(0).max(999),
  })
  .strict();

export type TransferRoute = z.infer<typeof TransferRouteSchema>;

export const AgentConversationConfigurationSchema = z
  .object({
    /** Editable business framing. The safety fragments are appended by the platform. */
    systemPrompt: z.string().trim().min(20).max(8_000),
    businessInstructions: z.string().trim().max(8_000).default(''),
    /** Re-applied from code on every save; present here so it is reviewable in a diff. */
    policyFragments: z.array(z.string()).default([...IMMUTABLE_POLICY_FRAGMENTS]),

    firstMessage: z.string().trim().min(10).max(500),
    disclosure: z.string().trim().min(10).max(500),
    closingMessage: z.string().trim().min(5).max(500),

    afterHours: z
      .object({
        enabled: z.boolean(),
        message: z.string().trim().min(10).max(500),
        offerCallback: z.boolean(),
      })
      .strict(),

    turnSettings: z
      .object({
        silenceTimeoutMs: z
          .number()
          .int()
          .min(RUNTIME_BOUNDS.silenceTimeoutMs.minimum)
          .max(RUNTIME_BOUNDS.silenceTimeoutMs.maximum),
        maximumTurnMs: z
          .number()
          .int()
          .min(RUNTIME_BOUNDS.maximumTurnMs.minimum)
          .max(RUNTIME_BOUNDS.maximumTurnMs.maximum),
        maximumCallSeconds: z
          .number()
          .int()
          .min(RUNTIME_BOUNDS.maximumCallSeconds.minimum)
          .max(RUNTIME_BOUNDS.maximumCallSeconds.maximum),
        responseDelayMs: z
          .number()
          .int()
          .min(RUNTIME_BOUNDS.responseDelayMs.minimum)
          .max(RUNTIME_BOUNDS.responseDelayMs.maximum),
        interruptible: z.boolean(),
      })
      .strict(),

    defaultLanguage: LanguageCodeSchema,
    languages: z.array(LanguageCodeSchema).min(1),

    tools: z.array(z.string().trim().min(2)).default([]),
    transfers: z.array(TransferRouteSchema).default([]),
  })
  .strict()
  .superRefine((configuration, context) => {
    if (!configuration.languages.includes(configuration.defaultLanguage)) {
      context.addIssue({
        code: 'custom',
        path: ['defaultLanguage'],
        message: 'The default language must be one of the supported languages',
      });
    }
    // A shorter maximum turn than the silence timeout means the turn can never
    // complete: the agent would be cut off before the caller's pause registers.
    if (configuration.turnSettings.maximumTurnMs <= configuration.turnSettings.silenceTimeoutMs) {
      context.addIssue({
        code: 'custom',
        path: ['turnSettings', 'maximumTurnMs'],
        message: 'Maximum turn length must be greater than the silence timeout',
      });
    }
    const routeKeys = configuration.transfers.map((route) => route.routeKey);
    if (new Set(routeKeys).size !== routeKeys.length) {
      context.addIssue({
        code: 'custom',
        path: ['transfers'],
        message: 'Transfer route keys must be unique',
      });
    }
    for (const [index, route] of configuration.transfers.entries()) {
      if (route.language && !configuration.languages.includes(route.language)) {
        context.addIssue({
          code: 'custom',
          path: ['transfers', index, 'language'],
          message: `Route targets ${route.language}, which this agent does not support`,
        });
      }
    }
  });

export type AgentConversationConfiguration = z.infer<typeof AgentConversationConfigurationSchema>;

/* ------------------------------------------------------------------ helpers */

export type ConfigurationIssue = { path: string; message: string };

export type ConfigurationValidation =
  | { valid: true; configuration: AgentConversationConfiguration }
  | { valid: false; issues: ConfigurationIssue[] };

/**
 * Validates a posted configuration and reinstates the code-owned policy fragments.
 *
 * "Immutable" is enforced literally: the mandatory fragments are always present in the
 * result, in order, regardless of what was posted. No role can remove or reword them —
 * a permission to weaken the payment or false-completion boundary is not a permission
 * this platform grants to anyone, because a draft that omitted one would otherwise
 * reach review looking legitimate.
 *
 * `allowAdditionalFragments` lets a privileged role *append* further instructions. That
 * can only ever make the policy stricter.
 */
export function validateAgentConfiguration(
  input: unknown,
  options: { allowAdditionalFragments?: boolean } = {},
): ConfigurationValidation {
  const parsed = AgentConversationConfigurationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  const mandatory = [...IMMUTABLE_POLICY_FRAGMENTS] as string[];
  const additional = options.allowAdditionalFragments
    ? parsed.data.policyFragments.filter((fragment) => !mandatory.includes(fragment))
    : [];

  return {
    valid: true,
    configuration: { ...parsed.data, policyFragments: [...mandatory, ...additional] },
  };
}

/**
 * True when a submitted configuration tried to remove or reword a mandatory fragment.
 * Adding a fragment is not an override — it only tightens the policy.
 */
export function attemptsPolicyOverride(input: unknown): boolean {
  if (typeof input !== 'object' || input === null) return false;
  const fragments = (input as { policyFragments?: unknown }).policyFragments;
  if (!Array.isArray(fragments)) return false;
  return IMMUTABLE_POLICY_FRAGMENTS.some((mandatory) => !fragments.includes(mandatory));
}

/**
 * The prompt actually sent to the voice runtime: business framing first, then the
 * code-owned safety instructions, which always come last so they cannot be overridden
 * by preceding text.
 */
export function composeRuntimePrompt(configuration: AgentConversationConfiguration): string {
  return [
    configuration.systemPrompt.trim(),
    configuration.businessInstructions.trim(),
    '',
    'Safety policy (non-negotiable):',
    ...configuration.policyFragments.map((fragment) => `- ${fragment}`),
  ]
    .filter((line, index, all) => !(line === '' && all[index - 1] === ''))
    .join('\n')
    .trim();
}
