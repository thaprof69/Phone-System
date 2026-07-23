import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import {
  callbackRequests,
  conversations,
  digitalLinks,
  staffTasks,
  toolInvocations,
  verificationSessions,
} from '@quantum-parks/db';
import {
  DeterministicBookingAdapter,
  DeterministicCustomerAdapter,
  DeterministicSupportAdapter,
} from '@quantum-parks/integrations';
import { runtimeSecret } from '@quantum-parks/config';
import { redactSensitiveToolInput } from '@quantum-parks/domain';
import { DatabaseService } from './database.service.js';

type ToolResult =
  | { status: string; data?: Record<string, unknown>; safe_message?: string }
  | Record<string, unknown>;
interface ToolDefinition {
  schema: z.ZodType;
  verification: 'NONE' | 'ESTABLISHES_STRONG' | 'STRONG' | 'OPERATOR_ONLY';
  writeLike: boolean;
  handler: (input: Record<string, unknown>, idempotencyKey?: string) => Promise<ToolResult>;
}

@Injectable()
export class ToolRegistryService {
  private readonly customers = new DeterministicCustomerAdapter();
  private readonly bookings = new DeterministicBookingAdapter();
  private readonly support = new DeterministicSupportAdapter();
  private readonly tools: Record<string, ToolDefinition>;

