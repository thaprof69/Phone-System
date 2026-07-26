import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Principal } from '@quantum-parks/auth';
import { RECEPTIONIST_PRESET_SCENARIOS, type ReceptionistScenarioKey } from '@quantum-parks/domain';
import {
  agentDeployments,
  conversations,
  elevenLabsMediaVerifications,
  outboxEvents,
  providerConversations,
  providerIntegrations,
  receptionistSessions,
  transcriptRevisions,
  transcriptTurns,
  voiceSessions,
} from '@quantum-parks/db';
import { count, eq } from 'drizzle-orm';
import { DatabaseService } from './database.service.js';
import { PlatformService } from './platform.service.js';
import { QuantumResultService, type QuantumResult } from './quantum-result.service.js';
import { AuditService } from './audit.service.js';

type StartSessionInput = {
  agentVersionId: string;
  mode: 'VOICE' | 'TEXT';
  source: 'SCENARIO' | 'MANUAL' | 'LIVE';
  purpose?: 'TEST' | 'TRAINING' | 'DEBUG' | 'VALIDATION' | undefined;
  principal: Principal;
};

/**
 * The single orchestration authority for a conversational interaction across its full lifecycle
 * — start, runtime attach, transcript turns, evidence/policy/routing evaluation, Quantum Result,
 * and completion. Today only the Simulation Lab's Live Receptionist Test workflow calls this, but
 * it is the canonical entry point any future channel (WhatsApp, Zendesk, Email, SMS) must call
 * rather than reimplementing this sequencing.
 *
 * Lifecycle events are published through the existing `outboxEvents` table using the same
 * direct-insert pattern already used in `aios-platform.service.ts` — no new event-bus
 * abstraction. Deliberately, no consumer reads these events yet: Mission Control, Reports,
 * Intelligence and Knowledge Gap discovery are unchanged in this task and still read whatever
 * they read today. Publishing the vocabulary now, with no consumers, is the point — see ADR 0014.
 */
@Injectable()
export class ConversationLifecycleService {
  constructor(
    private readonly database: DatabaseService,
    private readonly platform: PlatformService,
    private readonly quantumResult: QuantumResultService,
    private readonly audit: AuditService,
  ) {}

  async start(input: StartSessionInput) {
    const started = await this.platform.startVoiceSession({
      agentVersionId: input.agentVersionId,
      principal: input.principal,
      // TEXT mode always stays WebSocket regardless of the configured voice mode — WebRTC is a
      // voice-transport concept only.
      preferWebRTC: input.mode === 'VOICE',
    });
    if (started.status !== 'SUCCESS') return started;

    const voiceSession = await this.database.db.query.voiceSessions.findFirst({
      where: eq(voiceSessions.id, started.sessionId),
    });
    if (!voiceSession) throw new Error('Voice session was not persisted');

    const countRows = await this.database.db
      .select({ value: count() })
      .from(receptionistSessions)
      .where(eq(receptionistSessions.agentVersionId, input.agentVersionId));
    const existingCount = countRows[0]?.value ?? 0;
    const label = `${input.mode === 'VOICE' ? 'Voice' : 'Text'} session ${existingCount + 1}`;

    const [session] = await this.database.db
      .insert(receptionistSessions)
      .values({
        agentVersionId: input.agentVersionId,
        workspaceId: voiceSession.workspaceId,
        environment: voiceSession.environment,
        mode: input.mode,
        purpose: input.purpose ?? 'TEST',
        source: input.source,
        status: 'ACTIVE',
        label,
        voiceSessionId: started.sessionId,
        startedBy: input.principal.subject,
        synthetic: voiceSession.synthetic,
      })
      .returning();
    if (!session) throw new Error('Receptionist session was not persisted');

    // The voice session row didn't know its receptionist session yet at insert time (chicken/egg
    // — the receptionist session references the voice session, not the other way round at
    // creation). Backfill it now so a later fallback can find its way back to this conversation.
    await this.database.db
      .update(voiceSessions)
      .set({ receptionistSessionId: session.id })
      .where(eq(voiceSessions.id, started.sessionId));

    await this.audit.append({
      actorType: 'USER',
      actorId: input.principal.subject,
      action: 'RECEPTIONIST_SESSION_STARTED',
      aggregateType: 'ReceptionistSession',
      aggregateId: session.id,
      purpose: 'QUALITY_REVIEW',
      payload: { agentVersionId: input.agentVersionId, mode: input.mode, source: input.source },
    });
    await this.publish('ReceptionistSession', session.id, 'CONVERSATION_STARTED', {
      agentVersionId: input.agentVersionId,
      mode: input.mode,
      transport: started.transport,
    });

    return started.transport === 'WEBRTC'
      ? {
          status: 'SUCCESS' as const,
          sessionId: session.id,
          transport: 'WEBRTC' as const,
          conversationToken: started.conversationToken,
          providerConversationId: started.providerConversationId,
          expiresAt: started.expiresAt,
          mode: input.mode,
          synthetic: session.synthetic,
        }
      : {
          status: 'SUCCESS' as const,
          sessionId: session.id,
          transport: 'WEBSOCKET' as const,
          signedUrl: started.signedUrl,
          expiresAt: started.expiresAt,
          mode: input.mode,
          synthetic: session.synthetic,
        };
  }

