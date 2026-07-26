import { Injectable } from '@nestjs/common';
import type { Principal } from '@quantum-parks/auth';
import { aiArtifacts, toolInvocations } from '@quantum-parks/db';
import { InteractionEvidenceSchema, type InteractionEvidence } from '@quantum-parks/intelligence';
import { eq } from 'drizzle-orm';
import { DatabaseService } from './database.service.js';
import { AiosPlatformService } from './aios-platform.service.js';
import { ReceptionistPolicyService } from './receptionist-policy.service.js';
import { ReceptionistRoutingService } from './receptionist-routing.service.js';

export type QuantumResult = {
  artifactId: string;
  generatedAt: string;
  confidence: number;
  intent: string;
  sentiment: InteractionEvidence['sentiment'];
  urgency: InteractionEvidence['urgency'];
  escalationStatus: 'NONE' | 'REQUIRED';
  escalationReason: string | null;
  bookingStatus: 'NONE' | 'PROVISIONAL';
  policyResult: string;
  routingDecision: string;
  proposedAction: string | null;
  executedAction: string | null;
  knowledgeRequests: string[];
  blockedActions: Array<{ action: string; reason: string }>;
  toolEvaluation: { invoked: boolean; calls: Array<{ tool: string; status: string }> };
  evidenceIds: string[];
  contextManifest: unknown;
  intelligenceState: 'PROVISIONAL' | 'FINAL' | 'SUPERSEDED';
};

type EvaluateTurnInput = {
  agentVersionId: string;
  conversationId: string;
  transcriptRevisionId: string;
  transcriptTurnId: string;
  principal: Principal;
  correlationId: string;
};

type EvaluateTurnOutcome =
  { status: 'SUCCESS'; artifactId: string } | { status: 'FAILED'; reason: string };

/**
 * The Quantum Result aggregation pipeline: `Interaction → Evidence Collection → Interaction
 * Evidence Pack (AIOS, real) → Knowledge Verification → Policy Evaluation (deterministic) →
 * Routing Engine (deterministic) → Tool Evaluation → Business Action Planning → Quantum Result`.
 *
 * Only the Evidence Pack stage has a side effect (a real, governed `aiArtifacts` row). Everything
 * downstream is a pure, deterministic function of that artifact's real content, recomputed on
 * every read rather than persisted a second time — the session row holds only a pointer to the
 * artifact, so the aggregated view and its evidence can never drift apart.
 */
@Injectable()
export class QuantumResultService {
  constructor(
    private readonly database: DatabaseService,
    private readonly aios: AiosPlatformService,
    private readonly policy: ReceptionistPolicyService,
    private readonly routing: ReceptionistRoutingService,
  ) {}

  /** Evidence Collection + Interaction Evidence Pack — the one stage with a real side effect. */
  async evaluateTurn(input: EvaluateTurnInput): Promise<EvaluateTurnOutcome> {
    const executed = await this.aios.execute({
      capabilityKey: 'INTERACTION_ANALYSIS',
      executionContext: {
        environment:
          (process.env.QP_ENVIRONMENT as 'development' | 'staging' | 'production') ?? 'development',
        callerService: 'api',
        actorId: input.principal.subject,
        purpose: 'QUALITY_REVIEW',
        correlationId: input.correlationId,
        sourceRecordId: input.conversationId,
        sourceRevisionId: input.transcriptRevisionId,
        intelligenceState: 'PROVISIONAL',
      },
      contextSources: [{ sourceType: 'TRANSCRIPT', sourceId: input.transcriptTurnId }],
    });
    if (!('data' in executed)) return { status: 'FAILED', reason: executed.safeMessage };
    if (!executed.data.artifactId)
      return { status: 'FAILED', reason: 'The evaluation did not persist an evidence artifact.' };
    return { status: 'SUCCESS', artifactId: executed.data.artifactId };
  }

  /** Knowledge Verification → Policy Evaluation → Routing Engine → Tool Evaluation → Quantum Result. */
  async resolve(artifactId: string, conversationId: string): Promise<QuantumResult | null> {
    const [artifact] = await this.database.db
      .select()
      .from(aiArtifacts)
      .where(eq(aiArtifacts.id, artifactId))
      .limit(1);
    if (!artifact) return null;
    const parsed = InteractionEvidenceSchema.safeParse(artifact.result);
    if (!parsed.success) return null;
    const evidence = parsed.data;

    const policyEvaluation = this.policy.evaluate(evidence);
    const routingDecision = this.routing.decide(evidence, policyEvaluation);
    const toolCalls = await this.database.db
      .select({
        registryKey: toolInvocations.registryKey,
        resultStatus: toolInvocations.resultStatus,
      })
      .from(toolInvocations)
      .where(eq(toolInvocations.conversationId, conversationId));

    const bookingRequested = evidence.requested_actions.some((action) =>
      /availability|booking/.test(action.text),
    );

    return {
      artifactId: artifact.id,
      generatedAt: artifact.generatedAt.toISOString(),
      confidence: evidence.confidence,
      intent: evidence.intent,
      sentiment: evidence.sentiment,
      urgency: evidence.urgency,
      escalationStatus: policyEvaluation.escalationRequired ? 'REQUIRED' : 'NONE',
      escalationReason: policyEvaluation.escalationReason,
      bookingStatus: bookingRequested ? 'PROVISIONAL' : 'NONE',
      policyResult: policyEvaluation.policyResult,
      routingDecision: routingDecision.routingDecision,
      proposedAction: routingDecision.proposedAction,
      executedAction: routingDecision.executedAction,
      knowledgeRequests: evidence.knowledge_requests.map((item) => item.text),
      blockedActions: policyEvaluation.blockedActions,
      toolEvaluation: {
        invoked: toolCalls.length > 0,
        calls: toolCalls.map((call) => ({ tool: call.registryKey, status: call.resultStatus })),
      },
      evidenceIds: evidence.evidence_ids,
      contextManifest: artifact.contextManifestId,
      intelligenceState: artifact.intelligenceState,
    };
  }
}
