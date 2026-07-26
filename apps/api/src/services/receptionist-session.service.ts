import { Injectable } from '@nestjs/common';
import type { Principal } from '@quantum-parks/auth';
import {
  AgentConversationConfigurationSchema,
  composeRuntimePrompt,
  RECEPTIONIST_PRESET_SCENARIOS,
  type ReceptionistScenarioKey,
} from '@quantum-parks/domain';
import {
  agentConfigVersions,
  agentDeployments,
  conversations,
  knowledgeAssets,
  knowledgeVersions,
  providerConversations,
  receptionistSessions,
  transcriptRevisions,
  transcriptTurns,
  voiceAgents,
  voiceSessions,
} from '@quantum-parks/db';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
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
 * The operator-facing Live Receptionist Test workflow. A `ReceptionistSession` is a first-class,
 * reusable business object — not a disposable test record — wrapping a real ElevenLabs voice or
 * text-only conversation (reusing `PlatformService.startVoiceSession`, never a parallel voice
 * pipeline) and a real, incrementally-built transcript. Every customer turn triggers the real
 * Quantum Result aggregation pipeline; the session row holds only a pointer to the latest real
 * evidence artifact, never a denormalized copy.
 */
@Injectable()
export class ReceptionistSessionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly platform: PlatformService,
    private readonly quantumResult: QuantumResultService,
    private readonly audit: AuditService,
  ) {}

  async startSession(input: StartSessionInput) {
    const started = await this.platform.startVoiceSession({
      agentVersionId: input.agentVersionId,
      principal: input.principal,
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

    await this.audit.append({
      actorType: 'USER',
      actorId: input.principal.subject,
      action: 'RECEPTIONIST_SESSION_STARTED',
      aggregateType: 'ReceptionistSession',
      aggregateId: session.id,
      purpose: 'QUALITY_REVIEW',
      payload: { agentVersionId: input.agentVersionId, mode: input.mode, source: input.source },
    });

    return {
      status: 'SUCCESS' as const,
      sessionId: session.id,
      signedUrl: started.signedUrl,
      expiresAt: started.expiresAt,
      mode: input.mode,
      synthetic: session.synthetic,
    };
  }

  async attachConversation(
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

  async recordTurn(
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
    return this.recordTurn(
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

    return { status: 'ENDED' as const };
  }

  async getSession(sessionId: string) {
    const session = await this.database.db.query.receptionistSessions.findFirst({
      where: eq(receptionistSessions.id, sessionId),
    });
    if (!session) return null;
    const turns = session.transcriptRevisionId
      ? await this.database.db
          .select()
          .from(transcriptTurns)
          .where(eq(transcriptTurns.revisionId, session.transcriptRevisionId))
          .orderBy(transcriptTurns.sequence)
      : [];
    const quantumResult =
      session.latestAnalysisArtifactId && session.conversationId
        ? await this.quantumResult.resolve(session.latestAnalysisArtifactId, session.conversationId)
        : null;
    return { session, turns, quantumResult };
  }

  async listRecentSessions(limit = 8) {
    const rows = await this.database.db
      .select()
      .from(receptionistSessions)
      .orderBy(desc(receptionistSessions.createdAt))
      .limit(limit);
    return Promise.all(rows.map((row) => this.withEscalationStatus(row)));
  }

  async listSessions() {
    const rows = await this.database.db
      .select()
      .from(receptionistSessions)
      .orderBy(desc(receptionistSessions.createdAt))
      .limit(200);
    return Promise.all(rows.map((row) => this.withEscalationStatus(row)));
  }

  /**
   * Escalation status is never denormalized onto the session row — it is derived fresh
   * from the real `aiArtifacts` row every time a session list is read, so the list view
   * can never drift from the evidence it summarises.
   */
  private async withEscalationStatus<
    T extends { latestAnalysisArtifactId: string | null; conversationId: string | null },
  >(row: T): Promise<T & { escalationStatus: 'NONE' | 'REQUIRED' | null }> {
    if (!row.latestAnalysisArtifactId || !row.conversationId) {
      return { ...row, escalationStatus: null };
    }
    const result = await this.quantumResult.resolve(
      row.latestAnalysisArtifactId,
      row.conversationId,
    );
    return { ...row, escalationStatus: result?.escalationStatus ?? null };
  }

  /**
   * Generates the real ElevenLabs runtime instructions from authoritative Phone-System
   * configuration — reuses `composeRuntimePrompt`, the same function the real agent-publish
   * path uses, rather than a second, duplicate prompt generator.
   */
  async buildAgentInstructionsSnapshot(agentVersionId: string) {
    const release = await this.database.db.query.agentConfigVersions.findFirst({
      where: eq(agentConfigVersions.id, agentVersionId),
    });
    if (!release) return null;
    const parsed = AgentConversationConfigurationSchema.safeParse(release.configuration);
    if (!parsed.success)
      return {
        instructions:
          'This agent version has no valid runtime configuration yet — instructions cannot be generated.',
        sources: [],
        generatedAt: new Date().toISOString(),
        configurationVersion: release.version,
      };
    const configuration = parsed.data;
    const agent = await this.database.db.query.voiceAgents.findFirst({
      where: eq(voiceAgents.id, release.agentId),
    });
    const publishedKnowledge = await this.database.db
      .select({ value: count() })
      .from(knowledgeVersions)
      .innerJoin(knowledgeAssets, eq(knowledgeAssets.id, knowledgeVersions.assetId))
      .where(
        and(
          eq(knowledgeAssets.language, configuration.defaultLanguage),
          inArray(knowledgeVersions.state, ['PUBLISHED', 'ACTIVE']),
        ),
      );
    const knowledgeCount = publishedKnowledge[0]?.value ?? 0;

    return {
      instructions: composeRuntimePrompt(configuration),
      sources: [
        `${knowledgeCount} published knowledge item${knowledgeCount === 1 ? '' : 's'} in ${configuration.defaultLanguage}`,
        `${configuration.policyFragments.length} non-negotiable safety policy fragment${configuration.policyFragments.length === 1 ? '' : 's'}`,
        `${configuration.tools.length} governed tool contract${configuration.tools.length === 1 ? '' : 's'}`,
        `${configuration.transfers.length} configured transfer route${configuration.transfers.length === 1 ? '' : 's'}`,
        `Receptionist "${agent?.name ?? 'unknown'}", configuration version ${release.version} (${release.checksum.slice(0, 12)})`,
      ],
      generatedAt: new Date().toISOString(),
      configurationVersion: release.version,
    };
  }
}