  /**
   * Keeps a WebRTC->WebSocket fallback inside the *same* `ReceptionistSession` — the failed
   * WebRTC attempt is ended/invalidated first, then a replacement `voiceSessions` row is created
   * chained to it via `replacesVoiceSessionId`, and the receptionist session's active-runtime
   * pointer moves to the replacement. There is exactly one `ReceptionistSession`, one transcript,
   * and one Recent Sessions entry throughout — never two operator-visible sessions.
   */
  async retryWithFallbackTransport(
    receptionistSessionId: string,
    input: { failureCategory: string },
    principal: Principal,
  ) {
    const session = await this.database.db.query.receptionistSessions.findFirst({
      where: eq(receptionistSessions.id, receptionistSessionId),
    });
    if (!session) return { status: 'NOT_FOUND' as const };
    if (!session.voiceSessionId)
      return { status: 'NOT_FOUND' as const, message: 'Session has no active voice runtime' };
    const failedVoiceSessionId = session.voiceSessionId;

    const now = new Date();
    await this.database.db
      .update(voiceSessions)
      .set({
        status: 'FAILED',
        failureCategory: input.failureCategory,
        endedAt: now,
        endReason: 'WEBRTC_FALLBACK',
        updatedAt: now,
      })
      .where(eq(voiceSessions.id, failedVoiceSessionId));

    const replacement = await this.platform.startVoiceSession({
      agentVersionId: session.agentVersionId,
      principal,
      forceTransport: 'WEBSOCKET',
      receptionistSessionId: session.id,
      replacesVoiceSessionId: failedVoiceSessionId,
    });
    if (replacement.status !== 'SUCCESS') return replacement;

    await this.database.db
      .update(receptionistSessions)
      .set({ voiceSessionId: replacement.sessionId, updatedAt: now })
      .where(eq(receptionistSessions.id, receptionistSessionId));

    await this.audit.append({
      actorType: 'USER',
      actorId: principal.subject,
      action: 'RECEPTIONIST_SESSION_TRANSPORT_FALLBACK',
      aggregateType: 'ReceptionistSession',
      aggregateId: receptionistSessionId,
      purpose: 'QUALITY_REVIEW',
      payload: {
        failedVoiceSessionId,
        replacementVoiceSessionId: replacement.sessionId,
        failureCategory: input.failureCategory,
      },
    });

    return replacement.transport === 'WEBSOCKET'
      ? {
          status: 'SUCCESS' as const,
          sessionId: receptionistSessionId,
          transport: 'WEBSOCKET' as const,
          signedUrl: replacement.signedUrl,
          expiresAt: replacement.expiresAt,
        }
      : replacement;
  }

