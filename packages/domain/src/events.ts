import { z } from 'zod';
import { DataClassificationSchema } from './states.js';

export const DomainEventEnvelopeSchema = z
  .object({
    event_id: z.uuid(),
    schema_version: z.int().positive(),
    event_type: z.string().min(1),
    aggregate_type: z.string().min(1),
    aggregate_id: z.string().min(1),
    call_id: z.string().nullable().optional(),
    correlation_id: z.string().min(1),
    causation_id: z.string().nullable().optional(),
    occurred_at: z.iso.datetime(),
    recorded_at: z.iso.datetime(),
    actor: z
      .object({
        type: z.enum(['USER', 'SYSTEM', 'PROVIDER', 'WORKFLOW']),
        id: z.string().nullable().optional(),
      })
      .strict(),
    purpose: z.string().min(1),
    data_classification: DataClassificationSchema,
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export type DomainEventEnvelope = z.infer<typeof DomainEventEnvelopeSchema>;