  constructor(private readonly database: DatabaseService) {
    const publicFact = z.object({ park: z.string().min(1), language: z.string().min(2) }).strict();
    const unavailableFact = async (): Promise<ToolResult> => ({
      status: 'NOT_CONFIGURED',
      safe_message:
        'Approved and effective company knowledge is not configured in this environment',
    });
    this.tools = {
      get_park_information: {
        schema: publicFact,
        verification: 'NONE',
        writeLike: false,
        handler: unavailableFact,
      },
      get_opening_hours: {
        schema: publicFact.extend({ date: z.string().min(8) }).strict(),
        verification: 'NONE',
        writeLike: false,
        handler: unavailableFact,
      },
      get_rules_and_age_requirements: {
        schema: publicFact,
        verification: 'NONE',
        writeLike: false,
        handler: unavailableFact,
      },
      get_packages_and_pricing: {
        schema: publicFact,
        verification: 'NONE',
        writeLike: false,
        handler: unavailableFact,
      },
      lookup_customer: {
        schema: z.object({ caller_id: z.string() }).strict(),
        verification: 'NONE',
        writeLike: false,
        handler: async (input) => this.customers.matchCaller(String(input.caller_id)),
      },
      verify_customer: {
        schema: z
          .object({
            conversation_id: z.uuid(),
            customer_id: z.string(),
            otp: z.string(),
            booking_reference: z.string(),
          })
          .strict(),
        verification: 'ESTABLISHES_STRONG',
        writeLike: false,
        handler: async (input) => {
          const verified = await this.customers.verify(String(input.customer_id), {
            otp: String(input.otp),
            booking_reference: String(input.booking_reference),
          });
          if (verified.status !== 'SUCCESS') return verified;
          const now = new Date();
          const [session] = await this.database.db
            .insert(verificationSessions)
            .values({
              conversationId: String(input.conversation_id),
              level: 'STRONG',
              state: 'VERIFIED_STRONG',
              factors: { methods: ['OTP', 'BOOKING_REFERENCE'], secretsStored: false },
              expiresAt: new Date(now.getTime() + 15 * 60_000),
              completedAt: now,
            })
            .returning({ id: verificationSessions.id, expiresAt: verificationSessions.expiresAt });
          return session
            ? {
                status: 'SUCCESS',
                data: {
                  verification_id: session.id,
                  level: 'STRONG',
                  expires_at: session.expiresAt.toISOString(),
                },
              }
            : {
                status: 'TEMPORARILY_UNAVAILABLE',
                safe_message: 'Verification evidence could not be persisted',
              };
        },
      },
      get_upcoming_bookings: {
        schema: z
          .object({
            conversation_id: z.uuid(),
            customer_id: z.string(),
            verification_id: z.uuid(),
          })
          .strict(),
        verification: 'STRONG',
        writeLike: false,
        handler: async (input) => this.bookings.getUpcoming(String(input.customer_id)),
      },
      get_recent_support_context: {
        schema: z
          .object({
            conversation_id: z.uuid(),
            customer_id: z.string(),
            verification_id: z.uuid(),
          })
          .strict(),
        verification: 'STRONG',
        writeLike: false,
        handler: async (input) => this.support.getRecent(String(input.customer_id)),
      },
      check_read_only_availability: {
        schema: z.object({ park: z.string(), activity: z.string(), date: z.string() }).strict(),
        verification: 'NONE',
        writeLike: false,
        handler: async (input) =>
          this.bookings.checkAvailability(
            String(input.park),
            String(input.activity),
            String(input.date),
          ),
      },
      create_registration_link: {
        schema: z.object({ conversation_id: z.uuid(), language: z.string() }).strict(),
        verification: 'NONE',
        writeLike: true,
        handler: (input) => this.createDigitalLink(input, 'CUSTOMER_REGISTRATION'),
      },
      create_booking_link: {
        schema: z
          .object({ conversation_id: z.uuid(), park: z.string(), language: z.string() })
          .strict(),
        verification: 'NONE',
        writeLike: true,
        handler: (input) => this.createDigitalLink(input, 'BOOKING_PAGE'),
      },
      create_staff_task: {
        schema: z
          .object({
            conversation_id: z.uuid(),
            reason: z.string(),
            priority: z.enum(['NORMAL', 'URGENT']),
          })
          .strict(),
        verification: 'OPERATOR_ONLY',
        writeLike: true,
        handler: async (input, idempotencyKey) => {
          const [task] = await this.database.db
            .insert(staffTasks)
            .values({
              conversationId: String(input.conversation_id),
              idempotencyKey: idempotencyKey!,
              reason: String(input.reason),
              priority: String(input.priority),
              status: 'OPEN',
            })
            .returning({ id: staffTasks.id, status: staffTasks.status });
          return task
            ? { status: 'SUCCESS', data: { task_id: task.id, lifecycle: task.status } }
            : { status: 'FAILED', safe_message: 'The staff task was not created' };
        },
      },
      request_callback: {
        schema: z
          .object({
            conversation_id: z.uuid(),
            reason: z.string(),
            priority: z.enum(['NORMAL', 'URGENT']),
            verification_id: z.uuid(),
          })
          .strict(),
        verification: 'STRONG',
        writeLike: true,
        handler: async (input, idempotencyKey) => {
          const [callback] = await this.database.db
            .insert(callbackRequests)
            .values({
              conversationId: String(input.conversation_id),
              idempotencyKey: idempotencyKey!,
              reason: String(input.reason),
              priority: String(input.priority),
              status: 'OPEN',
            })
            .returning({ id: callbackRequests.id, status: callbackRequests.status });
          return callback
            ? { status: 'SUCCESS', data: { callback_id: callback.id, lifecycle: callback.status } }
            : { status: 'FAILED', safe_message: 'The callback request was not created' };
        },
      },
      record_preferred_language: {
        schema: z
          .object({
            conversation_id: z.uuid(),
            customer_id: z.string(),
            language: z.string(),
            verification_id: z.uuid(),
          })
          .strict(),
        verification: 'STRONG',
        writeLike: true,
        handler: async () => ({
          status: 'NOT_CONFIGURED',
          safe_message: 'The customer write integration is not configured',
        }),
      },
      prepare_handoff_context: {
        schema: z
          .object({
            conversation_id: z.uuid(),
            park: z.string().nullable(),
            language: z.string(),
            intent: z.string(),
            verification_state: z.string(),
          })
          .strict(),
        verification: 'NONE',
        writeLike: false,
        handler: async (input) => ({ status: 'SUCCESS', data: input }),
      },
    };
  }

  authenticate(header?: string) {
    try {
      return header === `Bearer ${runtimeSecret('LOCAL_TOOL_TOKEN', 'synthetic-tool-token')}`;
    } catch {
      return false;
    }
  }

  async personalize(callerId: string, conversationId: string) {
    if (process.env.QP_ENVIRONMENT === 'production')
      return {
        match_state: 'NOT_CONFIGURED',
        dynamic_variables: {},
        conversation_id: conversationId,
      };
    const match = await this.customers.matchCaller(callerId);
    if (match.status !== 'UNIQUE_MATCH')
      return { match_state: match.status, dynamic_variables: {}, conversation_id: conversationId };
    return {
      match_state: match.status,
      dynamic_variables: {
        preferred_language: match.preferredLanguage,
        likely_park: match.likelyPark,
        customer_status: 'KNOWN_UNVERIFIED',
      },
      conversation_id: conversationId,
      protected_context_disclosed: false,
    };
  }