  /**
   * Real evidence, written only from real Simulation Lab session lifecycle events (connect,
   * first agent message, disconnect/end) — never inferred from a diagnostics bootstrap check.
   * Keyed off the `ReceptionistSession` (which the client already holds) rather than the
   * underlying `voiceSessions` row, resolving the currently-active runtime internally so the
   * client never needs to track a second, internal id.
   */
  async recordMediaVerification(
    receptionistSessionId: string,
    input: {
      microphoneEstablished?: boolean | undefined;
      agentAudioReceived?: boolean | undefined;
      transcriptEventsReceived?: boolean | undefined;
      connectedAt?: string | undefined;
      endedAt?: string | undefined;
      endReason?: string | undefined;
      status: 'PASS' | 'FAILED';
    },
  ) {
    const session = await this.database.db.query.receptionistSessions.findFirst({
      where: eq(receptionistSessions.id, receptionistSessionId),
    });
    if (!session?.voiceSessionId) return { status: 'NOT_FOUND' as const };
    const voiceSession = await this.database.db.query.voiceSessions.findFirst({
      where: eq(voiceSessions.id, session.voiceSessionId),
    });
    if (!voiceSession) return { status: 'NOT_FOUND' as const };
    const integration = await this.database.db.query.providerIntegrations.findFirst({
      where: eq(providerIntegrations.provider, 'ELEVENLABS'),
    });
    if (!integration) return { status: 'NOT_FOUND' as const };

    await this.database.db.insert(elevenLabsMediaVerifications).values({
      integrationId: integration.id,
      voiceSessionId: voiceSession.id,
      transport: voiceSession.transport,
      status: input.status,
      microphoneEstablished: input.microphoneEstablished ?? false,
      agentAudioReceived: input.agentAudioReceived ?? false,
      transcriptEventsReceived: input.transcriptEventsReceived ?? false,
      connectedAt: input.connectedAt ? new Date(input.connectedAt) : null,
      endedAt: input.endedAt ? new Date(input.endedAt) : null,
      endReason: input.endReason ?? null,
    });
    return { status: 'RECORDED' as const };
  }

