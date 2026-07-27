import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const environmentEnum = pgEnum('environment', ['development', 'staging', 'production']);
export const dataClassificationEnum = pgEnum('data_classification', [
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
]);
export const capabilityStateEnum = pgEnum('provider_capability_state', [
  'SUPPORTED',
  'UNSUPPORTED',
  'ACCOUNT_RESTRICTED',
  'NOT_CONFIGURED',
  'TEMPORARILY_UNAVAILABLE',
]);
export const providerIntegrationEnvironmentEnum = pgEnum('provider_integration_environment', [
  'SANDBOX',
  'PRODUCTION',
]);
export const providerIntegrationStatusEnum = pgEnum('provider_integration_status', [
  'NOT_CONFIGURED',
  'VALIDATING',
  'CONNECTED',
  'DEGRADED',
  'INVALID_CREDENTIALS',
  'AGENT_UNAVAILABLE',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'DISCONNECTED',
  'ERROR',
]);
/**
 * The DB column default (WEBSOCKET_ONLY) exists to backfill existing rows without changing their
 * working runtime behaviour. Newly created integrations get WEBRTC_PREFERRED explicitly at the
 * application layer (see `ElevenLabsIntegrationService.connect()`) — these are deliberately two
 * different defaults at two different layers.
 */
export const elevenLabsVoiceModeEnum = pgEnum('elevenlabs_voice_mode', [
  'WEBRTC_PREFERRED',
  'WEBSOCKET_ONLY',
]);
export const elevenLabsDiagnosticStatusEnum = pgEnum('elevenlabs_diagnostic_status', [
  'PASS',
  'WARNING',
  'FAIL',
  'NOT_CONFIGURED',
]);
export const voiceSessionTransportEnum = pgEnum('voice_session_transport', ['WEBRTC', 'WEBSOCKET']);
export const mediaVerificationStatusEnum = pgEnum('media_verification_status', ['PASS', 'FAILED']);
export const aiosLifecycleStateEnum = pgEnum('aios_lifecycle_state', [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'ACTIVE',
  'SUPERSEDED',
  'ROLLED_BACK',
  'ARCHIVED',
]);
export const aiosProviderStatusEnum = pgEnum('aios_provider_status', [
  'NOT_CONFIGURED',
  'VALIDATING',
  'CONNECTED',
  'DEGRADED',
  'INVALID_CREDENTIALS',
  'DISABLED',
  'DISCONNECTED',
  'ERROR',
]);
export const aiosResultStateEnum = pgEnum('aios_result_state', [
  'SUCCESS',
  'PARTIAL',
  'VALIDATION_FAILED',
  'SCHEMA_REJECTED',
  'EVIDENCE_INSUFFICIENT',
  'POLICY_REJECTED',
  'MODEL_NOT_CONFIGURED',
  'PROVIDER_NOT_CONFIGURED',
  'MODEL_NOT_AVAILABLE',
  'RATE_LIMITED',
  'TIMEOUT',
  'UNAVAILABLE',
  'COST_LIMIT_REACHED',
  'FALLBACK_USED',
  'UNKNOWN_FAILURE',
]);
/**
 * Every AI-produced intelligence artifact must declare where it sits in the provisional/final
 * lifecycle — never inferred from a capability key or call site. PROVISIONAL is per-turn/live
 * evidence (e.g. Simulation Lab's INTERACTION_ANALYSIS during an active conversation); FINAL is
 * post-conversation evidence produced against the finalised transcript. SUPERSEDED is reserved for
 * a future reprocessing system and is not set anywhere yet.
 */