  async invoke(toolKey: string, body: unknown, idempotencyKey?: string) {
    const definition = this.tools[toolKey];
    if (!definition)
      return { status: 'NOT_SUPPORTED', safe_message: 'The requested tool is not registered' };
    const parsed = definition.schema.safeParse(body);
    if (!parsed.success)
      return { status: 'VALIDATION_FAILED', safe_message: 'Tool arguments are invalid' };
    if (definition.writeLike && !idempotencyKey)
      return { status: 'VALIDATION_FAILED', safe_message: 'An idempotency key is required' };

    if (idempotencyKey) {
      const existing = await this.database.db.query.toolInvocations.findFirst({
        where: eq(toolInvocations.providerRequestId, idempotencyKey),
      });
      if (existing) return existing.result;
    }
    const input = parsed.data as Record<string, unknown>;
    const conversationId =
      typeof input.conversation_id === 'string' ? input.conversation_id : undefined;
    if (conversationId) {
      const conversation = await this.database.db.query.conversations.findFirst({
        where: eq(conversations.id, conversationId),
      });
      if (!conversation)
        return { status: 'NOT_FOUND', safe_message: 'The canonical conversation is not available' };
    }
    if (
      process.env.QP_ENVIRONMENT === 'production' &&
      [
        'lookup_customer',
        'verify_customer',
        'get_upcoming_bookings',
        'get_recent_support_context',
        'check_read_only_availability',
      ].includes(toolKey)
    )
      return {
        status: 'NOT_CONFIGURED',
        safe_message: 'The production business-system adapter is not configured',
      };
    if (definition.verification === 'STRONG') {
      const verificationId =
        typeof input.verification_id === 'string' ? input.verification_id : undefined;
      if (!conversationId || !verificationId)
        return {
          status: 'VERIFICATION_REQUIRED',
          safe_message: 'Strong verification is required for this operation',
        };
      const session = await this.database.db.query.verificationSessions.findFirst({
        where: and(
          eq(verificationSessions.id, verificationId),
          eq(verificationSessions.conversationId, conversationId),
          eq(verificationSessions.state, 'VERIFIED_STRONG'),
          gt(verificationSessions.expiresAt, new Date()),
        ),
      });
      if (!session)
        return {
          status: 'VERIFICATION_REQUIRED',
          safe_message: 'Strong verification is missing, expired, or belongs to another call',
        };
    }
    try {
      const result = await definition.handler(input, idempotencyKey);
      if (conversationId) {
        await this.database.db.insert(toolInvocations).values({
          conversationId,
          registryKey: toolKey,
          registryVersion: 1,
          providerRequestId: idempotencyKey ?? null,
          request: redactSensitiveToolInput(input),
          resultStatus: typeof result.status === 'string' ? result.status : 'UNKNOWN',
          result,
          verificationState:
            definition.verification === 'NONE'
              ? 'NOT_REQUIRED'
              : definition.verification === 'STRONG'
                ? 'VERIFIED_STRONG'
                : definition.verification === 'ESTABLISHES_STRONG'
                  ? result.status === 'SUCCESS'
                    ? 'VERIFIED_STRONG'
                    : 'FAILED'
                  : 'PENDING',
          requestedAt: new Date(),
          completedAt: new Date(),
        });
      }
      return result;
    } catch {
      return {
        status: 'TEMPORARILY_UNAVAILABLE',
        safe_message: 'The requested operation could not be persisted. No completion is claimed.',
      };
    }
  }

  private async createDigitalLink(
    input: Record<string, unknown>,
    purpose: 'CUSTOMER_REGISTRATION' | 'BOOKING_PAGE',
  ): Promise<ToolResult> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const [link] = await this.database.db
      .insert(digitalLinks)
      .values({
        conversationId: String(input.conversation_id),
        purpose,
        destinationKey:
          purpose === 'CUSTOMER_REGISTRATION'
            ? 'customer-web-registration'
            : 'official-booking-page',
        tokenHash,
        expiresAt,
      })
      .returning({ id: digitalLinks.id });
    if (!link) return { status: 'FAILED', safe_message: 'The secure link was not created' };
    return {
      status: 'SUCCESS',
      data: {
        link_id: link.id,
        path: purpose === 'CUSTOMER_REGISTRATION' ? `/handoff/${token}` : `/booking/${token}`,
        expires_at: expiresAt.toISOString(),
        capacity_held: false,
      },
    };
  }
}
