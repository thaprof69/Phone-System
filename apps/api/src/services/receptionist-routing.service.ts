import { Injectable } from '@nestjs/common';
import type { InteractionEvidence } from '@quantum-parks/intelligence';
import type { PolicyEvaluation } from './receptionist-policy.service.js';

export type RoutingDecision = {
  routingDecision: string;
  proposedAction: string | null;
  executedAction: string | null;
};

const KNOWN_ROUTES = new Set([
  'ESCALATION_QUEUE',
  'BOOKING_TEAM',
  'CALLBACK_QUEUE',
  'SALES',
  'SUPPORT',
  'COMPLAINTS',
  'EMERGENCY',
  'AI_RECEPTIONIST',
]);

/**
 * Deterministic, non-AI destination selection. The AI Evidence Pack only ever surfaces
 * `possible_routes` as candidates; this service picks the actual destination. An escalation
 * signal from the policy engine always overrides any AI-suggested route. No business action is
 * ever marked executed here — this system only proposes; nothing confirms real-world completion.
 */
@Injectable()
export class ReceptionistRoutingService {
  decide(evidence: InteractionEvidence, policy: PolicyEvaluation): RoutingDecision {
    const routingDecision = policy.escalationRequired
      ? 'ESCALATION_QUEUE'
      : (evidence.possible_routes
          .map((route) => route.text)
          .find((route) => KNOWN_ROUTES.has(route)) ?? 'AI_RECEPTIONIST');

    return {
      routingDecision,
      proposedAction: policy.allowedActions[0] ?? null,
      executedAction: null,
    };
  }
}