export const aiIntelligenceStateEnum = pgEnum('ai_intelligence_state', [
  'PROVISIONAL',
  'FINAL',
  'SUPERSEDED',
]);
export const aiosReadinessStateEnum = pgEnum('aios_readiness_state', [
  'NOT_CONFIGURED',
  'SANDBOX_CONFIGURED',
  'CONFIGURED_WITH_BLOCKERS',
  'STAGING_VALIDATED',
  'PRODUCTION_DEPLOYMENT_READY',
  'EXTERNALLY_BLOCKED',
  'PRODUCTION_APPROVED',
]);
export const syncStateEnum = pgEnum('sync_state', [
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
export const agentReleaseStateEnum = pgEnum('agent_release_state', [
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
export const knowledgeStateEnum = pgEnum('knowledge_state', [
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
export const processingStateEnum = pgEnum('conversation_processing_state', [
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
export const readinessStateEnum = pgEnum('readiness_state', [
  'ENGINEERING_COMPLETE',
  'STAGING_VALIDATED',
  'PRODUCTION_DEPLOYMENT_READY',
  'EXTERNALLY_BLOCKED',
  'PRODUCTION_APPROVED',
  'PRODUCTION_ACTIVE',
]);
export const verificationStateEnum = pgEnum('verification_state', [
  'NOT_REQUIRED',
  'PENDING',
  'VERIFIED_LIGHT',
  'VERIFIED_STRONG',
  'FAILED',
  'EXPIRED',
]);
export const workStateEnum = pgEnum('work_state', [
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
]);
export const outcomeEnum = pgEnum('call_outcome', [
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
export const correctionTargetEnum = pgEnum('correction_target', [
  'CANONICAL_TRANSCRIPT',
  'REDACTED_TRANSCRIPT',
  'SUMMARY',
  'CLASSIFICATION',
  'ENTITY',
  'CUSTOMER_LINK',
]);
export const correctionStatusEnum = pgEnum('correction_status', [
  'PROPOSED',
  'APPROVED',
  'REJECTED',
  'APPLIED',
]);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

export const providerWorkspaces = pgTable(
  'provider_workspaces',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: text('provider').default('ELEVENLABS').notNull(),
    environment: environmentEnum('environment').notNull(),
    providerWorkspaceId: text('provider_workspace_id').notNull(),
    region: text('region').notNull(),
    displayName: text('display_name').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    synthetic: boolean('synthetic').default(false).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('provider_workspace_identity').on(table.environment, table.providerWorkspaceId),
  ],
);

export const providerCredentialReferences = pgTable('provider_credential_references', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id')
    .references(() => providerWorkspaces.id)
    .notNull(),
  secretReference: text('secret_reference').notNull(),
  scopes: text('scopes').array().notNull(),
  rotatedAt: timestamp('rotated_at', { withTimezone: true }),
  active: boolean('active').default(true).notNull(),
  ...timestamps,
});

export const encryptedProviderCredentials = pgTable('encrypted_provider_credentials', {
  id: uuid('id').defaultRandom().primaryKey(),
  secretReference: text('secret_reference').notNull().unique(),
  provider: text('provider').notNull(),
  ciphertext: text('ciphertext').notNull(),
  initializationVector: text('initialization_vector').notNull(),
  authenticationTag: text('authentication_tag').notNull(),
  keyVersion: text('key_version').notNull(),
  rotatedAt: timestamp('rotated_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ...timestamps,
});

export const providerIntegrations = pgTable(
  'provider_integrations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: text('provider').notNull(),
    workspaceId: uuid('workspace_id')
      .references(() => providerWorkspaces.id)
      .notNull(),
    credentialReferenceId: uuid('credential_reference_id')
      .references(() => providerCredentialReferences.id)
      .notNull(),
    connectionLabel: text('connection_label').notNull(),
    environment: providerIntegrationEnvironmentEnum('environment').notNull(),
    status: providerIntegrationStatusEnum('status').notNull(),
    defaultAgentId: text('default_agent_id'),
    defaultVoiceId: text('default_voice_id'),
    agentCount: integer('agent_count').default(0).notNull(),
    voiceCount: integer('voice_count').default(0).notNull(),
    capabilitySnapshot: jsonb('capability_snapshot')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
    verifiedAgentName: text('verified_agent_name'),
    agentVerifiedAt: timestamp('agent_verified_at', { withTimezone: true }),
    receptionistDisplayName: text('receptionist_display_name'),
    greetingOverride: text('greeting_override'),
    language: text('language'),
    voiceTestingEnabled: boolean('voice_testing_enabled').default(true).notNull(),
    chatTestingEnabled: boolean('chat_testing_enabled').default(true).notNull(),
    transcriptCapture: boolean('transcript_capture').default(true).notNull(),
    summaryGeneration: boolean('summary_generation').default(false).notNull(),
    escalationDetection: boolean('escalation_detection').default(false).notNull(),
    voiceMode: elevenLabsVoiceModeEnum('voice_mode').default('WEBSOCKET_ONLY').notNull(),
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by').notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('provider_integration_provider_unique').on(table.provider)],
);

export const providerCapabilitySnapshots = pgTable(
  'provider_capability_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .references(() => providerWorkspaces.id)
      .notNull(),
    capability: text('capability').notNull(),
    state: capabilityStateEnum('state').notNull(),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().default({}).notNull(),
    checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('provider_capability_current').on(table.workspaceId, table.capability, table.checkedAt),
  ],
);

/**
 * A persisted run of the ElevenLabs provider diagnostics workflow. Every check is a real round
 * trip against the provider (or an honest static/config note where the provider API genuinely
 * doesn't expose the fact, e.g. turn_timeout) — never a config-presence proxy. Modeled after the
 * existing `readinessEvaluations` shape.
 */
export const elevenLabsDiagnosticRuns = pgTable(
  'elevenlabs_diagnostic_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    integrationId: uuid('integration_id')
      .references(() => providerIntegrations.id)
      .notNull(),
    status: elevenLabsDiagnosticStatusEnum('status').notNull(),
    checks: jsonb('checks')
      .$type<
        Array<{
          key: string;
          label: string;
          status: 'PASS' | 'WARNING' | 'FAIL';
          detail: string;
        }>
      >()
      .notNull(),
    warnings: text('warnings').array().notNull(),
    errors: text('errors').array().notNull(),
    checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow().notNull(),
    checkedBy: text('checked_by').notNull(),
  },
  (table) => [
    index('elevenlabs_diagnostic_runs_integration_idx').on(table.integrationId, table.checkedAt),
  ],
);

/**
 * Real evidence that a browser voice session actually connected and exchanged audio, distinct
 * from `elevenLabsDiagnosticRuns`'s server-side bootstrap checks. A passing token/signed-url round
 * trip alone never implies this table has a PASS row — this is written only from real Simulation
 * Lab session lifecycle events (connect, first agent message, disconnect/end).
 */
export const elevenLabsMediaVerifications = pgTable(
  'elevenlabs_media_verifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    integrationId: uuid('integration_id')
      .references(() => providerIntegrations.id)
      .notNull(),
    voiceSessionId: uuid('voice_session_id').references((): AnyPgColumn => voiceSessions.id),
    transport: voiceSessionTransportEnum('transport').notNull(),
    status: mediaVerificationStatusEnum('status').notNull(),
    microphoneEstablished: boolean('microphone_established').default(false).notNull(),
    agentAudioReceived: boolean('agent_audio_received').default(false).notNull(),
    transcriptEventsReceived: boolean('transcript_events_received').default(false).notNull(),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endReason: text('end_reason'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('elevenlabs_media_verifications_integration_idx').on(
      table.integrationId,
      table.transport,
      table.verifiedAt,
    ),
  ],
);

export const providerRequestLogs = pgTable(
  'provider_request_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').references(() => providerWorkspaces.id),
    correlationId: text('correlation_id').notNull(),
    providerRequestId: text('provider_request_id'),
    operation: text('operation').notNull(),
    resultStatus: text('result_status').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    safeError: jsonb('safe_error').$type<Record<string, unknown>>(),
    cost: numeric('cost', { precision: 18, scale: 6 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('provider_request_correlation').on(table.correlationId)],
);

export const voiceAgents = pgTable('voice_agents', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  purpose: text('purpose').notNull(),
  archived: boolean('archived').default(false).notNull(),
  synthetic: boolean('synthetic').default(false).notNull(),
  ...timestamps,
});

export const agentConfigVersions = pgTable(
  'agent_config_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    agentId: uuid('agent_id')
      .references(() => voiceAgents.id)
      .notNull(),
    version: integer('version').notNull(),
    state: agentReleaseStateEnum('state').default('DRAFT').notNull(),
    configuration: jsonb('configuration').$type<Record<string, unknown>>().notNull(),
    checksum: text('checksum').notNull(),
    changeReason: text('change_reason').notNull(),
    authorId: uuid('author_id').notNull(),
    synthetic: boolean('synthetic').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('agent_version_unique').on(table.agentId, table.version),
    index('agent_state_idx').on(table.agentId, table.state),
  ],
);

export const agentApprovals = pgTable(
  'agent_approvals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    agentVersionId: uuid('agent_version_id')
      .references(() => agentConfigVersions.id)
      .notNull(),
    reviewerId: uuid('reviewer_id').notNull(),
    decision: text('decision').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('agent_approval_reviewer').on(table.agentVersionId, table.reviewerId)],
);

export const agentDeployments = pgTable('agent_deployments', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentVersionId: uuid('agent_version_id')
    .references(() => agentConfigVersions.id)
    .notNull(),
  workspaceId: uuid('workspace_id')
    .references(() => providerWorkspaces.id)
    .notNull(),
  environment: environmentEnum('environment').notNull(),
  providerAgentId: text('provider_agent_id'),
  providerBranchId: text('provider_branch_id'),
  providerVersionId: text('provider_version_id'),
  localChecksum: text('local_checksum').notNull(),
  remoteChecksum: text('remote_checksum'),
  syncState: syncStateEnum('sync_state').default('PUBLISH_PENDING').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  ...timestamps,
});

export const agentDriftFindings = pgTable('agent_drift_findings', {
  id: uuid('id').defaultRandom().primaryKey(),
  deploymentId: uuid('deployment_id')
    .references(() => agentDeployments.id)
    .notNull(),
  severity: text('severity').notNull(),
  path: text('path').notNull(),
  localValueHash: text('local_value_hash'),
  remoteValueHash: text('remote_value_hash'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolution: text('resolution'),
  ...timestamps,
});

export const voiceSessionStatusEnum = pgEnum('voice_session_status', [
  'INITIATED',
  'CONNECTED',
  'ENDED',
  'FAILED',
]);

export const voiceSessions = pgTable('voice_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: uuid('agent_id')
    .references(() => voiceAgents.id)
    .notNull(),
  agentDeploymentId: uuid('agent_deployment_id')
    .references(() => agentDeployments.id)
    .notNull(),
  workspaceId: uuid('workspace_id')
    .references(() => providerWorkspaces.id)
    .notNull(),
  environment: environmentEnum('environment').notNull(),
  status: voiceSessionStatusEnum('status').default('INITIATED').notNull(),
  transport: voiceSessionTransportEnum('transport').notNull(),
  providerConversationId: text('provider_conversation_id'),
  initiatedBy: text('initiated_by').notNull(),
  sessionExpiresAt: timestamp('session_expires_at', { withTimezone: true }).notNull(),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  endReason: text('end_reason'),
  errorCode: text('error_code'),
  /**
   * The three fields below make a WebRTC->WebSocket fallback traceable as one continuous attempt
   * chain under a single ReceptionistSession, never two unrelated runtime records. See
   * `receptionist-session.service.ts`'s `retryWithFallbackTransport()`.
   */
  receptionistSessionId: uuid('receptionist_session_id').references(
    (): AnyPgColumn => receptionistSessions.id,
  ),
  replacesVoiceSessionId: uuid('replaces_voice_session_id').references(
    (): AnyPgColumn => voiceSessions.id,
  ),
  failureCategory: text('failure_category'),
  synthetic: boolean('synthetic').default(false).notNull(),
  ...timestamps,
});

export const receptionistSessionModeEnum = pgEnum('receptionist_session_mode', ['VOICE', 'TEXT']);
export const receptionistSessionPurposeEnum = pgEnum('receptionist_session_purpose', [
  'TEST',
  'TRAINING',
  'DEBUG',
  'VALIDATION',
]);
export const receptionistSessionSourceEnum = pgEnum('receptionist_session_source', [
  'SCENARIO',
  'MANUAL',
  'LIVE',
]);
export const receptionistSessionStatusEnum = pgEnum('receptionist_session_status', [
  'ACTIVE',
  'ENDED',
]);

/**
 * A first-class, reusable operator conversation with the receptionist — not a disposable "test"
 * record. The same object backs Live Receptionist Test today and can later back onboarding,
 * demos, regression and support-training flows without a schema change (see `purpose`/`source`).
 * Deliberately holds only `latestAnalysisArtifactId`, never denormalized escalation/booking/
 * confidence/routing/policy columns — every read resolves the real `aiArtifacts` row so the
 * session and its evidence can never drift apart.
 */
export const receptionistSessions = pgTable('receptionist_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentVersionId: uuid('agent_version_id')
    .references(() => agentConfigVersions.id)
    .notNull(),
  workspaceId: uuid('workspace_id')
    .references(() => providerWorkspaces.id)
    .notNull(),
  environment: environmentEnum('environment').notNull(),
  mode: receptionistSessionModeEnum('mode').notNull(),
  purpose: receptionistSessionPurposeEnum('purpose').default('TEST').notNull(),
  source: receptionistSessionSourceEnum('source').notNull(),
  status: receptionistSessionStatusEnum('status').default('ACTIVE').notNull(),
  label: text('label').notNull(),
  voiceSessionId: uuid('voice_session_id').references(() => voiceSessions.id),
  conversationId: uuid('conversation_id').references(() => conversations.id),
  transcriptRevisionId: uuid('transcript_revision_id').references(() => transcriptRevisions.id),
  latestAnalysisArtifactId: uuid('latest_analysis_artifact_id').references(() => aiArtifacts.id),
  startedBy: text('started_by').notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  endReason: text('end_reason'),
  messageCount: integer('message_count').default(0).notNull(),
  synthetic: boolean('synthetic').default(false).notNull(),
  ...timestamps,
});

export const voiceProfiles = pgTable(
  'voice_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    providerVoiceId: text('provider_voice_id').notNull(),
    workspaceId: uuid('workspace_id')
      .references(() => providerWorkspaces.id)
      .notNull(),
    name: text('name').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
    available: boolean('available').default(true).notNull(),
    approved: boolean('approved').default(false).notNull(),
    custom: boolean('custom').default(false).notNull(),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex('voice_provider_unique').on(table.workspaceId, table.providerVoiceId)],
);

export const voicePreviews = pgTable('voice_previews', {
  id: uuid('id').defaultRandom().primaryKey(),
  voiceProfileId: uuid('voice_profile_id')
    .references(() => voiceProfiles.id)
    .notNull(),
  objectKey: text('object_key').notNull(),
  checksum: text('checksum').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const voiceAssignments = pgTable(
  'voice_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    agentVersionId: uuid('agent_version_id')
      .references(() => agentConfigVersions.id)
      .notNull(),
    voiceProfileId: uuid('voice_profile_id')
      .references(() => voiceProfiles.id)
      .notNull(),
    language: text('language').notNull(),
    environment: environmentEnum('environment').notNull(),
    fallback: boolean('fallback').default(false).notNull(),
    approved: boolean('approved').default(false).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('voice_assignment_scope').on(
      table.agentVersionId,
      table.language,
      table.environment,
      table.fallback,
    ),
  ],
);

export const voiceConsentRecords = pgTable('voice_consent_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  voiceProfileId: uuid('voice_profile_id')
    .references(() => voiceProfiles.id)
    .notNull(),
  speakerIdentityReference: text('speaker_identity_reference').notNull(),
  consentObjectKey: text('consent_object_key').notNull(),
  permittedUse: text('permitted_use').notNull(),
  validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ...timestamps,
});

export const knowledgeAssets = pgTable('knowledge_assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  sourceType: text('source_type').notNull(),
  category: text('category').notNull(),
  park: text('park'),
  language: text('language').notNull(),
  ownerId: uuid('owner_id').notNull(),
  riskClass: text('risk_class').notNull(),
  synthetic: boolean('synthetic').default(false).notNull(),
  ...timestamps,
});

