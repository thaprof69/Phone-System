/**
 * One place that decides how a domain state is coloured.
 *
 * The schema carries sixteen agent-release states, eleven knowledge states, thirteen
 * conversation processing states, ten sync states and twelve call outcomes. Without a
 * shared mapping each screen invents its own colours and the same word means different
 * things in different places.
 */

export type Tone = 'good' | 'warning' | 'danger' | 'info' | 'neutral';

const GOOD = new Set([
  'ACTIVE',
  'PUBLISHED',
  'APPROVED',
  'APPROVED_FOR_PUBLISH',
  'TEST_PASSED',
  'IN_SYNC',
  'COMPLETED',
  'COMPLETE',
  'PROCESSED',
  'SUCCESS',
  'CONNECTED',
  'HEALTHY',
  'READY',
  'RESOLVED',
  'DELIVERED',
  'VERIFIED',
  'EFFECTIVE',
  'PASSED',
  'ENABLED',
  'AVAILABLE',
  'ANSWERED',
  'SUPPORTED',
  'ACCEPTED',
]);

const WARNING = new Set([
  'DRAFT',
  'PENDING',
  'PENDING_APPROVAL',
  'PENDING_REVIEW',
  'PENDING_PROVIDER_RESULT',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED_FOR_TEST',
  'TESTING',
  'PUBLISHING',
  'SYNCING',
  'QUEUED',
  'DISPATCHED',
  'IN_PROGRESS',
  'PARTIAL',
  'DEGRADED',
  'DRIFTED',
  'STALE',
  'EXPIRING',
  'RETRYING',
  'UNVERIFIED',
  'CONFIGURED_WITH_BLOCKERS',
  'NON_PRODUCTION_ONLY',
  'SANDBOX',
  'FALLBACK_USED',
  'RATE_LIMITED',
  'OVERDUE',
  'SCHEDULED',
]);

const DANGER = new Set([
  'FAILED',
  'TEST_FAILED',
  'REJECTED',
  'ERROR',
  'UNAVAILABLE',
  'UNHEALTHY',
  'BLOCKED',
  'EXTERNALLY_BLOCKED',
  'EXPIRED',
  'REVOKED',
  'DISCONNECTED',
  'DISABLED',
  'WITHDRAWN',
  'CONFLICT',
  'UNRESOLVED',
  'ABANDONED',
  'VALIDATION_FAILED',
  'SCHEMA_REJECTED',
  'POLICY_REJECTED',
  'EVIDENCE_INSUFFICIENT',
  'PROVIDER_NOT_CONFIGURED',
  'MODEL_NOT_CONFIGURED',
  'MODEL_NOT_AVAILABLE',
  'COST_LIMIT_REACHED',
  'TIMEOUT',
  'UNKNOWN_FAILURE',
  'DEPRECATED',
  'RETIRED',
  'UNSUPPORTED',
  'MISSED',
  'BREACHED',
]);

const INFO = new Set([
  'ARCHIVED',
  'SUPERSEDED',
  'REPLAYED',
  'NOT_STARTED',
  'NOT_CONFIGURED',
  'NOT_APPLICABLE',
  'SYNTHETIC',
  'SIMULATOR',
  'REQUESTED',
  'OPEN',
]);

/** Maps any domain state token to a tone. Unknown states stay neutral rather than guessing. */
export function toneForState(state: string | null | undefined): Tone {
  if (!state) return 'neutral';
  const key = state.trim().toUpperCase().replaceAll(' ', '_');
  if (GOOD.has(key)) return 'good';
  if (WARNING.has(key)) return 'warning';
  if (DANGER.has(key)) return 'danger';
  if (INFO.has(key)) return 'info';
  return 'neutral';
}

/** Severity ordering used to sort attention queues worst-first. */
export const TONE_SEVERITY: Record<Tone, number> = {
  danger: 0,
  warning: 1,
  info: 2,
  good: 3,
  neutral: 4,
};

export function compareBySeverity(a: Tone, b: Tone): number {
  return TONE_SEVERITY[a] - TONE_SEVERITY[b];
}