  async attachRuntime(
    sessionId: string,
    input: { providerConversationId: string },
    principal: Principal,
  ) {
    const session = await this.database.db.query.receptionistSessions.findFirst({
      where: eq(receptionistSessions.id, sessionId),
    });
    if (!session) return { status: 'NOT_FOUND' as const };
    if (!session.voiceSessionId)
      return { status: 'NOT_FOUND' as const, message: 'Session has no live voice session' };

    await this.platform.attachVoiceSessionConversation(
      session.voiceSessionId,
      { providerConversationId: input.providerConversationId },
      principal,
    );

    const voiceSession = await this.database.db.query.voiceSessions.findFirst({
      where: eq(voiceSessions.id, session.voiceSessionId),
    });
    if (!voiceSession) return { status: 'NOT_FOUND' as const };
    const deployment = await this.database.db.query.agentDeployments.findFirst({
      where: eq(agentDeployments.id, voiceSession.agentDeploymentId),
    });
    if (!deployment?.providerAgentId)
      return { status: 'NOT_FOUND' as const, message: 'Agent deployment mapping is missing' };

    const now = new Date();
    const [providerConversation] = await this.database.db
      .insert(providerConversations)
      .values({
        workspaceId: session.workspaceId,
        providerConversationId: input.providerConversationId,
        providerAgentId: deployment.providerAgentId,
        providerBranchId: deployment.providerBranchId,
        providerTranscript: [],
        providerMetadata: { source: 'receptionist_session', receptionistSessionId: sessionId },
        hasAudio: session.mode === 'VOICE',
      })
      .onConflictDoUpdate({
        target: [providerConversations.workspaceId, providerConversations.providerConversationId],
        set: {
          providerMetadata: { source: 'receptionist_session', receptionistSessionId: sessionId },
        },
      })
      .returning();
    if (!providerConversation) throw new Error('Provider conversation was not persisted');

    const [conversation] = await this.database.db
      .insert(conversations)
      .values({
        providerConversationId: providerConversation.id,
        agentVersionId: session.agentVersionId,
        processingState: 'RECEIVED',
        startedAt: now,
        synthetic: session.synthetic,
      })
      .returning();
    if (!conversation) throw new Error('Conversation was not persisted');

    const [revision] = await this.database.db
      .insert(transcriptRevisions)
      .values({
        conversationId: conversation.id,
        revision: 1,
        revisionType: 'CANONICAL',
        reason: 'Live receptionist session transcript',
      })
      .returning();
    if (!revision) throw new Error('Transcript revision was not persisted');

    await this.database.db
      .update(receptionistSessions)
      .set({
        conversationId: conversation.id,
        transcriptRevisionId: revision.id,
        updatedAt: now,
      })
      .where(eq(receptionistSessions.id, sessionId));

    await this.audit.append({
      actorType: 'USER',
      actorId: principal.subject,
      action: 'RECEPTIONIST_SESSION_CONNECTED',
      aggregateType: 'ReceptionistSession',
      aggregateId: sessionId,
      purpose: 'QUALITY_REVIEW',
      payload: { providerConversationId: input.providerConversationId },
    });

    return { status: 'CONNECTED' as const };
  }

  async recordTranscriptTurn(
    sessionId: string,
    input: { role: 'user' | 'agent'; text: string; scenarioKey?: ReceptionistScenarioKey },
    principal: Principal,
  ) {
    const session = await this.database.db.query.receptionistSessions.findFirst({
      where: eq(receptionistSessions.id, sessionId),
    });
    if (!session) return { status: 'NOT_FOUND' as const };
    if (!session.conversationId || !session.transcriptRevisionId)
      return {
        status: 'BLOCKED' as const,
        blockers: ['The live conversation has not connected yet'],
      };

    const [turn] = await this.database.db
      .insert(transcriptTurns)
      .values({
        revisionId: session.transcriptRevisionId,
        sequence: session.messageCount,
        speaker: input.role.toUpperCase(),
        content: input.text,
      })
      .returning();
    if (!turn) throw new Error('Transcript turn was not persisted');

    const providerConversationRow = await this.database.db.query.conversations.findFirst({
      where: eq(conversations.id, session.conversationId),
    });
    if (providerConversationRow) {
      const existing = await this.database.db.query.providerConversations.findFirst({
        where: eq(providerConversations.id, providerConversationRow.providerConversationId),
      });
      if (existing) {
        await this.database.db
          .update(providerConversations)
          .set({
            providerTranscript: [
              ...existing.providerTranscript,
              { role: input.role, message: input.text },
            ],
          })
          .where(eq(providerConversations.id, existing.id));
      }
    }

    await this.database.db
      .update(receptionistSessions)
      .set({ messageCount: session.messageCount + 1, updatedAt: new Date() })
      .where(eq(receptionistSessions.id, sessionId));
    await this.publish('ReceptionistSession', sessionId, 'TRANSCRIPT_TURN_RECEIVED', {
      role: input.role,
      turnId: turn.id,
    });

    let quantumResult: QuantumResult | null = null;
    if (input.role === 'user') {
      const outcome = await this.quantumResult.evaluateTurn({
        agentVersionId: session.agentVersionId,
        conversationId: session.conversationId,
        transcriptRevisionId: session.transcriptRevisionId,
        transcriptTurnId: turn.id,
        principal,
        correlationId: `receptionist-session:${sessionId}:turn:${turn.id}`,
      });
      if (outcome.status === 'SUCCESS') {
        await this.database.db
          .update(receptionistSessions)
          .set({ latestAnalysisArtifactId: outcome.artifactId, updatedAt: new Date() })
          .where(eq(receptionistSessions.id, sessionId));
        quantumResult = await this.quantumResult.resolve(
          outcome.artifactId,
          session.conversationId,
        );
        // The evidence/policy/routing/Quantum-Result stages already happened inside
        // `quantumResult.evaluateTurn()` — these are milestone markers over the outbox, not a
        // claim that this method computed each stage independently.
        for (const eventType of [
          'EVIDENCE_COLLECTED',
          'CONVERSATION_ANALYSED',
          'POLICY_EVALUATED',
          'ROUTING_COMPLETED',
          'QUANTUM_RESULT_CREATED',
        ] as const) {
          await this.publish('ReceptionistSession', sessionId, eventType, {
            artifactId: outcome.artifactId,
          });
        }
      } else {
        await this.audit.append({
          actorType: 'SYSTEM',
          actorId: 'quantum-result-service',
          action: 'RECEPTIONIST_EVALUATION_FAILED',
          aggregateType: 'ReceptionistSession',
          aggregateId: sessionId,
          purpose: 'QUALITY_REVIEW',
          result: 'FAILED',
          payload: { reason: outcome.reason },
        });
      }
    }

    return {
      status: 'SUCCESS' as const,
      turn: { id: turn.id, role: input.role, text: input.text, sequence: turn.sequence },
      quantumResult,
    };
  }