export const knowledgeVersions = pgTable(
  'knowledge_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assetId: uuid('asset_id')
      .references(() => knowledgeAssets.id)
      .notNull(),
    version: integer('version').notNull(),
    state: knowledgeStateEnum('state').default('DRAFT').notNull(),
    content: text('content').notNull(),
    contentChecksum: text('content_checksum').notNull(),
    extractedChecksum: text('extracted_checksum'),
    effectiveAt: timestamp('effective_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    changeReason: text('change_reason').notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('knowledge_version_unique').on(table.assetId, table.version)],
);

export const knowledgeSourceFiles = pgTable('knowledge_source_files', {
  id: uuid('id').defaultRandom().primaryKey(),
  knowledgeVersionId: uuid('knowledge_version_id')
    .references(() => knowledgeVersions.id)
    .notNull(),
  objectKey: text('object_key').notNull(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  checksum: text('checksum').notNull(),
  malwareStatus: text('malware_status').notNull(),
  sanitizationStatus: text('sanitization_status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const knowledgeApprovals = pgTable(
  'knowledge_approvals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    knowledgeVersionId: uuid('knowledge_version_id')
      .references(() => knowledgeVersions.id)
      .notNull(),
    reviewerId: uuid('reviewer_id').notNull(),
    decision: text('decision').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('knowledge_approval_reviewer').on(table.knowledgeVersionId, table.reviewerId),
  ],
);

export const knowledgeSyncs = pgTable(
  'knowledge_syncs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    knowledgeVersionId: uuid('knowledge_version_id')
      .references(() => knowledgeVersions.id)
      .notNull(),
    workspaceId: uuid('workspace_id')
      .references(() => providerWorkspaces.id)
      .notNull(),
    providerDocumentId: text('provider_document_id'),
    syncState: syncStateEnum('sync_state').default('PUBLISH_PENDING').notNull(),
    localChecksum: text('local_checksum').notNull(),
    remoteChecksum: text('remote_checksum'),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastError: jsonb('last_error').$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('knowledge_sync_release_workspace_unique').on(
      table.knowledgeVersionId,
      table.workspaceId,
    ),
  ],
);

export const knowledgeAssignments = pgTable(
  'knowledge_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    knowledgeVersionId: uuid('knowledge_version_id')
      .references(() => knowledgeVersions.id)
      .notNull(),
    agentVersionId: uuid('agent_version_id')
      .references(() => agentConfigVersions.id)
      .notNull(),
    language: text('language').notNull(),
    park: text('park'),
    active: boolean('active').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('knowledge_assignment_unique').on(
      table.knowledgeVersionId,
      table.agentVersionId,
      table.language,
    ),
  ],
);

export const knowledgeConflicts = pgTable('knowledge_conflicts', {
  id: uuid('id').defaultRandom().primaryKey(),
  leftVersionId: uuid('left_version_id')
    .references(() => knowledgeVersions.id)
    .notNull(),
  rightVersionId: uuid('right_version_id')
    .references(() => knowledgeVersions.id)
    .notNull(),
  conflictType: text('conflict_type').notNull(),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  ...timestamps,
});

export const knowledgeGaps = pgTable('knowledge_gaps', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  language: text('language').notNull(),
  park: text('park'),
  frequency: integer('frequency').default(1).notNull(),
  evidenceIds: text('evidence_ids').array().notNull(),
  status: workStateEnum('status').default('OPEN').notNull(),
  ownerId: uuid('owner_id'),
  ...timestamps,
});

export const agentTests = pgTable('agent_tests', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  ownerId: uuid('owner_id').notNull(),
  testType: text('test_type').notNull(),
  riskLevel: text('risk_level').notNull(),
  archived: boolean('archived').default(false).notNull(),
  ...timestamps,
});

export const agentTestVersions = pgTable(
  'agent_test_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    testId: uuid('test_id')
      .references(() => agentTests.id)
      .notNull(),
    version: integer('version').notNull(),
    definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
    checksum: text('checksum').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('agent_test_version_unique').on(table.testId, table.version)],
);

export const providerTestMappings = pgTable(
  'provider_test_mappings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    testVersionId: uuid('test_version_id')
      .references(() => agentTestVersions.id)
      .notNull(),
    workspaceId: uuid('workspace_id')
      .references(() => providerWorkspaces.id)
      .notNull(),
    providerTestId: text('provider_test_id'),
    syncState: syncStateEnum('sync_state').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('provider_test_mapping_unique').on(table.testVersionId, table.workspaceId),
  ],
);

