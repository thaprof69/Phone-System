import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  conversations,
  providerConversations,
  providerWorkspaces,
  rawWebhookEvents,
  webhookInboxEntries,
} from '@quantum-parks/db';
import { parsePostCallWebhook, verifyWebhookSignature } from '@quantum-parks/elevenlabs';
import { runtimeSecret } from '@quantum-parks/config';
import { S3EvidenceStore } from '@quantum-parks/integrations';
import { DatabaseService } from './database.service.js';
import { WorkflowDispatchService } from './workflow-dispatch.service.js';

type AcceptResult =
  | { status: 'ACCEPTED'; inboxId: string; duplicate: boolean; processingQueued: boolean }
  | { status: 'UNAUTHORIZED' | 'REJECTED' | 'TEMPORARILY_UNAVAILABLE'; message: string };

function providerTimestamp(value: string | number): Date {
  if (typeof value === 'number') return new Date(value * 1_000);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? new Date(numeric * 1_000) : new Date(value);
}

@Injectable()
export class WebhookIngestionService {
  private readonly evidenceStore = new S3EvidenceStore(
    process.env.S3_BUCKET_RAW ?? 'qp-raw-evidence',
    {
      ...(process.env.S3_ENDPOINT
        ? { endpoint: process.env.S3_ENDPOINT }
        : process.env.QP_ENVIRONMENT === 'production'
          ? {}
          : { endpoint: 'http://localhost:9000' }),
      region: process.env.S3_REGION ?? 'eu-west-1',
      ...(process.env.S3_ACCESS_KEY ? { accessKeyId: process.env.S3_ACCESS_KEY } : {}),
      ...(process.env.S3_SECRET_KEY ? { secretAccessKey: process.env.S3_SECRET_KEY } : {}),
      ...(process.env.S3_KMS_KEY_ID ? { kmsKeyId: process.env.S3_KMS_KEY_ID } : {}),
    },
  );

  constructor(
    private readonly database: DatabaseService,
    private readonly workflows: WorkflowDispatchService,
  ) {}

