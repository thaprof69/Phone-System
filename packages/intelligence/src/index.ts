import { z } from 'zod';
import type { Result } from '@quantum-parks/domain';
import { failure, success } from '@quantum-parks/domain';

const ClaimSchema = z
  .object({
    text: z.string().min(1),
    evidence_ids: z.array(z.string()).min(1),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();
export const SummarySchema = z
  .object({
    purpose: ClaimSchema,
    caller_requests: z.array(ClaimSchema),
    information_provided: z.array(ClaimSchema),
    confirmed_actions: z
      .array(ClaimSchema.extend({ result_status: z.literal('SUCCESS') }))
      .max(0, 'Model output cannot establish completed business actions'),
    unconfirmed_requests: z.array(ClaimSchema),
    unresolved_items: z.array(ClaimSchema),
    handoff: z
      .object({
        status: z.enum(['REQUESTED', 'COMPLETED', 'FAILED', 'CALLBACK_CREATED']),
        evidence_ids: z.array(z.string()).min(1),
      })
      .strict()
      .nullable(),
    quality_flags: z.array(z.string()).default([]),
    evidence_coverage: z.number().min(0).max(1),
  })
  .strict();

export const ClassificationSchema = z
  .object({
    primary_intent: z.string().min(1),
    secondary_intents: z.array(z.string()),
    park: z.string().nullable(),
    language: z.string().min(2),
    sensitive: z.boolean(),
    sentiment_indicator: z
      .object({ label: z.string(), confidence: z.number().min(0).max(1) })
      .strict()
      .nullable(),
    evidence_ids: z.array(z.string()).min(1),
  })
  .strict();

/**
 * Evidence, not a decision: every field is an observation the model is allowed to make about
 * an interaction (any channel — phone, WhatsApp, email, chat), never a business decision. There
 * is deliberately no `recommended_route` or `proposed_action` field — routing and action planning
 * are computed downstream by deterministic engines from `possible_routes`/`risk_signals`, never
 * chosen by the model itself.
 */
const EvidenceItemSchema = z
  .object({
    text: z.string().min(1),
    evidence_ids: z.array(z.string()).min(1),
  })
  .strict();
const EntityEvidenceItemSchema = EvidenceItemSchema.extend({
  entity_type: z.string().min(1),
});
export const InteractionEvidenceSchema = z
  .object({
    intent: z.string().min(1),
    entities: z.array(EntityEvidenceItemSchema),
    sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE']),
    urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    requested_actions: z.array(EvidenceItemSchema),
    knowledge_requests: z.array(EvidenceItemSchema),
    possible_routes: z.array(EvidenceItemSchema),
    risk_signals: z.array(EvidenceItemSchema),
    confidence: z.number().min(0).max(1),
    evidence_ids: z.array(z.string()).min(1),
  })
  .strict();

export type Summary = z.infer<typeof SummarySchema>;
export type Classification = z.infer<typeof ClassificationSchema>;
export type InteractionEvidence = z.infer<typeof InteractionEvidenceSchema>;
export interface EnrichmentInput {
  turns: Array<{ id: string; speaker: string; content: string }>;
  languageHint?: string;
}
export interface EnrichmentOutput {
  summary: Summary;
  classification: Classification;
  provider: string;
  model: string;
  modelVersion?: string;
  promptVersion: string;
  schemaVersion: string;
}
export interface EnrichmentProvider {
  name: string;
  health(): Promise<Result<{ model: string; structuredOutputs: boolean }>>;
  enrich(input: EnrichmentInput): Promise<Result<EnrichmentOutput>>;
}

export class DeterministicLocalProvider implements EnrichmentProvider {
  readonly name = 'deterministic-local';
  async health() {
    return success({ model: 'deterministic-v1', structuredOutputs: true });
  }
  async enrich(input: EnrichmentInput): Promise<Result<EnrichmentOutput>> {
    const firstUser = input.turns.find((turn) => turn.speaker === 'user') ?? input.turns[0];
    if (!firstUser)
      return failure('VALIDATION_FAILED', 'EMPTY_TRANSCRIPT', 'The transcript has no usable turns');
    const lower = firstUser.content.toLowerCase();
    const sensitive = /(accident|injury|insurance|safeguard|acidente|ferimento|seguro)/i.test(
      lower,
    );
    const primaryIntent = /(hour|open|opening|horário|abertura)/i.test(lower)
      ? 'OPENING_HOURS'
      : /(price|preço|package|pacote)/i.test(lower)
        ? 'PRICING'
        : sensitive
          ? 'SENSITIVE_CASE'
          : 'GENERAL_INFORMATION';
    return success({
      summary: {
        purpose: { text: firstUser.content, evidence_ids: [firstUser.id], confidence: 1 },
        caller_requests: [{ text: firstUser.content, evidence_ids: [firstUser.id], confidence: 1 }],
        information_provided: [],
        confirmed_actions: [],
        unconfirmed_requests: [],
        unresolved_items: [],
        handoff: null,
        quality_flags: ['DETERMINISTIC_LOCAL_ENRICHMENT'],
        evidence_coverage: 1,
      },
      classification: {
        primary_intent: primaryIntent,
        secondary_intents: [],
        park: null,
        language: input.languageHint ?? 'und',
        sensitive,
        sentiment_indicator: null,
        evidence_ids: [firstUser.id],
      },
      provider: this.name,
      model: 'deterministic-v1',
      promptVersion: 'qp-enrichment-v1',
      schemaVersion: '1',
    });
  }
}

export async function enrichNonBlocking(
  provider: EnrichmentProvider,
  input: EnrichmentInput,
): Promise<
  | { state: 'COMPLETED'; output: EnrichmentOutput }
  | { state: 'PARTIAL'; retryable: boolean; reason: string }
> {
  const result = await provider.enrich(input);
  return result.status === 'SUCCESS'
    ? { state: 'COMPLETED', output: result.data }
    : { state: 'PARTIAL', retryable: result.error.retryable, reason: result.error.safeMessage };
}