export const testRuns = pgTable('test_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentVersionId: uuid('agent_version_id')
    .references(() => agentConfigVersions.id)
    .notNull(),
  providerRunId: text('provider_run_id'),
  status: text('status').notNull(),
  repeatCount: integer('repeat_count').default(1).notNull(),
  passCount: integer('pass_count').default(0).notNull(),
  failCount: integer('fail_count').default(0).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const testEvidence = pgTable('test_evidence', {
  id: uuid('id').defaultRandom().primaryKey(),
  testRunId: uuid('test_run_id')
    .references(() => testRuns.id)
    .notNull(),
  testVersionId: uuid('test_version_id')
    .references(() => agentTestVersions.id)
    .notNull(),
  providerEvidenceObjectKey: text('provider_evidence_object_key'),
  internalEvaluation: jsonb('internal_evaluation').$type<Record<string, unknown>>().notNull(),
  passed: boolean('passed').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const releaseGateEvaluations = pgTable('release_gate_evaluations', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentVersionId: uuid('agent_version_id')
    .references(() => agentConfigVersions.id)
    .notNull(),
  allowed: boolean('allowed').notNull(),
  blockers: text('blockers').array().notNull(),
  evidenceIds: text('evidence_ids').array().notNull(),
  evaluatorVersion: text('evaluator_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const rawWebhookEvents = pgTable(
  'raw_webhook_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .references(() => providerWorkspaces.id)
      .notNull(),
    providerEventId: text('provider_event_id'),
    providerConversationId: text('provider_conversation_id').notNull(),
    eventType: text('event_type').notNull(),
    eventTimestamp: timestamp('event_timestamp', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
    rawObjectKey: text('raw_object_key').notNull(),
    rawChecksum: text('raw_checksum').notNull(),
    signatureMetadata: jsonb('signature_metadata').$type<Record<string, unknown>>().notNull(),
    classification: dataClassificationEnum('classification').default('RESTRICTED').notNull(),
  },
  (table) => [
    uniqueIndex('raw_webhook_idempotency').on(
      table.workspaceId,
      table.providerConversationId,
      table.eventType,
      table.eventTimestamp,
    ),
  ],
);

export const webhookInboxEntries = pgTable(
  'webhook_inbox_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    rawEventId: uuid('raw_event_id')
      .references(() => rawWebhookEvents.id)
      .notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    state: text('state').default('PENDING').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    workflowId: text('workflow_id'),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).defaultNow().notNull(),
    lastError: jsonb('last_error').$type<Record<string, unknown>>(),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('webhook_inbox_raw_event_unique').on(table.rawEventId),
    uniqueIndex('webhook_inbox_idempotency_unique').on(table.idempotencyKey),
    index('webhook_inbox_pending').on(table.state, table.nextAttemptAt),
  ],
);

export const providerConversations = pgTable(
  'provider_conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .references(() => providerWorkspaces.id)
      .notNull(),
    providerConversationId: text('provider_conversation_id').notNull(),
    providerAgentId: text('provider_agent_id').notNull(),
    providerBranchId: text('provider_branch_id'),
    providerVersionId: text('provider_version_id'),
    providerTranscript: jsonb('provider_transcript').$type<unknown[]>().notNull(),
    providerAnalysis: jsonb('provider_analysis').$type<Record<string, unknown>>(),
    providerMetadata: jsonb('provider_metadata').$type<Record<string, unknown>>().notNull(),
    hasAudio: boolean('has_audio').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('provider_conversation_unique').on(table.workspaceId, table.providerConversationId),
  ],
);

export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  providerConversationId: uuid('provider_conversation_id')
    .references(() => providerConversations.id)
    .notNull(),
  agentVersionId: uuid('agent_version_id').references(() => agentConfigVersions.id),
  processingState: processingStateEnum('processing_state').default('RECEIVED').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  language: text('language'),
  park: text('park'),
  sensitive: boolean('sensitive').default(false).notNull(),
  synthetic: boolean('synthetic').default(false).notNull(),
  ...timestamps,
});

export const conversationProcessingRuns = pgTable('conversation_processing_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id')
    .references(() => conversations.id)
    .notNull(),
  workflowId: text('workflow_id').notNull(),
  attempt: integer('attempt').default(1).notNull(),
  state: processingStateEnum('state').notNull(),
  error: jsonb('error').$type<Record<string, unknown>>(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const transcriptRevisions = pgTable(
  'transcript_revisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .references(() => conversations.id)
      .notNull(),
    revision: integer('revision').notNull(),
    revisionType: text('revision_type').notNull(),
    sourceRevisionId: uuid('source_revision_id'),
    reason: text('reason').notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('transcript_revision_unique').on(table.conversationId, table.revision)],
);

export const transcriptTurns = pgTable(
  'transcript_turns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    revisionId: uuid('revision_id')
      .references(() => transcriptRevisions.id)
      .notNull(),
    sequence: integer('sequence').notNull(),
    speaker: text('speaker').notNull(),
    content: text('content').notNull(),
    startedAtMs: integer('started_at_ms'),
    endedAtMs: integer('ended_at_ms'),
    providerTurnId: text('provider_turn_id'),
    classification: dataClassificationEnum('classification').default('CONFIDENTIAL').notNull(),
    quality: jsonb('quality').$type<Record<string, unknown>>().default({}).notNull(),
  },
  (table) => [uniqueIndex('transcript_turn_sequence').on(table.revisionId, table.sequence)],
);

export const redactions = pgTable('redactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  turnId: uuid('turn_id')
    .references(() => transcriptTurns.id)
    .notNull(),
  redactionType: text('redaction_type').notNull(),
  detectorVersion: text('detector_version').notNull(),
  startOffset: integer('start_offset'),
  endOffset: integer('end_offset'),
  restrictedMetadata: jsonb('restricted_metadata')
    .$type<Record<string, unknown>>()
    .default({})
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const corrections = pgTable(
  'corrections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .references(() => conversations.id)
      .notNull(),
    targetType: correctionTargetEnum('target_type').notNull(),
    targetRecordId: uuid('target_record_id').notNull(),
    revision: integer('revision').notNull(),
    status: correctionStatusEnum('status').default('PROPOSED').notNull(),
    reason: text('reason').notNull(),
    proposedValue: jsonb('proposed_value').$type<Record<string, unknown>>().notNull(),
    proposedBy: uuid('proposed_by').notNull(),
    decidedBy: uuid('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    appliedRecordId: uuid('applied_record_id'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('correction_target_revision_unique').on(
      table.targetType,
      table.targetRecordId,
      table.revision,
    ),
    index('correction_conversation_status').on(table.conversationId, table.status),
  ],
);

export const correctionHistory = pgTable('correction_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  correctionId: uuid('correction_id')
    .references(() => corrections.id)
    .notNull(),
  eventType: text('event_type').notNull(),
  fromStatus: correctionStatusEnum('from_status'),
  toStatus: correctionStatusEnum('to_status').notNull(),
  actorId: uuid('actor_id').notNull(),
  reason: text('reason').notNull(),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const toolInvocations = pgTable(
  'tool_invocations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .references(() => conversations.id)
      .notNull(),
    registryKey: text('registry_key').notNull(),
    registryVersion: integer('registry_version').notNull(),
    providerRequestId: text('provider_request_id'),
    request: jsonb('request').$type<Record<string, unknown>>().notNull(),
    resultStatus: text('result_status').notNull(),
    result: jsonb('result').$type<Record<string, unknown>>().notNull(),
    verificationState: verificationStateEnum('verification_state').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('tool_invocation_provider_request_unique').on(table.providerRequestId)],
);

