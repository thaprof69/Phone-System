import { Injectable } from '@nestjs/common';
import { AgentConversationConfigurationSchema, composeRuntimePrompt } from '@quantum-parks/domain';
import {
  agentConfigVersions,
  callClassifications,
  callSummaries,
  conversations,
  intelligenceModels,
  intelligenceRoutes,
  knowledgeAssets,
  knowledgeVersions,
  receptionistSessions,
  transcriptTurns,
  voiceAgents,
} from '@quantum-parks/db';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { SummarySchema } from '@quantum-parks/intelligence';
import { DatabaseService } from './database.service.js';
import { QuantumResultService } from './quantum-result.service.js';

export type CallIntelligenceStatus = 'WAITING' | 'PROVISIONAL' | 'ANALYSING' | 'READY' | 'PARTIAL';

export function deriveCallIntelligenceStatus(input: {
  hasSummary: boolean;
  hasClassification: boolean;
  sessionEnded: boolean;
  processingFinished: boolean;
  hasProvisionalResult: boolean;
}): CallIntelligenceStatus {
  if (input.hasSummary && input.hasClassification) return 'READY';
  if (input.sessionEnded && !input.processingFinished) return 'ANALYSING';
  if (input.processingFinished) return 'PARTIAL';
  if (input.hasProvisionalResult) return 'PROVISIONAL';
  return 'WAITING';
}

export function deriveSummaryIssue(input: {
  hasSummary: boolean;
  processingFinished: boolean;
  primaryModel?: { enabled: boolean; status: string } | null;
  fallbackModel?: { enabled: boolean; status: string } | null;
}): string | null {
  if (input.hasSummary || !input.processingFinished) return null;
  const usable = (model: { enabled: boolean; status: string } | null | undefined) =>
    Boolean(model?.enabled && model.status === 'CONNECTED');
  if (!input.primaryModel && !input.fallbackModel) {
    return 'No AI Router model is assigned to Transcript Summaries.';
  }
  if (!usable(input.primaryModel) && !usable(input.fallbackModel)) {
    return 'The AI Router model selected for Transcript Summaries is not connected and tested.';
  }
  return 'The selected AI Router model did not return a valid transcript summary.';
}

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
    const provisionalResult =
      session.latestAnalysisArtifactId && session.conversationId
        ? await this.quantumResult.resolve(session.latestAnalysisArtifactId, session.conversationId)
        : null;
    if (!session.conversationId) {
      return {
        session,
        turns,
        quantumResult: provisionalResult,
        callIntelligence: {
          status: 'WAITING' as const,
          summary: null,
          callerRequests: [],
          unresolvedItems: [],
          sentiment: null,
          classification: null,
          urgency: null,
          confidence: null,
          evidenceCoverage: null,
          intelligenceState: null,
          summaryIssue: null,
        },
      };
    }

    const [conversation, summaryRow, classification, summaryRoute] = await Promise.all([
      this.database.db.query.conversations.findFirst({
        where: eq(conversations.id, session.conversationId),
      }),
      this.database.db.query.callSummaries.findFirst({
        where: eq(callSummaries.conversationId, session.conversationId),
        orderBy: (table, { desc: descending }) => [descending(table.revision)],
      }),
      this.database.db.query.callClassifications.findFirst({
        where: eq(callClassifications.conversationId, session.conversationId),
        orderBy: (table, { desc: descending }) => [descending(table.revision)],
      }),
      this.database.db.query.intelligenceRoutes.findFirst({
        where: eq(intelligenceRoutes.capability, 'TRANSCRIPT_SUMMARY'),
      }),
    ]);
    const routedModelIds = [summaryRoute?.primaryModelId, summaryRoute?.fallbackModelId].filter(
      (value): value is string => Boolean(value),
    );
    const routedModels = routedModelIds.length
      ? await this.database.db
          .select()
          .from(intelligenceModels)
          .where(inArray(intelligenceModels.id, routedModelIds))
      : [];
    const modelById = new Map(routedModels.map((model) => [model.id, model]));
    const finalResult = classification?.aiArtifactId
      ? await this.quantumResult.resolve(classification.aiArtifactId, session.conversationId)
      : null;
    const quantumResult = finalResult ?? provisionalResult;
    const parsedSummary = summaryRow ? SummarySchema.safeParse(summaryRow.summary) : null;
    const summary = parsedSummary?.success ? parsedSummary.data : null;
    const processingFinished = ['COMPLETED', 'PARTIAL', 'FAILED_FINAL'].includes(
      conversation?.processingState ?? '',
    );

    return {
      session,
      turns,
      quantumResult,
      callIntelligence: {
        status: deriveCallIntelligenceStatus({
          hasSummary: Boolean(summaryRow),
          hasClassification: Boolean(classification),
          sessionEnded: session.status === 'ENDED',
          processingFinished,
          hasProvisionalResult: Boolean(quantumResult),
        }),
        summary: summary?.purpose.text ?? null,
        callerRequests: summary?.caller_requests.map((claim) => claim.text) ?? [],
        unresolvedItems: summary?.unresolved_items.map((claim) => claim.text) ?? [],
        sentiment: quantumResult?.sentiment ?? null,
        classification: classification?.primaryIntent ?? quantumResult?.intent ?? null,
        urgency: quantumResult?.urgency ?? null,
        confidence: classification ? Number(classification.confidence) : quantumResult?.confidence,
        evidenceCoverage: summaryRow ? Number(summaryRow.evidenceCoverage) : null,
        intelligenceState: finalResult
          ? ('FINAL' as const)
          : quantumResult
            ? quantumResult.intelligenceState
            : null,
        summaryIssue: deriveSummaryIssue({
          hasSummary: Boolean(summaryRow),
          processingFinished,
          primaryModel: summaryRoute?.primaryModelId
            ? (modelById.get(summaryRoute.primaryModelId) ?? null)
            : null,
          fallbackModel: summaryRoute?.fallbackModelId
            ? (modelById.get(summaryRoute.fallbackModelId) ?? null)
            : null,
        }),
      },
    };
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
