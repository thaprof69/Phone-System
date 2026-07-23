import { z } from 'zod';

export const EnvironmentSchema = z.enum(['development', 'staging', 'production']);
export type Environment = z.infer<typeof EnvironmentSchema>;

export const ProviderCapabilityStateSchema = z.enum([
  'SUPPORTED',
  'UNSUPPORTED',
  'ACCOUNT_RESTRICTED',
  'NOT_CONFIGURED',
  'TEMPORARILY_UNAVAILABLE',
]);
export type ProviderCapabilityState = z.infer<typeof ProviderCapabilityStateSchema>;

export const SyncStateSchema = z.enum([
  'LOCAL_DRAFT',
  'LOCAL_APPROVED',
  'PUBLISH_PENDING',
  'IN_SYNC',
  'DRIFTED',
  'REMOTE_MISSING',
  'LOCAL_SUPERSEDED',
  'PUBLISH_FAILED',
  'ROLLBACK_PENDING',
  'EXTERNALLY_BLOCKED',
]);
export type SyncState = z.infer<typeof SyncStateSchema>;

export const AgentReleaseStateSchema = z.enum([
  'DRAFT',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED_FOR_TEST',
  'TESTING',
  'TEST_FAILED',
  'TEST_PASSED',
  'APPROVED_FOR_PUBLISH',
  'PUBLISHING',
  'PUBLISHED',
  'ACTIVE',
  'SUPERSEDED',
  'ROLLBACK_PENDING',
  'ROLLED_BACK',
  'RETIRED',
  'EXTERNALLY_BLOCKED',
]);
export type AgentReleaseState = z.infer<typeof AgentReleaseStateSchema>;

export const KnowledgeStateSchema = z.enum([
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'PUBLISH_PENDING',
  'PUBLISHED',
  'ACTIVE',
  'SUPERSEDED',
  'WITHDRAWN',
  'ARCHIVED',
  'PUBLISH_FAILED',
  'DRIFTED',
]);
export type KnowledgeState = z.infer<typeof KnowledgeStateSchema>;

export const ConversationProcessingStateSchema = z.enum([
  'RECEIVED',
  'RAW_STORED',
  'NORMALIZING',
  'REDACTED',
  'SUMMARIZING',
  'CLASSIFYING',
  'LINKING',
  'FOLLOW_UP',
  'AGGREGATED',
  'COMPLETED',
  'PARTIAL',
  'FAILED_RETRYABLE',
  'FAILED_FINAL',
]);
export type ConversationProcessingState = z.infer<typeof ConversationProcessingStateSchema>;

export const ReadinessStateSchema = z.enum([
  'ENGINEERING_COMPLETE',
  'STAGING_VALIDATED',
  'PRODUCTION_DEPLOYMENT_READY',
  'EXTERNALLY_BLOCKED',
  'PRODUCTION_APPROVED',
  'PRODUCTION_ACTIVE',
]);
export type ReadinessState = z.infer<typeof ReadinessStateSchema>;

export const VerificationLevelSchema = z.enum(['NONE', 'LIGHT', 'STRONG', 'OPERATOR_ONLY']);
export type VerificationLevel = z.infer<typeof VerificationLevelSchema>;

export const DataClassificationSchema = z.enum([
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
]);
export type DataClassification = z.infer<typeof DataClassificationSchema>;