export const callSummaries = pgTable(
  'call_summaries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .references(() => conversations.id)
      .notNull(),
    transcriptRevisionId: uuid('transcript_revision_id')
      .references(() => transcriptRevisions.id)
      .notNull(),
    revision: integer('revision').notNull(),
    summary: jsonb('summary').$type<Record<string, unknown>>().notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    modelVersion: text('model_version'),
    promptVersion: text('prompt_version').notNull(),
    schemaVersion: text('schema_version').notNull(),
    // The physical FK is added in the AIOS migration because the authoritative
    // artifact table is declared later in this module. The projection remains optional.
    aiArtifactId: uuid('ai_artifact_id'),
    evidenceCoverage: numeric('evidence_coverage', { precision: 5, scale: 4 }).notNull(),
    correctedBy: uuid('corrected_by'),
    correctionReason: text('correction_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('call_summary_revision').on(table.conversationId, table.revision)],
);

export const callClassifications = pgTable('call_classifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id')
    .references(() => conversations.id)
    .notNull(),
  transcriptRevisionId: uuid('transcript_revision_id')
    .references(() => transcriptRevisions.id)
    .notNull(),
  revision: integer('revision').notNull(),
  primaryIntent: text('primary_intent').notNull(),
  secondaryIntents: text('secondary_intents').array().notNull(),
  taxonomyVersion: text('taxonomy_version').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  promptVersion: text('prompt_version').notNull(),
  schemaVersion: text('schema_version').notNull(),
  aiArtifactId: uuid('ai_artifact_id'),
  confidence: numeric('confidence', { precision: 5, scale: 4 }).notNull(),
  evidenceIds: text('evidence_ids').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const callEntities = pgTable('call_entities', {
  id: uuid('id').defaultRandom().primaryKey(),
  classificationId: uuid('classification_id')
    .references(() => callClassifications.id)
    .notNull(),
  entityType: text('entity_type').notNull(),
  value: text('value').notNull(),
  confidence: numeric('confidence', { precision: 5, scale: 4 }).notNull(),
  evidenceIds: text('evidence_ids').array().notNull(),
});

export const callOutcomes = pgTable('call_outcomes', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id')
    .references(() => conversations.id)
    .notNull(),
  outcome: outcomeEnum('outcome').notNull(),
  evidenceIds: text('evidence_ids').array().notNull(),
  policyVersion: text('policy_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * The canonical, per-conversation index of which intelligence is current, complete, and eligible
 * for operational use. Artifacts (aiArtifacts, callSummaries, callClassifications, callOutcomes)
 * remain the source of intelligence truth; this table is the source of discovery/completeness
 * truth — it never duplicates artifact payload content, only references and counts them.
 */
export const conversationIntelligenceManifestStatusEnum = pgEnum(
  'conversation_intelligence_manifest_status',
  ['COMPLETE', 'PARTIAL', 'INSUFFICIENT_EVIDENCE', 'FAILED'],
);

export const conversationIntelligenceManifests = pgTable(
  'conversation_intelligence_manifests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .references(() => conversations.id)
      .notNull(),
    // Nullable: an INSUFFICIENT_EVIDENCE manifest has no transcript revision to reference at all.
    transcriptRevisionId: uuid('transcript_revision_id').references(() => transcriptRevisions.id),
    // Tracks supersession of the same profile (a future reprocessing/transcript-correction run
    // replacing this manifest) — distinct from processingProfileVersion below. Reserved headroom:
    // no code path sets this above 1 yet, matching the ai_intelligence_state SUPERSEDED precedent.
    manifestVersion: integer('manifest_version').default(1).notNull(),
    // Which version of the required-outputs profile (summary/classification/outcome today)
    // computed this manifest's completeness. When a future capability (sentiment, quality,
    // follow-up, knowledge gap) joins the required set, that becomes profile version 2; this
    // manifest's completeness ratio always means "against its own profile version," never
    // silently reinterpreted against a later, larger required-outputs set.
    processingProfileVersion: integer('processing_profile_version').default(1).notNull(),
    synthetic: boolean('synthetic').default(false).notNull(),
    status: conversationIntelligenceManifestStatusEnum('status').notNull(),
    expectedArtifactCount: integer('expected_artifact_count').notNull(),
    presentArtifactCount: integer('present_artifact_count').notNull(),
    completenessRatio: numeric('completeness_ratio', { precision: 5, scale: 4 }).notNull(),
    artifactIndex: jsonb('artifact_index').$type<Record<string, unknown>>().notNull(),
    warnings: text('warnings').array().default([]).notNull(),
    // Reserved for a future reprocessing/versioning system — never set by any code path yet.
    supersedesManifestId: uuid('supersedes_manifest_id'),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    processingCompletedAt: timestamp('processing_completed_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Partial unique index — only one CURRENT manifest per conversation (supersededAt IS NULL),
    // deliberately not a permanent constraint on conversationId alone: it must remain possible for
    // a future reprocessing/transcript-correction run to insert manifestVersion 2 while the prior
    // row is preserved (supersededAt set), without a later destructive uniqueness migration. Every
    // current-manifest read or idempotency check filters on conversationId + supersededAt IS NULL.
    uniqueIndex('conversation_intelligence_manifest_current_unique')
      .on(table.conversationId)
      .where(sql`${table.supersededAt} IS NULL`),
  ],
);

export const qualityEvaluations = pgTable('quality_evaluations', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id')
    .references(() => conversations.id)
    .notNull(),
  rubricVersion: text('rubric_version').notNull(),
  scores: jsonb('scores').$type<Record<string, number>>().notNull(),
  reviewerId: uuid('reviewer_id'),
  evidenceIds: text('evidence_ids').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const customerLinks = pgTable('customer_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id')
    .references(() => conversations.id)
    .notNull(),
  externalCustomerId: text('external_customer_id').notNull(),
  method: text('method').notNull(),
  verified: boolean('verified').default(false).notNull(),
  confidence: numeric('confidence', { precision: 5, scale: 4 }).notNull(),
  correctedBy: uuid('corrected_by'),
  ...timestamps,
});

function contextSnapshotTable(name: string) {
  return pgTable(name, {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .references(() => conversations.id)
      .notNull(),
    externalId: text('external_id'),
    verificationState: verificationStateEnum('verification_state').notNull(),
    purpose: text('purpose').notNull(),
    fields: jsonb('fields').$type<Record<string, unknown>>().notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow().notNull(),
  });
}
export const customerSnapshots = contextSnapshotTable('customer_snapshots');
export const bookingSnapshots = contextSnapshotTable('booking_snapshots');
export const supportSnapshots = contextSnapshotTable('support_snapshots');

export const verificationSessions = pgTable('verification_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id')
    .references(() => conversations.id)
    .notNull(),
  level: text('level').notNull(),
  state: verificationStateEnum('state').default('PENDING').notNull(),
  factors: jsonb('factors').$type<Record<string, unknown>>().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  ...timestamps,
});

export const handoffs = pgTable('handoffs', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id')
    .references(() => conversations.id)
    .notNull(),
  routeKey: text('route_key').notNull(),
  status: text('status').notNull(),
  approvedContext: jsonb('approved_context').$type<Record<string, unknown>>().notNull(),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  providerEvidenceId: text('provider_evidence_id'),
});

function workItemTable(name: string) {
  return pgTable(
    name,
    {
      id: uuid('id').defaultRandom().primaryKey(),
      conversationId: uuid('conversation_id')
        .references(() => conversations.id)
        .notNull(),
      customerLinkId: uuid('customer_link_id').references(() => customerLinks.id),
      idempotencyKey: text('idempotency_key').notNull(),
      ownerId: uuid('owner_id'),
      priority: text('priority').notNull(),
      reason: text('reason').notNull(),
      status: workStateEnum('status').default('OPEN').notNull(),
      dueAt: timestamp('due_at', { withTimezone: true }),
      completedAt: timestamp('completed_at', { withTimezone: true }),
      ...timestamps,
    },
    (table) => [uniqueIndex(`${name}_idempotency`).on(table.idempotencyKey)],
  );
}
export const callbackRequests = workItemTable('callback_requests');
export const staffTasks = workItemTable('staff_tasks');

export const digitalLinks = pgTable(
  'digital_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id').references(() => conversations.id),
    purpose: text('purpose').notNull(),
    destinationKey: text('destination_key').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    clickedAt: timestamp('clicked_at', { withTimezone: true }),
    conversionAt: timestamp('conversion_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('digital_link_token_hash_unique').on(table.tokenHash),
    index('digital_link_expiry').on(table.expiresAt),
  ],
);

export const customerRegistrationRequests = pgTable(
  'customer_registration_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    digitalLinkId: uuid('digital_link_id')
      .references(() => digitalLinks.id)
      .notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email').notNull(),
    phone: text('phone').notNull(),
    park: text('park').notNull(),
    communicationPreferences: jsonb('communication_preferences')
      .$type<Record<string, boolean>>()
      .notNull(),
    state: text('state').default('REQUESTED').notNull(),
    externalCustomerId: text('external_customer_id'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex('registration_digital_link_unique').on(table.digitalLinkId)],
);

export const privacyConsentAcceptances = pgTable(
  'privacy_consent_acceptances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    registrationRequestId: uuid('registration_request_id')
      .references(() => customerRegistrationRequests.id)
      .notNull(),
    policyVersion: text('policy_version').notNull(),
    purpose: text('purpose').notNull(),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('privacy_consent_registration_unique').on(table.registrationRequestId)],
);

export const messageDeliveries = pgTable(
  'message_deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .references(() => conversations.id)
      .notNull(),
    digitalLinkId: uuid('digital_link_id').references(() => digitalLinks.id),
    channel: text('channel').notNull(),
    templateKey: text('template_key').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    providerMessageId: text('provider_message_id'),
    status: text('status').notNull(),
    cost: numeric('cost', { precision: 18, scale: 6 }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex('message_idempotency').on(table.idempotencyKey)],
);

export const aggregateFacts = pgTable(
  'aggregate_facts',
  {
    date: timestamp('date', { withTimezone: true }).notNull(),
    dimensionKey: text('dimension_key').notNull(),
    dimensionValue: text('dimension_value').notNull(),
    metric: text('metric').notNull(),
    // Part of the composite key (not just a filter column) so a synthetic and a real conversation
    // on the same day/dimension/value accumulate into separate counters rather than colliding.
    synthetic: boolean('synthetic').default(false).notNull(),
    count: bigint('count', { mode: 'number' }).default(0).notNull(),
    sum: numeric('sum', { precision: 20, scale: 4 }).default('0').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.date,
        table.dimensionKey,
        table.dimensionValue,
        table.metric,
        table.synthetic,
      ],
    }),
  ],
);

export const trends = pgTable('trends', {
  id: uuid('id').defaultRandom().primaryKey(),
  trendType: text('trend_type').notNull(),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  dimensions: jsonb('dimensions').$type<Record<string, string>>().notNull(),
  metric: numeric('metric', { precision: 20, scale: 4 }).notNull(),
  confidence: numeric('confidence', { precision: 5, scale: 4 }),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const reportDefinitions = pgTable('report_definitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  schedule: text('schedule').notNull(),
  classification: dataClassificationEnum('classification').notNull(),
  configuration: jsonb('configuration').$type<Record<string, unknown>>().notNull(),
  active: boolean('active').default(true).notNull(),
  ...timestamps,
});

export const reportRuns = pgTable('report_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  definitionId: uuid('definition_id')
    .references(() => reportDefinitions.id)
    .notNull(),
  status: text('status').notNull(),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  lineage: jsonb('lineage').$type<Record<string, unknown>>().notNull(),
  artifactObjectKey: text('artifact_object_key'),
  checksum: text('checksum'),
  ...timestamps,
});

