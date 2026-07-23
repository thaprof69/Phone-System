CREATE TYPE "public"."agent_release_state" AS ENUM('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED_FOR_TEST', 'TESTING', 'TEST_FAILED', 'TEST_PASSED', 'APPROVED_FOR_PUBLISH', 'PUBLISHING', 'PUBLISHED', 'ACTIVE', 'SUPERSEDED', 'ROLLBACK_PENDING', 'ROLLED_BACK', 'RETIRED', 'EXTERNALLY_BLOCKED');--> statement-breakpoint
CREATE TYPE "public"."provider_capability_state" AS ENUM('SUPPORTED', 'UNSUPPORTED', 'ACCOUNT_RESTRICTED', 'NOT_CONFIGURED', 'TEMPORARILY_UNAVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."data_classification" AS ENUM('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED');--> statement-breakpoint
CREATE TYPE "public"."environment" AS ENUM('development', 'staging', 'production');--> statement-breakpoint
CREATE TYPE "public"."knowledge_state" AS ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISH_PENDING', 'PUBLISHED', 'ACTIVE', 'SUPERSEDED', 'WITHDRAWN', 'ARCHIVED', 'PUBLISH_FAILED', 'DRIFTED');--> statement-breakpoint
CREATE TYPE "public"."call_outcome" AS ENUM('RESOLVED_BY_AGENT', 'OFFICIAL_LINK_SENT', 'TRANSFER_COMPLETED', 'TRANSFER_FAILED_CALLBACK_CREATED', 'CALLBACK_REQUESTED', 'STAFF_TASK_CREATED', 'UNRESOLVED_KNOWLEDGE_GAP', 'CUSTOMER_DISCONNECTED', 'TECHNICAL_FAILURE', 'SENSITIVE_ESCALATION', 'PAYMENT_DATA_INTERRUPTED', 'NO_ACTION_REQUIRED');--> statement-breakpoint
CREATE TYPE "public"."conversation_processing_state" AS ENUM('RECEIVED', 'RAW_STORED', 'NORMALIZING', 'REDACTED', 'SUMMARIZING', 'CLASSIFYING', 'LINKING', 'FOLLOW_UP', 'AGGREGATED', 'COMPLETED', 'PARTIAL', 'FAILED_RETRYABLE', 'FAILED_FINAL');--> statement-breakpoint
CREATE TYPE "public"."readiness_state" AS ENUM('ENGINEERING_COMPLETE', 'STAGING_VALIDATED', 'PRODUCTION_DEPLOYMENT_READY', 'EXTERNALLY_BLOCKED', 'PRODUCTION_APPROVED', 'PRODUCTION_ACTIVE');--> statement-breakpoint
CREATE TYPE "public"."sync_state" AS ENUM('LOCAL_DRAFT', 'LOCAL_APPROVED', 'PUBLISH_PENDING', 'IN_SYNC', 'DRIFTED', 'REMOTE_MISSING', 'LOCAL_SUPERSEDED', 'PUBLISH_FAILED', 'ROLLBACK_PENDING', 'EXTERNALLY_BLOCKED');--> statement-breakpoint
CREATE TYPE "public"."verification_state" AS ENUM('NOT_REQUIRED', 'PENDING', 'VERIFIED_LIGHT', 'VERIFIED_STRONG', 'FAILED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."work_state" AS ENUM('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oidc_subject" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sensitive_clearance" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_oidc_subject_unique" UNIQUE("oidc_subject")
);
--> statement-breakpoint
CREATE TABLE "agent_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_config_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"state" "agent_release_state" DEFAULT 'DRAFT' NOT NULL,
	"configuration" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"change_reason" text NOT NULL,
	"author_id" uuid NOT NULL,
	"synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"environment" "environment" NOT NULL,
	"provider_agent_id" text,
	"provider_branch_id" text,
	"provider_version_id" text,
	"local_checksum" text NOT NULL,
	"remote_checksum" text,
	"sync_state" "sync_state" DEFAULT 'PUBLISH_PENDING' NOT NULL,
	"published_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_drift_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid NOT NULL,
	"severity" text NOT NULL,
	"path" text NOT NULL,
	"local_value_hash" text,
	"remote_value_hash" text,
	"resolved_at" timestamp with time zone,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_test_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"test_type" text NOT NULL,
	"risk_level" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aggregate_facts" (
	"date" timestamp with time zone NOT NULL,
	"dimension_key" text NOT NULL,
	"dimension_value" text NOT NULL,
	"metric" text NOT NULL,
	"count" bigint DEFAULT 0 NOT NULL,
	"sum" numeric(20, 4) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aggregate_facts_date_dimension_key_dimension_value_metric_pk" PRIMARY KEY("date","dimension_key","dimension_value","metric")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"sequence" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"purpose" text NOT NULL,
	"classification" "data_classification" NOT NULL,
	"payload" jsonb NOT NULL,
	"previous_hash" text,
	"event_hash" text NOT NULL,
	CONSTRAINT "audit_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "booking_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"external_id" text,
	"verification_state" "verification_state" NOT NULL,
	"purpose" text NOT NULL,
	"fields" jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"transcript_revision_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"primary_intent" text NOT NULL,
	"secondary_intents" text[] NOT NULL,
	"taxonomy_version" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"evidence_ids" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classification_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"value" text NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"evidence_ids" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"outcome" "call_outcome" NOT NULL,
	"evidence_ids" text[] NOT NULL,
	"policy_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"transcript_revision_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"summary" jsonb NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"model_version" text,
	"prompt_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"evidence_coverage" numeric(5, 4) NOT NULL,
	"corrected_by" uuid,
	"correction_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "callback_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"customer_link_id" uuid,
	"idempotency_key" text NOT NULL,
	"owner_id" uuid,
	"priority" text NOT NULL,
	"reason" text NOT NULL,
	"status" "work_state" DEFAULT 'OPEN' NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_processing_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"workflow_id" text NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"state" "conversation_processing_state" NOT NULL,
	"error" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_conversation_id" uuid NOT NULL,
	"agent_version_id" uuid,
	"processing_state" "conversation_processing_state" DEFAULT 'RECEIVED' NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"language" text,
	"park" text,
	"sensitive" boolean DEFAULT false NOT NULL,
	"synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"external_customer_id" text NOT NULL,
	"method" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"corrected_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"external_id" text,
	"verification_state" "verification_state" NOT NULL,
	"purpose" text NOT NULL,
	"fields" jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deletion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text NOT NULL,
	"status" text NOT NULL,
	"workflow_id" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requested_by" uuid NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digital_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid,
	"purpose" text NOT NULL,
	"destination_key" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"clicked_at" timestamp with time zone,
	"conversion_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"environment" "environment" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"route_key" text NOT NULL,
	"status" text NOT NULL,
	"approved_context" jsonb NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"provider_evidence_id" text
);
--> statement-breakpoint
CREATE TABLE "inbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_event_id" text NOT NULL,
	"payload_checksum" text NOT NULL,
	"status" text NOT NULL,
	"workflow_id" text,
	"processed_at" timestamp with time zone,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_version_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"source_type" text NOT NULL,
	"category" text NOT NULL,
	"park" text,
	"language" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"risk_class" text NOT NULL,
	"synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_version_id" uuid NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"language" text NOT NULL,
	"park" text,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"left_version_id" uuid NOT NULL,
	"right_version_id" uuid NOT NULL,
	"conflict_type" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_gaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"language" text NOT NULL,
	"park" text,
	"frequency" integer DEFAULT 1 NOT NULL,
	"evidence_ids" text[] NOT NULL,
	"status" "work_state" DEFAULT 'OPEN' NOT NULL,
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_source_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_version_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum" text NOT NULL,
	"malware_status" text NOT NULL,
	"sanitization_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_version_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider_document_id" text,
	"sync_state" "sync_state" DEFAULT 'PUBLISH_PENDING' NOT NULL,
	"local_checksum" text NOT NULL,
	"remote_checksum" text,
	"last_attempt_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"state" "knowledge_state" DEFAULT 'DRAFT' NOT NULL,
	"content" text NOT NULL,
	"content_checksum" text NOT NULL,
	"extracted_checksum" text,
	"effective_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"change_reason" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text NOT NULL,
	"reason" text NOT NULL,
	"placed_by" uuid NOT NULL,
	"released_by" uuid,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"digital_link_id" uuid,
	"channel" text NOT NULL,
	"template_key" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_message_id" text,
	"status" text NOT NULL,
	"cost" numeric(18, 6),
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"event_type" text NOT NULL,
	"event" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "provider_capability_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"state" "provider_capability_state" NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider_conversation_id" text NOT NULL,
	"provider_agent_id" text NOT NULL,
	"provider_branch_id" text,
	"provider_version_id" text,
	"provider_transcript" jsonb NOT NULL,
	"provider_analysis" jsonb,
	"provider_metadata" jsonb NOT NULL,
	"has_audio" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_credential_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"secret_reference" text NOT NULL,
	"scopes" text[] NOT NULL,
	"rotated_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_request_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"correlation_id" text NOT NULL,
	"provider_request_id" text,
	"operation" text NOT NULL,
	"result_status" text NOT NULL,
	"latency_ms" integer NOT NULL,
	"safe_error" jsonb,
	"cost" numeric(18, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_test_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_version_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider_test_id" text,
	"sync_state" "sync_state" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'ELEVENLABS' NOT NULL,
	"environment" "environment" NOT NULL,
	"provider_workspace_id" text NOT NULL,
	"region" text NOT NULL,
	"display_name" text NOT NULL,
	"verified_at" timestamp with time zone,
	"synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quality_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"rubric_version" text NOT NULL,
	"scores" jsonb NOT NULL,
	"reviewer_id" uuid,
	"evidence_ids" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider_event_id" text,
	"provider_conversation_id" text NOT NULL,
	"event_type" text NOT NULL,
	"event_timestamp" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_object_key" text NOT NULL,
	"raw_checksum" text NOT NULL,
	"signature_metadata" jsonb NOT NULL,
	"classification" "data_classification" DEFAULT 'RESTRICTED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "readiness_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment" "environment" NOT NULL,
	"status" "readiness_state" NOT NULL,
	"checks" jsonb NOT NULL,
	"blockers" text[] NOT NULL,
	"evidence_ids" text[] NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turn_id" uuid NOT NULL,
	"redaction_type" text NOT NULL,
	"detector_version" text NOT NULL,
	"start_offset" integer,
	"end_offset" integer,
	"restricted_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_gate_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"allowed" boolean NOT NULL,
	"blockers" text[] NOT NULL,
	"evidence_ids" text[] NOT NULL,
	"evaluator_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"schedule" text NOT NULL,
	"classification" "data_classification" NOT NULL,
	"configuration" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_definitions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "report_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition_id" uuid NOT NULL,
	"status" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"lineage" jsonb NOT NULL,
	"artifact_object_key" text,
	"checksum" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment" "environment" NOT NULL,
	"data_type" text NOT NULL,
	"classification" "data_classification" NOT NULL,
	"retention_days" integer NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "staff_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"customer_link_id" uuid,
	"idempotency_key" text NOT NULL,
	"owner_id" uuid,
	"priority" text NOT NULL,
	"reason" text NOT NULL,
	"status" "work_state" DEFAULT 'OPEN' NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"external_id" text,
	"verification_state" "verification_state" NOT NULL,
	"purpose" text NOT NULL,
	"fields" jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"environment" "environment" NOT NULL,
	"value" jsonb NOT NULL,
	"classification" "data_classification" NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_run_id" uuid NOT NULL,
	"test_version_id" uuid NOT NULL,
	"provider_evidence_object_key" text,
	"internal_evaluation" jsonb NOT NULL,
	"passed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"provider_run_id" text,
	"status" text NOT NULL,
	"repeat_count" integer DEFAULT 1 NOT NULL,
	"pass_count" integer DEFAULT 0 NOT NULL,
	"fail_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tool_invocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"registry_key" text NOT NULL,
	"registry_version" integer NOT NULL,
	"provider_request_id" text,
	"request" jsonb NOT NULL,
	"result_status" text NOT NULL,
	"result" jsonb NOT NULL,
	"verification_state" "verification_state" NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "transcript_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"revision_type" text NOT NULL,
	"source_revision_id" uuid,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"speaker" text NOT NULL,
	"content" text NOT NULL,
	"started_at_ms" integer,
	"ended_at_ms" integer,
	"provider_turn_id" text,
	"classification" "data_classification" DEFAULT 'CONFIDENTIAL' NOT NULL,
	"quality" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trend_type" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"dimensions" jsonb NOT NULL,
	"metric" numeric(20, 4) NOT NULL,
	"confidence" numeric(5, 4),
	"evidence" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "verification_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"level" text NOT NULL,
	"state" "verification_state" DEFAULT 'PENDING' NOT NULL,
	"factors" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"purpose" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"voice_profile_id" uuid NOT NULL,
	"language" text NOT NULL,
	"environment" "environment" NOT NULL,
	"fallback" boolean DEFAULT false NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voice_profile_id" uuid NOT NULL,
	"speaker_identity_reference" text NOT NULL,
	"consent_object_key" text NOT NULL,
	"permitted_use" text NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voice_profile_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"checksum" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_voice_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"custom" boolean DEFAULT false NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_agent_version_id_agent_config_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_config_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_config_versions" ADD CONSTRAINT "agent_config_versions_agent_id_voice_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."voice_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_deployments" ADD CONSTRAINT "agent_deployments_agent_version_id_agent_config_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_config_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_deployments" ADD CONSTRAINT "agent_deployments_workspace_id_provider_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."provider_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_drift_findings" ADD CONSTRAINT "agent_drift_findings_deployment_id_agent_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."agent_deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_test_versions" ADD CONSTRAINT "agent_test_versions_test_id_agent_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."agent_tests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_snapshots" ADD CONSTRAINT "booking_snapshots_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_classifications" ADD CONSTRAINT "call_classifications_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_classifications" ADD CONSTRAINT "call_classifications_transcript_revision_id_transcript_revisions_id_fk" FOREIGN KEY ("transcript_revision_id") REFERENCES "public"."transcript_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_entities" ADD CONSTRAINT "call_entities_classification_id_call_classifications_id_fk" FOREIGN KEY ("classification_id") REFERENCES "public"."call_classifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_outcomes" ADD CONSTRAINT "call_outcomes_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_summaries" ADD CONSTRAINT "call_summaries_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_summaries" ADD CONSTRAINT "call_summaries_transcript_revision_id_transcript_revisions_id_fk" FOREIGN KEY ("transcript_revision_id") REFERENCES "public"."transcript_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callback_requests" ADD CONSTRAINT "callback_requests_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callback_requests" ADD CONSTRAINT "callback_requests_customer_link_id_customer_links_id_fk" FOREIGN KEY ("customer_link_id") REFERENCES "public"."customer_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_processing_runs" ADD CONSTRAINT "conversation_processing_runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_provider_conversation_id_provider_conversations_id_fk" FOREIGN KEY ("provider_conversation_id") REFERENCES "public"."provider_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agent_version_id_agent_config_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_config_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_links" ADD CONSTRAINT "customer_links_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_snapshots" ADD CONSTRAINT "customer_snapshots_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_links" ADD CONSTRAINT "digital_links_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_approvals" ADD CONSTRAINT "knowledge_approvals_knowledge_version_id_knowledge_versions_id_fk" FOREIGN KEY ("knowledge_version_id") REFERENCES "public"."knowledge_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_assignments" ADD CONSTRAINT "knowledge_assignments_knowledge_version_id_knowledge_versions_id_fk" FOREIGN KEY ("knowledge_version_id") REFERENCES "public"."knowledge_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_assignments" ADD CONSTRAINT "knowledge_assignments_agent_version_id_agent_config_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_config_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_conflicts" ADD CONSTRAINT "knowledge_conflicts_left_version_id_knowledge_versions_id_fk" FOREIGN KEY ("left_version_id") REFERENCES "public"."knowledge_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_conflicts" ADD CONSTRAINT "knowledge_conflicts_right_version_id_knowledge_versions_id_fk" FOREIGN KEY ("right_version_id") REFERENCES "public"."knowledge_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_files" ADD CONSTRAINT "knowledge_source_files_knowledge_version_id_knowledge_versions_id_fk" FOREIGN KEY ("knowledge_version_id") REFERENCES "public"."knowledge_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_syncs" ADD CONSTRAINT "knowledge_syncs_knowledge_version_id_knowledge_versions_id_fk" FOREIGN KEY ("knowledge_version_id") REFERENCES "public"."knowledge_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_syncs" ADD CONSTRAINT "knowledge_syncs_workspace_id_provider_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."provider_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_asset_id_knowledge_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."knowledge_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_digital_link_id_digital_links_id_fk" FOREIGN KEY ("digital_link_id") REFERENCES "public"."digital_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_capability_snapshots" ADD CONSTRAINT "provider_capability_snapshots_workspace_id_provider_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."provider_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_conversations" ADD CONSTRAINT "provider_conversations_workspace_id_provider_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."provider_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_credential_references" ADD CONSTRAINT "provider_credential_references_workspace_id_provider_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."provider_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_request_logs" ADD CONSTRAINT "provider_request_logs_workspace_id_provider_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."provider_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_test_mappings" ADD CONSTRAINT "provider_test_mappings_test_version_id_agent_test_versions_id_fk" FOREIGN KEY ("test_version_id") REFERENCES "public"."agent_test_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_test_mappings" ADD CONSTRAINT "provider_test_mappings_workspace_id_provider_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."provider_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_evaluations" ADD CONSTRAINT "quality_evaluations_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_webhook_events" ADD CONSTRAINT "raw_webhook_events_workspace_id_provider_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."provider_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redactions" ADD CONSTRAINT "redactions_turn_id_transcript_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."transcript_turns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_gate_evaluations" ADD CONSTRAINT "release_gate_evaluations_agent_version_id_agent_config_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_config_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_definition_id_report_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."report_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_tasks" ADD CONSTRAINT "staff_tasks_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_tasks" ADD CONSTRAINT "staff_tasks_customer_link_id_customer_links_id_fk" FOREIGN KEY ("customer_link_id") REFERENCES "public"."customer_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_snapshots" ADD CONSTRAINT "support_snapshots_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_evidence" ADD CONSTRAINT "test_evidence_test_run_id_test_runs_id_fk" FOREIGN KEY ("test_run_id") REFERENCES "public"."test_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_evidence" ADD CONSTRAINT "test_evidence_test_version_id_agent_test_versions_id_fk" FOREIGN KEY ("test_version_id") REFERENCES "public"."agent_test_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_agent_version_id_agent_config_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_config_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD CONSTRAINT "tool_invocations_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_revisions" ADD CONSTRAINT "transcript_revisions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_turns" ADD CONSTRAINT "transcript_turns_revision_id_transcript_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."transcript_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_admin_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_sessions" ADD CONSTRAINT "verification_sessions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_assignments" ADD CONSTRAINT "voice_assignments_agent_version_id_agent_config_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_config_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_assignments" ADD CONSTRAINT "voice_assignments_voice_profile_id_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."voice_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_consent_records" ADD CONSTRAINT "voice_consent_records_voice_profile_id_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."voice_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_previews" ADD CONSTRAINT "voice_previews_voice_profile_id_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."voice_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_workspace_id_provider_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."provider_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_approval_reviewer" ON "agent_approvals" USING btree ("agent_version_id","reviewer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_version_unique" ON "agent_config_versions" USING btree ("agent_id","version");--> statement-breakpoint
CREATE INDEX "agent_state_idx" ON "agent_config_versions" USING btree ("agent_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_test_version_unique" ON "agent_test_versions" USING btree ("test_id","version");--> statement-breakpoint
CREATE INDEX "audit_search_idx" ON "audit_events" USING btree ("aggregate_type","aggregate_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "call_summary_revision" ON "call_summaries" USING btree ("conversation_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "callback_requests_idempotency" ON "callback_requests" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_flag_scope" ON "feature_flags" USING btree ("key","environment");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_source_unique" ON "inbox_events" USING btree ("source","source_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_approval_reviewer" ON "knowledge_approvals" USING btree ("knowledge_version_id","reviewer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_assignment_unique" ON "knowledge_assignments" USING btree ("knowledge_version_id","agent_version_id","language");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_version_unique" ON "knowledge_versions" USING btree ("asset_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "message_idempotency" ON "message_deliveries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "outbox_unpublished_idx" ON "outbox_events" USING btree ("published_at","created_at");--> statement-breakpoint
CREATE INDEX "provider_capability_current" ON "provider_capability_snapshots" USING btree ("workspace_id","capability","checked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_conversation_unique" ON "provider_conversations" USING btree ("workspace_id","provider_conversation_id");--> statement-breakpoint
CREATE INDEX "provider_request_correlation" ON "provider_request_logs" USING btree ("correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_workspace_identity" ON "provider_workspaces" USING btree ("environment","provider_workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_webhook_idempotency" ON "raw_webhook_events" USING btree ("workspace_id","provider_conversation_id","event_type","event_timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "retention_policy_unique" ON "retention_policies" USING btree ("environment","data_type");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_tasks_idempotency" ON "staff_tasks" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "system_configuration_scope" ON "system_configurations" USING btree ("key","environment");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_revision_unique" ON "transcript_revisions" USING btree ("conversation_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_turn_sequence" ON "transcript_turns" USING btree ("revision_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_assignment_scope" ON "voice_assignments" USING btree ("agent_version_id","language","environment","fallback");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_provider_unique" ON "voice_profiles" USING btree ("workspace_id","provider_voice_id");