  async sendPresetScenario(
    sessionId: string,
    scenarioKey: ReceptionistScenarioKey,
    principal: Principal,
  ) {
    const scenario = RECEPTIONIST_PRESET_SCENARIOS.find((item) => item.key === scenarioKey);
    if (!scenario) return { status: 'NOT_FOUND' as const, message: 'Unknown preset scenario' };
    return this.recordTranscriptTurn(
      sessionId,
      { role: 'user', text: scenario.message, scenarioKey },
      principal,
    );
  }

  async endSession(sessionId: string, input: { reason: string }, principal: Principal) {
    const session = await this.database.db.query.receptionistSessions.findFirst({
      where: eq(receptionistSessions.id, sessionId),
    });
    if (!session) return { status: 'NOT_FOUND' as const };
    if (session.voiceSessionId)
      await this.platform.endVoiceSession(
        session.voiceSessionId,
        { reason: input.reason },
        principal,
      );

    const now = new Date();
    await this.database.db
      .update(receptionistSessions)
      .set({ status: 'ENDED', endedAt: now, endReason: input.reason, updatedAt: now })
      .where(eq(receptionistSessions.id, sessionId));

    await this.audit.append({
      actorType: 'USER',
      actorId: principal.subject,
      action: 'RECEPTIONIST_SESSION_ENDED',
      aggregateType: 'ReceptionistSession',
      aggregateId: sessionId,
      purpose: 'QUALITY_REVIEW',
      payload: { reason: input.reason },
    });
    // No distinct transcript-finalisation mutation exists in this codebase yet — the transcript
    // is simply whatever turns exist at end time, so TRANSCRIPT_FINALISED fires at the same point
    // as CONVERSATION_ENDED rather than a separately-modeled step.
    await this.publish('ReceptionistSession', sessionId, 'CONVERSATION_ENDED', {
      reason: input.reason,
    });
    await this.publish('ReceptionistSession', sessionId, 'TRANSCRIPT_FINALISED', {});
    await this.publish('ReceptionistSession', sessionId, 'CONVERSATION_COMPLETED', {});

    return { status: 'ENDED' as const };
  }

  private async publish(
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    await this.database.db.insert(outboxEvents).values({
      aggregateType,
      aggregateId,
      eventType: `${eventType}.v1`,
      event: { eventId: randomUUID(), schemaVersion: 1, ...payload },
    });
  }
}