export const auditEvents = pgTable(
  'audit_events',
  {
    sequence: bigint('sequence', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    eventId: uuid('event_id').defaultRandom().notNull().unique(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    purpose: text('purpose').notNull(),
    classification: dataClassificationEnum('classification').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    previousHash: text('previous_hash'),
    eventHash: text('event_hash').notNull(),
  },
  (table) => [
    index('audit_search_idx').on(table.aggregateType, table.aggregateId, table.occurredAt),
  ],
);

export const retentionPolicies = pgTable(
  'retention_policies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    environment: environmentEnum('environment').notNull(),
    dataType: text('data_type').notNull(),
    classification: dataClassificationEnum('classification').notNull(),
    retentionDays: integer('retention_days').notNull(),
    approvedBy: uuid('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    active: boolean('active').default(false).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('retention_policy_unique').on(table.environment, table.dataType)],
);

export const legalHolds = pgTable('legal_holds', {
  id: uuid('id').defaultRandom().primaryKey(),
  scopeType: text('scope_type').notNull(),
  scopeId: text('scope_id').notNull(),
  reason: text('reason').notNull(),
  placedBy: uuid('placed_by').notNull(),
  releasedBy: uuid('released_by'),
  releasedAt: timestamp('released_at', { withTimezone: true }),
  ...timestamps,
});

export const deletionJobs = pgTable('deletion_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  scopeType: text('scope_type').notNull(),
  scopeId: text('scope_id').notNull(),
  status: text('status').notNull(),
  workflowId: text('workflow_id').notNull(),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().default({}).notNull(),
  requestedBy: uuid('requested_by').notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  ...timestamps,
});

export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
});

export const permissions = pgTable('permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  description: text('description').notNull(),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .references(() => roles.id)
      .notNull(),
    permissionId: uuid('permission_id')
      .references(() => permissions.id)
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  oidcSubject: text('oidc_subject').notNull().unique(),
  displayName: text('display_name').notNull(),
  email: text('email').notNull(),
  active: boolean('active').default(true).notNull(),
  sensitiveClearance: boolean('sensitive_clearance').default(false).notNull(),
  ...timestamps,
});

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .references(() => adminUsers.id)
      .notNull(),
    roleId: uuid('role_id')
      .references(() => roles.id)
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
);

export const featureFlags = pgTable(
  'feature_flags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    key: text('key').notNull(),
    environment: environmentEnum('environment').notNull(),
    enabled: boolean('enabled').default(false).notNull(),
    configuration: jsonb('configuration').$type<Record<string, unknown>>().default({}).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('feature_flag_scope').on(table.key, table.environment)],
);

export const systemConfigurations = pgTable(
  'system_configurations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    key: text('key').notNull(),
    environment: environmentEnum('environment').notNull(),
    value: jsonb('value').$type<Record<string, unknown>>().notNull(),
    classification: dataClassificationEnum('classification').notNull(),
    approvedBy: uuid('approved_by'),
    ...timestamps,
  },
  (table) => [uniqueIndex('system_configuration_scope').on(table.key, table.environment)],
);

export const aiProviderCredentialReferences = pgTable('ai_provider_credential_references', {
  id: uuid('id').defaultRandom().primaryKey(),
  providerKey: text('provider_key').notNull(),
  secretReference: text('secret_reference').notNull().unique(),
  keyVersion: text('key_version').notNull(),
  active: boolean('active').default(true).notNull(),
  rotatedAt: timestamp('rotated_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ...timestamps,
});

export const aiProviderConnections = pgTable(
  'ai_provider_connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    providerKey: text('provider_key').notNull(),
    connectionLabel: text('connection_label').notNull(),
    environment: environmentEnum('environment').notNull(),
    credentialReferenceId: uuid('credential_reference_id').references(
      () => aiProviderCredentialReferences.id,
    ),
    status: aiosProviderStatusEnum('status').default('NOT_CONFIGURED').notNull(),
    enabled: boolean('enabled').default(false).notNull(),
    region: text('region'),
    approvedDataRegion: text('approved_data_region'),
    organizationReference: text('organization_reference'),
    safeConfiguration: jsonb('safe_configuration')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    capabilitySnapshot: jsonb('capability_snapshot')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    modelCount: integer('model_count').default(0).notNull(),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    lastSuccessfulRequestAt: timestamp('last_successful_request_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    synthetic: boolean('synthetic').default(false).notNull(),
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('ai_provider_connection_scope').on(
      table.providerKey,
      table.environment,
      table.connectionLabel,
    ),
    index('ai_provider_connection_status').on(table.environment, table.status, table.enabled),
  ],
);

export const aiProviderHealthChecks = pgTable('ai_provider_health_checks', {
  id: uuid('id').defaultRandom().primaryKey(),
  connectionId: uuid('connection_id')
    .references(() => aiProviderConnections.id)
    .notNull(),
  status: aiosProviderStatusEnum('status').notNull(),
  normalizedErrorCode: text('normalized_error_code'),
  latencyMs: integer('latency_ms'),
  checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow().notNull(),
});

export const aiModels = pgTable(
  'ai_models',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    connectionId: uuid('connection_id')
      .references(() => aiProviderConnections.id)
      .notNull(),
    providerModelId: text('provider_model_id').notNull(),
    displayName: text('display_name').notNull(),
    capabilities: jsonb('capabilities').$type<Record<string, unknown>>().default({}).notNull(),
    structuredOutput: text('structured_output').default('UNVERIFIED').notNull(),
    jsonSchemaSupport: text('json_schema_support').default('UNVERIFIED').notNull(),
    embeddingSupport: text('embedding_support').default('UNVERIFIED').notNull(),
    contextLimit: integer('context_limit'),
    outputLimit: integer('output_limit'),
    regionRestrictions: text('region_restrictions').array().default([]).notNull(),
    available: boolean('available').default(true).notNull(),
    deprecated: boolean('deprecated').default(false).notNull(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    providerMetadata: jsonb('provider_metadata')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('ai_model_provider_identity').on(table.connectionId, table.providerModelId),
  ],
);

export const aiModelApprovals = pgTable(
  'ai_model_approvals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    modelId: uuid('model_id')
      .references(() => aiModels.id)
      .notNull(),
    environment: environmentEnum('environment').notNull(),
    approved: boolean('approved').notNull(),
    approvedBy: text('approved_by').notNull(),
    reason: text('reason').notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('ai_model_approval_scope').on(table.modelId, table.environment)],
);

export const aiModelPrices = pgTable(
  'ai_model_prices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    modelId: uuid('model_id')
      .references(() => aiModels.id)
      .notNull(),
    currency: text('currency').notNull(),
    inputMicrosPerMillion: bigint('input_micros_per_million', { mode: 'number' }),
    outputMicrosPerMillion: bigint('output_micros_per_million', { mode: 'number' }),
    sourceUrl: text('source_url').notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
    approvedBy: text('approved_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('ai_model_price_effective').on(table.modelId, table.effectiveAt)],
);

export const aiCapabilities = pgTable('ai_capabilities', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  displayName: text('display_name').notNull(),
  owningProduct: text('owning_product').notNull(),
  boundedContext: text('bounded_context').notNull(),
  purpose: text('purpose').notNull(),
  inputContractKey: text('input_contract_key').notNull(),
  outputContractKey: text('output_contract_key').notNull(),
  createdBy: text('created_by').notNull(),
  ...timestamps,
});

export const aiServices = pgTable('ai_services', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  displayName: text('display_name').notNull(),
  purpose: text('purpose').notNull(),
  createdBy: text('created_by').notNull(),
  ...timestamps,
});

export const aiPipelines = pgTable('ai_pipelines', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  displayName: text('display_name').notNull(),
  purpose: text('purpose').notNull(),
  ...timestamps,
});

export const aiPipelineVersions = pgTable(
  'ai_pipeline_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pipelineId: uuid('pipeline_id')
      .references(() => aiPipelines.id)
      .notNull(),
    version: integer('version').notNull(),
    state: aiosLifecycleStateEnum('state').default('DRAFT').notNull(),
    stages: jsonb('stages').$type<unknown[]>().notNull(),
    checksum: text('checksum').notNull(),
    authorId: text('author_id').notNull(),
    approvedBy: text('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('ai_pipeline_version_unique').on(table.pipelineId, table.version),
    index('ai_pipeline_active').on(table.pipelineId, table.state),
  ],
);

