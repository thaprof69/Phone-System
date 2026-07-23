import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const TranscriptTurnSchema = z.looseObject({
  role: z.enum(['agent', 'user', 'system', 'tool']),
  message: z.string().optional(),
  time_in_call_secs: z.number().nonnegative().optional(),
  tool_calls: z.array(z.unknown()).optional(),
  tool_results: z.array(z.unknown()).optional(),
});

export const PostCallWebhookSchema = z.looseObject({
  type: z.enum(['post_call_transcription', 'call_initiation_failure']),
  event_timestamp: z.union([z.number().int().positive(), z.string().min(1)]),
  data: z.looseObject({
    agent_id: z.string().min(1),
    conversation_id: z.string().min(1),
    status: z.string().optional(),
    branch_id: z.string().nullable().optional(),
    version_id: z.string().nullable().optional(),
    environment: z.string().nullable().optional(),
    transcript: z.array(TranscriptTurnSchema).default([]),
    metadata: z.record(z.string(), z.unknown()).default({}),
    analysis: z.record(z.string(), z.unknown()).nullable().optional(),
    conversation_initiation_client_data: z.record(z.string(), z.unknown()).nullable().optional(),
    has_audio: z.boolean().optional(),
    has_user_audio: z.boolean().optional(),
    has_response_audio: z.boolean().optional(),
  }),
});
export type PostCallWebhook = z.infer<typeof PostCallWebhookSchema>;

export interface SignatureVerification {
  valid: boolean;
  timestamp?: number;
  reason?: 'MISSING' | 'MALFORMED' | 'STALE' | 'MISMATCH';
}

export function signWebhook(
  rawBody: string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v0=${signature}`;
}

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): SignatureVerification {
  if (!signatureHeader) return { valid: false, reason: 'MISSING' };
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((part) => part.trim().split('=', 2)),
  );
  const timestamp = Number(parts.t);
  const signature = parts.v0;
  if (!Number.isInteger(timestamp) || !signature || !/^[a-f0-9]{64}$/i.test(signature)) {
    return { valid: false, reason: 'MALFORMED' };
  }
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return { valid: false, timestamp, reason: 'STALE' };
  }
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const suppliedBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const valid =
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer);
  return valid ? { valid: true, timestamp } : { valid: false, timestamp, reason: 'MISMATCH' };
}

export function parsePostCallWebhook(rawBody: string): PostCallWebhook {
  const parsed: unknown = JSON.parse(rawBody);
  return PostCallWebhookSchema.parse(parsed);
}