  async accept(
    rawBody: Buffer,
    signature: string | undefined,
    providerWorkspaceId: string | undefined,
  ): Promise<AcceptResult> {
    if (rawBody.byteLength > 1_048_576)
      return { status: 'REJECTED', message: 'Webhook payload exceeds the permitted size' };
    if (!providerWorkspaceId)
      return { status: 'UNAUTHORIZED', message: 'Provider workspace is required' };

    const rawText = rawBody.toString('utf8');
    const secret = runtimeSecret('LOCAL_ELEVENLABS_WEBHOOK_SECRET', 'synthetic-webhook-secret');
    const verification = verifyWebhookSignature(rawText, signature, secret);
    if (!verification.valid)
      return {
        status: 'UNAUTHORIZED',
        message: `Webhook signature rejected: ${verification.reason}`,
      };

    let event;
    try {
      event = parsePostCallWebhook(rawText);
    } catch {
      return { status: 'REJECTED', message: 'Webhook payload is malformed' };
    }
    const workspace = await this.database.db.query.providerWorkspaces.findFirst({
      where: eq(providerWorkspaces.providerWorkspaceId, providerWorkspaceId),
    });
    if (!workspace) return { status: 'UNAUTHORIZED', message: 'Provider workspace is not mapped' };

    const eventAt = providerTimestamp(event.event_timestamp);
    if (Number.isNaN(eventAt.getTime()))
      return { status: 'REJECTED', message: 'Provider event timestamp is invalid' };
    const idempotencyKey = `${workspace.id}:${event.type}:${event.data.conversation_id}:${eventAt.toISOString()}`;
    const existingInbox = await this.database.db.query.webhookInboxEntries.findFirst({
      where: eq(webhookInboxEntries.idempotencyKey, idempotencyKey),
    });
    if (existingInbox)
      return {
        status: 'ACCEPTED',
        inboxId: existingInbox.id,
        duplicate: true,
        processingQueued: Boolean(existingInbox.workflowId),
      };

    const digest = createHash('sha256').update(rawBody).digest('hex');
    const objectKey = `elevenlabs/${providerWorkspaceId}/${event.data.conversation_id}/${eventAt.toISOString()}-${digest}.json`;
    const stored = await this.evidenceStore.putImmutable(
      objectKey,
      rawBody,
      'application/json',
      'RESTRICTED',
    );
    if (stored.status !== 'SUCCESS')
      return { status: 'TEMPORARILY_UNAVAILABLE', message: stored.error.safeMessage };

    try {
      const accepted = await this.database.db.transaction(async (tx) => {
        const [rawEvent] = await tx
          .insert(rawWebhookEvents)
          .values({
            workspaceId: workspace.id,
            providerConversationId: event.data.conversation_id,
            eventType: event.type,
            eventTimestamp: eventAt,
            rawObjectKey: stored.data.objectKey,
            rawChecksum: stored.data.checksum,
            signatureMetadata: {
              algorithm: 'HMAC-SHA256',
              timestamp: verification.timestamp,
              header: 'ElevenLabs-Signature',
            },
          })
          .onConflictDoNothing()
          .returning({ id: rawWebhookEvents.id });

        if (!rawEvent) {
          const duplicate = await tx.query.webhookInboxEntries.findFirst({
            where: eq(webhookInboxEntries.idempotencyKey, idempotencyKey),
          });
          if (!duplicate) throw new Error('Raw event exists without an inbox record');
          return { inboxId: duplicate.id, conversationId: '', duplicate: true };
        }

        const [insertedProviderConversation] = await tx
          .insert(providerConversations)
          .values({
            workspaceId: workspace.id,
            providerConversationId: event.data.conversation_id,
            providerAgentId: event.data.agent_id,
            providerBranchId: event.data.branch_id ?? null,
            providerVersionId: event.data.version_id ?? null,
            providerTranscript: event.data.transcript,
            providerAnalysis: event.data.analysis ?? null,
            providerMetadata: event.data.metadata,
            hasAudio: false,
          })
          .onConflictDoUpdate({
            target: [
              providerConversations.workspaceId,
              providerConversations.providerConversationId,
            ],
            set: {
              providerAgentId: event.data.agent_id,
              providerBranchId: event.data.branch_id ?? null,
              providerVersionId: event.data.version_id ?? null,
              providerTranscript: event.data.transcript,
              providerAnalysis: event.data.analysis ?? null,
              providerMetadata: event.data.metadata,
              // These provider booleans describe remotely available audio. They are not
              // audio bytes and never mean Quantum Parks has ingested or retained audio.
              hasAudio: false,
            },
          })
          .returning({ id: providerConversations.id });
        const providerConversation =
          insertedProviderConversation ??
          (await tx.query.providerConversations.findFirst({
            where: and(
              eq(providerConversations.workspaceId, workspace.id),
              eq(providerConversations.providerConversationId, event.data.conversation_id),
            ),
            columns: { id: true },
          }));
        if (!providerConversation) throw new Error('Provider conversation was not persisted');

        let conversation = await tx.query.conversations.findFirst({
          where: eq(conversations.providerConversationId, providerConversation.id),
        });
        if (!conversation) {
          [conversation] = await tx
            .insert(conversations)
            .values({
              providerConversationId: providerConversation.id,
              processingState:
                event.type === 'call_initiation_failure' ? 'FAILED_FINAL' : 'RAW_STORED',
              synthetic: workspace.synthetic,
            })
            .returning();
        } else if (
          event.type === 'post_call_transcription' &&
          !['COMPLETED', 'PARTIAL'].includes(conversation.processingState)
        ) {
          [conversation] = await tx
            .update(conversations)
            .set({ processingState: 'RAW_STORED', updatedAt: new Date() })
            .where(eq(conversations.id, conversation.id))
            .returning();
        }
        if (!conversation) throw new Error('Canonical conversation was not persisted');

        const [inbox] = await tx
          .insert(webhookInboxEntries)
          .values({
            rawEventId: rawEvent.id,
            idempotencyKey,
            state: 'PENDING',
          })
          .returning({ id: webhookInboxEntries.id });
        if (!inbox) throw new Error('Inbox record was not persisted');
        return {
          inboxId: inbox.id,
          conversationId: conversation.id,
          duplicate: false,
          shouldProcess: event.type === 'post_call_transcription',
        };
      });

      if (accepted.duplicate)
        return {
          status: 'ACCEPTED',
          inboxId: accepted.inboxId,
          duplicate: true,
          processingQueued: false,
        };
      if (!accepted.shouldProcess) {
        await this.database.db
          .update(webhookInboxEntries)
          .set({ state: 'PROCESSED', processedAt: new Date(), updatedAt: new Date() })
          .where(eq(webhookInboxEntries.id, accepted.inboxId));
        return {
          status: 'ACCEPTED',
          inboxId: accepted.inboxId,
          duplicate: false,
          processingQueued: false,
        };
      }
      const workflowId = `post-call-${accepted.inboxId}`;
      const processingQueued = await this.workflows.dispatchPostCall({
        inboxId: accepted.inboxId,
        conversationId: accepted.conversationId,
        workflowId,
      });
      await this.database.db
        .update(webhookInboxEntries)
        .set({
          state: processingQueued ? 'DISPATCHED' : 'PENDING',
          ...(processingQueued
            ? { workflowId }
            : { lastError: { code: 'TEMPORAL_UNAVAILABLE', retryable: true } }),
          updatedAt: new Date(),
        })
        .where(eq(webhookInboxEntries.id, accepted.inboxId));
      return { status: 'ACCEPTED', inboxId: accepted.inboxId, duplicate: false, processingQueued };
    } catch {
      return {
        status: 'TEMPORARILY_UNAVAILABLE',
        message: 'Durable webhook inbox is temporarily unavailable',
      };
    }
  }
}
