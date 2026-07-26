import { Injectable } from '@nestjs/common';
import { AgentConversationConfigurationSchema, composeRuntimePrompt } from '@quantum-parks/domain';
import {
  agentConfigVersions,
  knowledgeAssets,
  knowledgeVersions,
  receptionistSessions,
  transcriptTurns,
  voiceAgents,
} from '@quantum-parks/db';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from './database.service.js';
import { QuantumResultService } from './quantum-result.service.js';

/**
 * Read-side access to `ReceptionistSession` rows. All orchestration/mutation (start a session,
 * attach a runtime, record a turn, end a session, transport fallback) lives in
 * `ConversationLifecycleService` — the single orchestration authority for the conversation
 * lifecycle. This service only reads what that authority persisted, plus generates the
 * (read-only) agent instructions snapshot, which is not part of any session's lifecycle.
 */
@Injectable()
export class ReceptionistSessionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly quantumResult: QuantumResultService,
  ) {}

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