export const aiContextPolicies = pgTable('ai_context_policies', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  displayName: text('display_name').notNull(),
  ...timestamps,
});

export const aiContextPolicyVersions = pgTable(
  'ai_context_policy_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    policyId: uuid('policy_id')
      .references(() => aiContextPolicies.id)
      .notNull(),
    version: integer('version').notNull(),
    state: aiosLifecycleStateEnum('state').default('DRAFT').notNull(),
    sourceRules: jsonb('source_rules').$type<unknown[]>().notNull(),
    maximumTokens: integer('maximum_tokens').notNull(),
    allowedClassifications: dataClassificationEnum('allowed_classifications').array().notNull(),
    checksum: text('checksum').notNull(),
    authorId: text('author_id').notNull(),
    approvedBy: text('approved_by'),
    ...timestamps,
  },
  (table) => [uniqueIndex('ai_context_policy_version_unique').on(table.policyId, table.version)],
);

export const aiPrompts = pgTable('ai_prompts', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  purpose: text('purpose').notNull(),
  ...timestamps,
});

export const aiPromptVersions = pgTable(
  'ai_prompt_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    promptId: uuid('prompt_id')
      .references(() => aiPrompts.id)
      .notNull(),
    version: integer('version').notNull(),
    state: aiosLifecycleStateEnum('state').default('DRAFT').notNull(),
    content: text('content').notNull(),
    checksum: text('checksum').notNull(),
    authorId: text('author_id').notNull(),
    approvedBy: text('approved_by'),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex('ai_prompt_version_unique').on(table.promptId, table.version)],
);

export const aiOutputSchemas = pgTable('ai_output_schemas', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  purpose: text('purpose').notNull(),
  ...timestamps,
});

export const aiOutputSchemaVersions = pgTable(
  'ai_output_schema_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    schemaId: uuid('schema_id')
      .references(() => aiOutputSchemas.id)
      .notNull(),
    version: integer('version').notNull(),
    state: aiosLifecycleStateEnum('state').default('DRAFT').notNull(),
    jsonSchema: jsonb('json_schema').$type<Record<string, unknown>>().notNull(),
    checksum: text('checksum').notNull(),
    codeOwned: boolean('code_owned').default(true).notNull(),
    registeredByBuild: text('registered_by_build').notNull(),
    approvedBy: text('approved_by'),
    ...timestamps,
  },
  (table) => [uniqueIndex('ai_output_schema_version_unique').on(table.schemaId, table.version)],
);

export const aiTaxonomies = pgTable('ai_taxonomies', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  purpose: text('purpose').notNull(),
  ...timestamps,
});

export const aiTaxonomyVersions = pgTable(
  'ai_taxonomy_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    taxonomyId: uuid('taxonomy_id')
      .references(() => aiTaxonomies.id)
      .notNull(),
    version: integer('version').notNull(),
    state: aiosLifecycleStateEnum('state').default('DRAFT').notNull(),
    values: jsonb('values').$type<unknown[]>().notNull(),
    checksum: text('checksum').notNull(),
    authorId: text('author_id').notNull(),
    approvedBy: text('approved_by'),
    ...timestamps,
  },
  (table) => [uniqueIndex('ai_taxonomy_version_unique').on(table.taxonomyId, table.version)],
);

export const aiRoutes = pgTable('ai_routes', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  purpose: text('purpose').notNull(),
  ...timestamps,
});

export const aiRouteVersions = pgTable(
  'ai_route_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    routeId: uuid('route_id')
      .references(() => aiRoutes.id)
      .notNull(),
    version: integer('version').notNull(),
    state: aiosLifecycleStateEnum('state').default('DRAFT').notNull(),
    environment: environmentEnum('environment').notNull(),
    providerConnectionId: uuid('provider_connection_id')
      .references(() => aiProviderConnections.id)
      .notNull(),
    modelId: uuid('model_id')
      .references(() => aiModels.id)
      .notNull(),
    fallbackProviderConnectionId: uuid('fallback_provider_connection_id').references(
      () => aiProviderConnections.id,
    ),
    fallbackModelId: uuid('fallback_model_id').references(() => aiModels.id),
    timeoutMs: integer('timeout_ms').notNull(),
    maximumRetries: integer('maximum_retries').default(0).notNull(),
    confidenceThreshold: numeric('confidence_threshold', { precision: 5, scale: 4 }).notNull(),
    maximumCostMicros: bigint('maximum_cost_micros', { mode: 'number' }),
    layers: jsonb('layers').$type<unknown[]>().default([]).notNull(),
    authorId: text('author_id').notNull(),
    approvedBy: text('approved_by'),
    ...timestamps,
  },
  (table) => [uniqueIndex('ai_route_version_unique').on(table.routeId, table.version)],
);

export const aiServiceVersions = pgTable(
  'ai_service_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    serviceId: uuid('service_id')
      .references(() => aiServices.id)
      .notNull(),
    version: integer('version').notNull(),
    state: aiosLifecycleStateEnum('state').default('DRAFT').notNull(),
    pipelineVersionId: uuid('pipeline_version_id')
      .references(() => aiPipelineVersions.id)
      .notNull(),
    routeVersionId: uuid('route_version_id')
      .references(() => aiRouteVersions.id)
      .notNull(),
    promptVersionId: uuid('prompt_version_id')
      .references(() => aiPromptVersions.id)
      .notNull(),
    schemaVersionId: uuid('schema_version_id')
      .references(() => aiOutputSchemaVersions.id)
      .notNull(),
    taxonomyVersionId: uuid('taxonomy_version_id').references(() => aiTaxonomyVersions.id),
    policyProfile: jsonb('policy_profile').$type<Record<string, unknown>>().default({}).notNull(),
    authorId: text('author_id').notNull(),
    approvedBy: text('approved_by'),
    ...timestamps,
  },
  (table) => [uniqueIndex('ai_service_version_unique').on(table.serviceId, table.version)],
);

export const aiCapabilityVersions = pgTable(
  'ai_capability_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    capabilityId: uuid('capability_id')
      .references(() => aiCapabilities.id)
      .notNull(),
    version: integer('version').notNull(),
    state: aiosLifecycleStateEnum('state').default('DRAFT').notNull(),
    serviceVersionId: uuid('service_version_id')
      .references(() => aiServiceVersions.id)
      .notNull(),
    contextPolicyVersionId: uuid('context_policy_version_id')
      .references(() => aiContextPolicyVersions.id)
      .notNull(),
    allowedCallers: text('allowed_callers').array().notNull(),
    allowedPurposes: text('allowed_purposes').array().notNull(),
    allowedClassifications: dataClassificationEnum('allowed_classifications').array().notNull(),
    maximumContextTokens: integer('maximum_context_tokens').notNull(),
    confidenceThreshold: numeric('confidence_threshold', { precision: 5, scale: 4 }).notNull(),
    critical: boolean('critical').default(false).notNull(),
    productionApproved: boolean('production_approved').default(false).notNull(),
    emergencyDisabled: boolean('emergency_disabled').default(false).notNull(),
    authorId: text('author_id').notNull(),
    approvedBy: text('approved_by'),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('ai_capability_version_unique').on(table.capabilityId, table.version),
    index('ai_capability_active').on(table.capabilityId, table.state),
  ],
);

export const aiCapabilityDependencies = pgTable(
  'ai_capability_dependencies',
  {
    capabilityVersionId: uuid('capability_version_id')
      .references(() => aiCapabilityVersions.id)
      .notNull(),
    dependencyCapabilityId: uuid('dependency_capability_id')
      .references(() => aiCapabilities.id)
      .notNull(),
    required: boolean('required').default(true).notNull(),
    minimumVersion: integer('minimum_version'),
    maximumStalenessSeconds: integer('maximum_staleness_seconds'),
    parallelizable: boolean('parallelizable').default(true).notNull(),
    reusePolicy: text('reuse_policy').default('EXACT_PROVENANCE').notNull(),
    failurePolicy: text('failure_policy').default('PROPAGATE').notNull(),
    inputMapping: jsonb('input_mapping').$type<Record<string, unknown>>().default({}).notNull(),
    maximumCostMicros: bigint('maximum_cost_micros', { mode: 'number' }),
  },
  (table) => [primaryKey({ columns: [table.capabilityVersionId, table.dependencyCapabilityId] })],
);

