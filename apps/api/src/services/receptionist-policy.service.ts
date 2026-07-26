import { Injectable } from '@nestjs/common';
import type { InteractionEvidence } from '@quantum-parks/intelligence';

export type PolicyEvaluation = {
  escalationRequired: boolean;
  escalationReason: string | null;
  blockedActions: Array<{ action: string; reason: string }>;
  allowedActions: string[];
  policyResult: string;
};

const ESCALATION_SIGNALS = new Set([
  'complaint',
  'refund_request',
  'safety_concern',
  'legal_threat',
]);

/**
 * Deterministic, non-AI business rules. The AI Evidence Pack only ever observes; this service
 * decides what is actually allowed to happen. Never confirms a booking without verified
 * availability, never quotes unapproved prices, always escalates legal/safety/refund/complaint
 * signals regardless of the AI's own confidence score.
 */
@Injectable()
export class ReceptionistPolicyService {
  evaluate(evidence: InteractionEvidence): PolicyEvaluation {
    const escalationSignal = evidence.risk_signals.find((signal) =>
      ESCALATION_SIGNALS.has(signal.text),
    );
    const escalationRequired = Boolean(escalationSignal);

    const blockedActions: Array<{ action: string; reason: string }> = [];
    const allowedActions: string[] = [];
    for (const requested of evidence.requested_actions) {
      if (
        /confirm_booking|book_now|process_payment|charge_card|issue_refund/.test(requested.text)
      ) {
        blockedActions.push({
          action: requested.text,
          reason:
            'This action requires verified availability and payment permission that this system does not confirm automatically.',
        });
        continue;
      }
      allowedActions.push(requested.text);
    }
    for (const knowledgeRequest of evidence.knowledge_requests) {
      if (/pricing|price/.test(knowledgeRequest.text) && evidence.confidence < 0.6) {
        blockedActions.push({
          action: `answer:${knowledgeRequest.text}`,
          reason: 'Pricing may only be quoted from approved knowledge, not inferred.',
        });
      }
    }

    const policyResult = escalationRequired
      ? `Human review required before any customer-facing commitment (${escalationSignal!.text}).`
      : blockedActions.length > 0
        ? 'One or more requested actions require verification this system cannot provide automatically.'
        : 'Safe to answer from approved operational context.';

    return {
      escalationRequired,
      escalationReason: escalationSignal?.text ?? null,
      blockedActions,
      allowedActions,
      policyResult,
    };
  }
}
