import { z } from 'zod';

export const TrustedOutcomeSchema = z.enum([
  'RESOLVED_BY_AGENT',
  'OFFICIAL_LINK_SENT',
  'TRANSFER_COMPLETED',
  'TRANSFER_FAILED_CALLBACK_CREATED',
  'CALLBACK_REQUESTED',
  'STAFF_TASK_CREATED',
  'UNRESOLVED_KNOWLEDGE_GAP',
  'CUSTOMER_DISCONNECTED',
  'TECHNICAL_FAILURE',
  'SENSITIVE_ESCALATION',
  'PAYMENT_DATA_INTERRUPTED',
  'NO_ACTION_REQUIRED',
]);
export type TrustedOutcome = z.infer<typeof TrustedOutcomeSchema>;

export interface TrustedEvent {
  type:
    | 'TOOL_RESULT'
    | 'TRANSFER_RESULT'
    | 'DELIVERY_RECEIPT'
    | 'CALLBACK_PERSISTED'
    | 'TASK_PERSISTED'
    | 'CONVERSATION_END'
    | 'POLICY_DETECTION';
  status: 'SUCCESS' | 'FAILED' | 'QUEUED' | 'UNCONFIRMED';
  referenceId: string;
  code?: string;
}

export interface DeterministicOutcome {
  outcome: TrustedOutcome;
  evidenceIds: string[];
}

export function deriveDeterministicOutcome(events: readonly TrustedEvent[]): DeterministicOutcome {
  const successful = (type: TrustedEvent['type'], code?: string) =>
    events.find(
      (event) =>
        event.type === type && event.status === 'SUCCESS' && (!code || event.code === code),
    );

  const payment = successful('POLICY_DETECTION', 'PAYMENT_DATA');
  if (payment) return { outcome: 'PAYMENT_DATA_INTERRUPTED', evidenceIds: [payment.referenceId] };
  const sensitive = successful('POLICY_DETECTION', 'SENSITIVE');
  if (sensitive) return { outcome: 'SENSITIVE_ESCALATION', evidenceIds: [sensitive.referenceId] };
  const transfer = successful('TRANSFER_RESULT');
  if (transfer) return { outcome: 'TRANSFER_COMPLETED', evidenceIds: [transfer.referenceId] };
  const failedTransfer = events.find(
    (event) => event.type === 'TRANSFER_RESULT' && event.status === 'FAILED',
  );
  const callback = successful('CALLBACK_PERSISTED');
  if (failedTransfer && callback) {
    return {
      outcome: 'TRANSFER_FAILED_CALLBACK_CREATED',
      evidenceIds: [failedTransfer.referenceId, callback.referenceId],
    };
  }
  const delivery = successful('DELIVERY_RECEIPT');
  if (delivery) return { outcome: 'OFFICIAL_LINK_SENT', evidenceIds: [delivery.referenceId] };
  if (callback) return { outcome: 'CALLBACK_REQUESTED', evidenceIds: [callback.referenceId] };
  const task = successful('TASK_PERSISTED');
  if (task) return { outcome: 'STAFF_TASK_CREATED', evidenceIds: [task.referenceId] };
  const tool = successful('TOOL_RESULT');
  if (tool) return { outcome: 'RESOLVED_BY_AGENT', evidenceIds: [tool.referenceId] };
  const technicalFailure = events.find((event) => event.status === 'FAILED');
  if (technicalFailure)
    return { outcome: 'TECHNICAL_FAILURE', evidenceIds: [technicalFailure.referenceId] };
  const ended = successful('CONVERSATION_END');
  return ended
    ? { outcome: 'NO_ACTION_REQUIRED', evidenceIds: [ended.referenceId] }
    : { outcome: 'UNRESOLVED_KNOWLEDGE_GAP', evidenceIds: [] };
}