export const aiProcessingRuns = pgTable('ai_processing_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  capabilityVersionId: uuid('capability_version_id')
    .references(() => aiCapabilityVersions.id)
    .notNull(),
  sourceRecordId: text('source_record_id').notNull(),
  sourceRevisionId: text('source_revision_id').notNull(),
  correlationId: text('correlation_id').notNull(),
  causationId: text('causation_id'),
  state: aiosResultStateEnum('state').notNull(),
  attempt: integer('attempt').default(1).notNull(),
  replayOfRunId: uuid('replay_of_run_id'),
  errorCode: text('error_code'),
  safeError: text('safe_error'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const aiContextManifests = pgTable('ai_context_manifests', {
  id: uuid('id').defaultRandom().primaryKey(),
  processingRunId: uuid('processing_run_id')
    .references(() => aiProcessingRuns.id)
    .notNull(),
  policyVersionId: uuid('policy_version_id')
    .references(() => aiContextPolicyVersions.id)
    .notNull(),
  version: integer('version').default(1).notNull(),
  items: jsonb('items').$type<unknown[]>().notNull(),
  excluded: jsonb('excluded').$type<unknown[]>().default([]).notNull(),
  totalTokenEstimate: integer('total_token_estimate').notNull(),
  checksum: text('checksum').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const aiArtifacts = pgTable('ai_artifacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  processingRunId: uuid('processing_run_id')
    .references(() => aiProcessingRuns.id)
    .notNull(),
  capabilityVersionId: uuid('capability_version_id')
    .references(() => aiCapabilityVersions.id)
    .notNull(),
  serviceVersionId: uuid('service_version_id')
    .references(() => aiServiceVersions.id)
    .notNull(),
  contextManifestId: uuid('context_manifest_id')
    .references(() => aiContextManifests.id)
    .notNull(),
  pipelineVersionId: uuid('pipeline_version_id')
    .references(() => aiPipelineVersions.id)
    .notNull(),
  routeVersionId: uuid('route_version_id')
    .references(() => aiRouteVersions.id)
    .notNull(),
  promptVersionId: uuid('prompt_version_id')
    .references(() => aiPromptVersions.id)
    .notNull(),
  schemaVersionId: uuid('schema_version_id')
    .references(() => aiOutputSchemaVersions.id)
    .notNull(),
  taxonomyVersionId: uuid('taxonomy_version_id').references(() => aiTaxonomyVersions.id),
  providerKey: text('provider_key').notNull(),
  providerRequestId: text('provider_request_id'),
  modelId: uuid('model_id')
    .references(() => aiModels.id)
    .notNull(),
  providerModelVersion: text('provider_model_version'),
  resultState: aiosResultStateEnum('result_state').notNull(),
  result: jsonb('result').$type<Record<string, unknown>>().notNull(),
  confidence: numeric('confidence', { precision: 5, scale: 4 }),
  qualityFlags: text('quality_flags').array().default([]).notNull(),
  fallbackUsed: boolean('fallback_used').default(false).notNull(),
  intelligenceState: aiIntelligenceStateEnum('intelligence_state').notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const aiEvidenceReferences = pgTable('ai_evidence_references', {
  id: uuid('id').defaultRandom().primaryKey(),
  artifactId: uuid('artifact_id')
    .references(() => aiArtifacts.id)
    .notNull(),
  evidenceId: text('evidence_id').notNull(),
  sourceType: text('source_type').notNull(),
  sourceId: text('source_id').notNull(),
  sourceVersion: text('source_version').notNull(),
  checksum: text('checksum').notNull(),
  classification: dataClassificationEnum('classification').notNull(),
});

export const aiMemoryReferences = pgTable('ai_memory_references', {
  id: uuid('id').defaultRandom().primaryKey(),
  memoryClass: text('memory_class').notNull(),
  sourceType: text('source_type').notNull(),
  sourceId: text('source_id').notNull(),
  sourceVersion: text('source_version').notNull(),
  classification: dataClassificationEnum('classification').notNull(),
  status: text('status').notNull(),
  approvedBy: text('approved_by'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  ...timestamps,
});

export const aiEvaluationSuites = pgTable('ai_evaluation_suites', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  version: integer('version').notNull(),
  state: aiosLifecycleStateEnum('state').default('DRAFT').notNull(),
  definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
  checksum: text('checksum').notNull(),
  requiredForProduction: boolean('required_for_production').default(false).notNull(),
  createdBy: text('created_by').notNull(),
  approvedBy: text('approved_by'),
  ...timestamps,
});

export const aiEvaluationRuns = pgTable('ai_evaluation_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  suiteId: uuid('suite_id')
    .references(() => aiEvaluationSuites.id)
    .notNull(),
  status: text('status').notNull(),
  requestedBy: text('requested_by').notNull(),
  providerComparison: boolean('provider_comparison').default(false).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const aiEvaluationResults = pgTable('ai_evaluation_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id')
    .references(() => aiEvaluationRuns.id)
    .notNull(),
  caseKey: text('case_key').notNull(),
  passed: boolean('passed').notNull(),
  scores: jsonb('scores').$type<Record<string, number>>().default({}).notNull(),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().default({}).notNull(),
});

export const aiUsageRecords = pgTable('ai_usage_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  processingRunId: uuid('processing_run_id')
    .references(() => aiProcessingRuns.id)
    .notNull(),
  artifactId: uuid('artifact_id').references(() => aiArtifacts.id),
  providerConnectionId: uuid('provider_connection_id')
    .references(() => aiProviderConnections.id)
    .notNull(),
  modelId: uuid('model_id')
    .references(() => aiModels.id)
    .notNull(),
  capabilityKey: text('capability_key').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  cachedInputTokens: integer('cached_input_tokens'),
  latencyMs: integer('latency_ms').notNull(),
  costMicros: bigint('cost_micros', { mode: 'number' }),
  currency: text('currency'),
  synthetic: boolean('synthetic').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const aiBudgetPolicies = pgTable(
  'ai_budget_policies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    key: text('key').notNull(),
    environment: environmentEnum('environment').notNull(),
    scopeType: text('scope_type').notNull(),
    scopeId: text('scope_id'),
    dailyLimitMicros: bigint('daily_limit_micros', { mode: 'number' }),
    monthlyLimitMicros: bigint('monthly_limit_micros', { mode: 'number' }),
    perRequestLimitMicros: bigint('per_request_limit_micros', { mode: 'number' }),
    currency: text('currency').notNull(),
    active: boolean('active').default(false).notNull(),
    approvedBy: text('approved_by'),
    ...timestamps,
  },
  (table) => [
    // `scope_id` is null for an environment-wide budget, and PostgreSQL treats nulls as
    // distinct — so a plain unique index over these four columns never fires for the
    // very case it most needs to, and the same environment budget could be created
    // repeatedly. Coalescing gives every scope a comparable value.
    uniqueIndex('ai_budget_policy_scope').on(
      table.key,
      table.environment,
      table.scopeType,
      sql`coalesce(${table.scopeId}, '')`,
    ),
  ],
);

export const aiReadinessEvaluations = pgTable('ai_readiness_evaluations', {
  id: uuid('id').defaultRandom().primaryKey(),
  environment: environmentEnum('environment').notNull(),
  status: aiosReadinessStateEnum('status').notNull(),
  checks: jsonb('checks').$type<unknown[]>().notNull(),
  blockers: text('blockers').array().notNull(),
  evidenceIds: text('evidence_ids').array().notNull(),
  evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const aiEventSubscriptions = pgTable(
  'ai_event_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    consumerKey: text('consumer_key').notNull(),
    eventType: text('event_type').notNull(),
    active: boolean('active').default(true).notNull(),
    classificationCeiling: dataClassificationEnum('classification_ceiling').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('ai_event_subscription_unique').on(table.consumerKey, table.eventType)],
);

export const aiEventDeliveries = pgTable(
  'ai_event_deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    subscriptionId: uuid('subscription_id')
      .references(() => aiEventSubscriptions.id)
      .notNull(),
    sourceEventId: uuid('source_event_id').notNull(),
    status: text('status').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('ai_event_delivery_idempotency').on(table.subscriptionId, table.sourceEventId),
  ],
);

export const readinessEvaluations = pgTable('readiness_evaluations', {
  id: uuid('id').defaultRandom().primaryKey(),
  environment: environmentEnum('environment').notNull(),
  status: readinessStateEnum('status').notNull(),
  checks: jsonb('checks').$type<unknown[]>().notNull(),
  blockers: text('blockers').array().notNull(),
  evidenceIds: text('evidence_ids').array().notNull(),
  evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    eventType: text('event_type').notNull(),
    event: jsonb('event').$type<Record<string, unknown>>().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    attempts: integer('attempts').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('outbox_unpublished_idx').on(table.publishedAt, table.createdAt)],
);

export const inboxEvents = pgTable(
  'inbox_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    source: text('source').notNull(),
    sourceEventId: text('source_event_id').notNull(),
    payloadChecksum: text('payload_checksum').notNull(),
    status: text('status').notNull(),
    workflowId: text('workflow_id'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: jsonb('error').$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [uniqueIndex('inbox_source_unique').on(table.source, table.sourceEventId)],
);
