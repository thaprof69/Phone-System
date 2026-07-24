CREATE TYPE "public"."aios_lifecycle_state" AS ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'ACTIVE', 'SUPERSEDED', 'ROLLED_BACK', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."aios_provider_status" AS ENUM('NOT_CONFIGURED', 'VALIDATING', 'CONNECTED', 'DEGRADED', 'INVALID_CREDENTIALS', 'DISABLED', 'DISCONNECTED', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."aios_readiness_state" AS ENUM('NOT_CONFIGURED', 'SANDBOX_CONFIGURED', 'CONFIGURED_WITH_BLOCKERS', 'STAGING_VALIDATED', 'PRODUCTION_DEPLOYMENT_READY', 'EXTERNALLY_BLOCKED', 'PRODUCTION_APPROVED');--> statement-breakpoint
CREATE TYPE "public"."aios_result_state" AS ENUM('SUCCESS', 'PARTIAL', 'VALIDATION_FAILED', 'SCHEMA_REJECTED', 'EVIDENCE_INSUFFICIENT', 'POLICY_REJECTED', 'MODEL_NOT_CONFIGURED', 'PROVIDER_NOT_CONFIGURED', 'MODEL_NOT_AVAILABLE', 'RATE_LIMITED', 'TIMEOUT', 'UNAVAILABLE', 'COST_LIMIT_REACHED', 'FALLBACK_USED', 'UNKNOWN_FAILURE');--> statement-breakpoint
CREATE TABLE "ai_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"processing_run_id" uuid NOT NULL,
	"capability_version_id" uuid NOT NULL,
	"service_version_id" uuid NOT NULL,
	"context_manifest_id" uuid NOT NULL,
	"pipeline_version_id" uuid NOT NULL,
	"route_version_id" uuid NOT NULL,
	"prompt_version_id" uuid NOT NULL,
	"schema_version_id" uuid NOT NULL,
	"taxonomy_version_id" uuid,
	"provider_key" text NOT NULL,
	"provider_request_id" text,
	"model_id" uuid NOT NULL,
	"provider_model_version" text,
	"result_state" "aios_result_state" NOT NULL,
	"result" jsonb NOT NULL,
	"confidence" numeric(5, 4),
	"quality_flags" text[] DEFAULT '{}' NOT NULL,
	"fallback_used" boolean DEFAULT false NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_budget_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"environment" "environment" NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text,
	"daily_limit_micros" bigint,
	"monthly_limit_micros" bigint,
	"per_request_limit_micros" bigint,
	"currency" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"display_name" text NOT NULL,
	"owning_product" text NOT NULL,
	"bounded_context" text NOT NULL,
	"purpose" text NOT NULL,
	"input_contract_key" text NOT NULL,
	"output_contract_key" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_capabilities_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "ai_capability_dependencies" (
	"capability_version_id" uuid NOT NULL,
	"dependency_capability_id" uuid NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"minimum_version" integer,
	"maximum_staleness_seconds" integer,
	"parallelizable" boolean DEFAULT true NOT NULL,
	"reuse_policy" text DEFAULT 'EXACT_PROVENANCE' NOT NULL,
	"failure_policy" text DEFAULT 'PROPAGATE' NOT NULL,
	"input_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"maximum_cost_micros" bigint,
	CONSTRAINT "ai_capability_dependencies_capability_version_id_dependency_capability_id_pk" PRIMARY KEY("capability_version_id","dependency_capability_id")
);
--> statement-breakpoint
CREATE TABLE "ai_capability_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capability_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"state" "aios_lifecycle_state" DEFAULT 'DRAFT' NOT NULL,
	"service_version_id" uuid NOT NULL,
	"context_policy_version_id" uuid NOT NULL,
	"allowed_callers" text[] NOT NULL,
	"allowed_purposes" text[] NOT NULL,
	"allowed_classifications" "data_classification"[] NOT NULL,
	"maximum_context_tokens" integer NOT NULL,
	"confidence_threshold" numeric(5, 4) NOT NULL,
	"critical" boolean DEFAULT false NOT NULL,
	"production_approved" boolean DEFAULT false NOT NULL,
	"emergency_disabled" boolean DEFAULT false NOT NULL,
	"author_id" text NOT NULL,
	"approved_by" text,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_context_manifests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"processing_run_id" uuid NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"items" jsonb NOT NULL,
	"excluded" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_token_estimate" integer NOT NULL,
	"checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_context_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_context_policies_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "ai_context_policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"state" "aios_lifecycle_state" DEFAULT 'DRAFT' NOT NULL,
	"source_rules" jsonb NOT NULL,
	"maximum_tokens" integer NOT NULL,
	"allowed_classifications" "data_classification"[] NOT NULL,
	"checksum" text NOT NULL,
	"author_id" text NOT NULL,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_evaluation_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"case_key" text NOT NULL,
	"passed" boolean NOT NULL,
	"scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_evaluation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suite_id" uuid NOT NULL,
	"status" text NOT NULL,
	"requested_by" text NOT NULL,
	"provider_comparison" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_evaluation_suites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"version" integer NOT NULL,
	"state" "aios_lifecycle_state" DEFAULT 'DRAFT' NOT NULL,
	"definition" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"required_for_production" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_evaluation_suites_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "ai_event_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"source_event_id" uuid NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"delivered_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_event_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consumer_key" text NOT NULL,
	"event_type" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"classification_ceiling" "data_classification" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_evidence_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"evidence_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_version" text NOT NULL,
	"checksum" text NOT NULL,
	"classification" "data_classification" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_memory_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_class" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_version" text NOT NULL,
	"classification" "data_classification" NOT NULL,
	"status" text NOT NULL,
	"approved_by" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_model_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"environment" "environment" NOT NULL,
	"approved" boolean NOT NULL,
	"approved_by" text NOT NULL,
	"reason" text NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_model_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"input_micros_per_million" bigint,
	"output_micros_per_million" bigint,
	"source_url" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"approved_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"provider_model_id" text NOT NULL,
	"display_name" text NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"structured_output" text DEFAULT 'UNVERIFIED' NOT NULL,
	"json_schema_support" text DEFAULT 'UNVERIFIED' NOT NULL,
	"embedding_support" text DEFAULT 'UNVERIFIED' NOT NULL,
	"context_limit" integer,
	"output_limit" integer,
	"region_restrictions" text[] DEFAULT '{}' NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"deprecated" boolean DEFAULT false NOT NULL,
	"retired_at" timestamp with time zone,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_output_schema_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schema_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"state" "aios_lifecycle_state" DEFAULT 'DRAFT' NOT NULL,
	"json_schema" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"code_owned" boolean DEFAULT true NOT NULL,
	"registered_by_build" text NOT NULL,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_output_schemas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"purpose" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_output_schemas_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "ai_pipeline_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"state" "aios_lifecycle_state" DEFAULT 'DRAFT' NOT NULL,
	"stages" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"author_id" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_pipelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"display_name" text NOT NULL,
	"purpose" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_pipelines_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "ai_processing_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capability_version_id" uuid NOT NULL,
	"source_record_id" text NOT NULL,
	"source_revision_id" text NOT NULL,
	"correlation_id" text NOT NULL,
	"causation_id" text,
	"state" "aios_result_state" NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"replay_of_run_id" uuid,
	"error_code" text,
	"safe_error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"state" "aios_lifecycle_state" DEFAULT 'DRAFT' NOT NULL,
	"content" text NOT NULL,
	"checksum" text NOT NULL,
	"author_id" text NOT NULL,
	"approved_by" text,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"purpose" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_prompts_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "ai_provider_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_key" text NOT NULL,
	"connection_label" text NOT NULL,
	"environment" "environment" NOT NULL,
	"credential_reference_id" uuid,
	"status" "aios_provider_status" DEFAULT 'NOT_CONFIGURED' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"region" text,
	"approved_data_region" text,
	"organization_reference" text,
	"safe_configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"capability_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model_count" integer DEFAULT 0 NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_successful_request_at" timestamp with time zone,
	"last_error_code" text,
	"synthetic" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_provider_credential_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_key" text NOT NULL,
	"secret_reference" text NOT NULL,
	"key_version" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"rotated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_provider_credential_references_secret_reference_unique" UNIQUE("secret_reference")
);
--> statement-breakpoint
CREATE TABLE "ai_provider_health_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"status" "aios_provider_status" NOT NULL,
	"normalized_error_code" text,
	"latency_ms" integer,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_readiness_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment" "environment" NOT NULL,
	"status" "aios_readiness_state" NOT NULL,
	"checks" jsonb NOT NULL,
	"blockers" text[] NOT NULL,
	"evidence_ids" text[] NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_route_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"state" "aios_lifecycle_state" DEFAULT 'DRAFT' NOT NULL,
	"environment" "environment" NOT NULL,
	"provider_connection_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"fallback_provider_connection_id" uuid,
	"fallback_model_id" uuid,
	"timeout_ms" integer NOT NULL,
	"maximum_retries" integer DEFAULT 0 NOT NULL,
	"confidence_threshold" numeric(5, 4) NOT NULL,
	"maximum_cost_micros" bigint,
	"layers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"author_id" text NOT NULL,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"purpose" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_routes_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "ai_service_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"state" "aios_lifecycle_state" DEFAULT 'DRAFT' NOT NULL,
	"pipeline_version_id" uuid NOT NULL,
	"route_version_id" uuid NOT NULL,
	"prompt_version_id" uuid NOT NULL,
	"schema_version_id" uuid NOT NULL,
	"taxonomy_version_id" uuid,
	"policy_profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"author_id" text NOT NULL,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"display_name" text NOT NULL,
	"purpose" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_services_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "ai_taxonomies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"purpose" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_taxonomies_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "ai_taxonomy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"taxonomy_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"state" "aios_lifecycle_state" DEFAULT 'DRAFT' NOT NULL,
	"values" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"author_id" text NOT NULL,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"processing_run_id" uuid NOT NULL,
	"artifact_id" uuid,
	"provider_connection_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"capability_key" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cached_input_tokens" integer,
	"latency_ms" integer NOT NULL,
	"cost_micros" bigint,
	"currency" text,
	"synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_classifications" ADD COLUMN "ai_artifact_id" uuid;--> statement-breakpoint
ALTER TABLE "call_summaries" ADD COLUMN "ai_artifact_id" uuid;--> statement-breakpoint
ALTER TABLE "call_classifications" ADD CONSTRAINT "call_classifications_ai_artifact_id_ai_artifacts_id_fk" FOREIGN KEY ("ai_artifact_id") REFERENCES "public"."ai_artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_summaries" ADD CONSTRAINT "call_summaries_ai_artifact_id_ai_artifacts_id_fk" FOREIGN KEY ("ai_artifact_id") REFERENCES "public"."ai_artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_processing_run_id_ai_processing_runs_id_fk" FOREIGN KEY ("processing_run_id") REFERENCES "public"."ai_processing_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_capability_version_id_ai_capability_versions_id_fk" FOREIGN KEY ("capability_version_id") REFERENCES "public"."ai_capability_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_service_version_id_ai_service_versions_id_fk" FOREIGN KEY ("service_version_id") REFERENCES "public"."ai_service_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_context_manifest_id_ai_context_manifests_id_fk" FOREIGN KEY ("context_manifest_id") REFERENCES "public"."ai_context_manifests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_pipeline_version_id_ai_pipeline_versions_id_fk" FOREIGN KEY ("pipeline_version_id") REFERENCES "public"."ai_pipeline_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_route_version_id_ai_route_versions_id_fk" FOREIGN KEY ("route_version_id") REFERENCES "public"."ai_route_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_prompt_version_id_ai_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."ai_prompt_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_schema_version_id_ai_output_schema_versions_id_fk" FOREIGN KEY ("schema_version_id") REFERENCES "public"."ai_output_schema_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_taxonomy_version_id_ai_taxonomy_versions_id_fk" FOREIGN KEY ("taxonomy_version_id") REFERENCES "public"."ai_taxonomy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_capability_dependencies" ADD CONSTRAINT "ai_capability_dependencies_capability_version_id_ai_capability_versions_id_fk" FOREIGN KEY ("capability_version_id") REFERENCES "public"."ai_capability_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_capability_dependencies" ADD CONSTRAINT "ai_capability_dependencies_dependency_capability_id_ai_capabilities_id_fk" FOREIGN KEY ("dependency_capability_id") REFERENCES "public"."ai_capabilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_capability_versions" ADD CONSTRAINT "ai_capability_versions_capability_id_ai_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."ai_capabilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_capability_versions" ADD CONSTRAINT "ai_capability_versions_service_version_id_ai_service_versions_id_fk" FOREIGN KEY ("service_version_id") REFERENCES "public"."ai_service_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_capability_versions" ADD CONSTRAINT "ai_capability_versions_context_policy_version_id_ai_context_policy_versions_id_fk" FOREIGN KEY ("context_policy_version_id") REFERENCES "public"."ai_context_policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_context_manifests" ADD CONSTRAINT "ai_context_manifests_processing_run_id_ai_processing_runs_id_fk" FOREIGN KEY ("processing_run_id") REFERENCES "public"."ai_processing_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_context_manifests" ADD CONSTRAINT "ai_context_manifests_policy_version_id_ai_context_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."ai_context_policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_context_policy_versions" ADD CONSTRAINT "ai_context_policy_versions_policy_id_ai_context_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."ai_context_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_evaluation_results" ADD CONSTRAINT "ai_evaluation_results_run_id_ai_evaluation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_evaluation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_evaluation_runs" ADD CONSTRAINT "ai_evaluation_runs_suite_id_ai_evaluation_suites_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."ai_evaluation_suites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_event_deliveries" ADD CONSTRAINT "ai_event_deliveries_subscription_id_ai_event_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."ai_event_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_evidence_references" ADD CONSTRAINT "ai_evidence_references_artifact_id_ai_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."ai_artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_approvals" ADD CONSTRAINT "ai_model_approvals_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_prices" ADD CONSTRAINT "ai_model_prices_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_connection_id_ai_provider_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ai_provider_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_output_schema_versions" ADD CONSTRAINT "ai_output_schema_versions_schema_id_ai_output_schemas_id_fk" FOREIGN KEY ("schema_id") REFERENCES "public"."ai_output_schemas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_pipeline_versions" ADD CONSTRAINT "ai_pipeline_versions_pipeline_id_ai_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."ai_pipelines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_processing_runs" ADD CONSTRAINT "ai_processing_runs_capability_version_id_ai_capability_versions_id_fk" FOREIGN KEY ("capability_version_id") REFERENCES "public"."ai_capability_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_versions" ADD CONSTRAINT "ai_prompt_versions_prompt_id_ai_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."ai_prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_connections" ADD CONSTRAINT "ai_provider_connections_credential_reference_id_ai_provider_credential_references_id_fk" FOREIGN KEY ("credential_reference_id") REFERENCES "public"."ai_provider_credential_references"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_health_checks" ADD CONSTRAINT "ai_provider_health_checks_connection_id_ai_provider_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ai_provider_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_route_versions" ADD CONSTRAINT "ai_route_versions_route_id_ai_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."ai_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_route_versions" ADD CONSTRAINT "ai_route_versions_provider_connection_id_ai_provider_connections_id_fk" FOREIGN KEY ("provider_connection_id") REFERENCES "public"."ai_provider_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_route_versions" ADD CONSTRAINT "ai_route_versions_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_route_versions" ADD CONSTRAINT "ai_route_versions_fallback_provider_connection_id_ai_provider_connections_id_fk" FOREIGN KEY ("fallback_provider_connection_id") REFERENCES "public"."ai_provider_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_route_versions" ADD CONSTRAINT "ai_route_versions_fallback_model_id_ai_models_id_fk" FOREIGN KEY ("fallback_model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_service_versions" ADD CONSTRAINT "ai_service_versions_service_id_ai_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."ai_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_service_versions" ADD CONSTRAINT "ai_service_versions_pipeline_version_id_ai_pipeline_versions_id_fk" FOREIGN KEY ("pipeline_version_id") REFERENCES "public"."ai_pipeline_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_service_versions" ADD CONSTRAINT "ai_service_versions_route_version_id_ai_route_versions_id_fk" FOREIGN KEY ("route_version_id") REFERENCES "public"."ai_route_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_service_versions" ADD CONSTRAINT "ai_service_versions_prompt_version_id_ai_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."ai_prompt_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_service_versions" ADD CONSTRAINT "ai_service_versions_schema_version_id_ai_output_schema_versions_id_fk" FOREIGN KEY ("schema_version_id") REFERENCES "public"."ai_output_schema_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_service_versions" ADD CONSTRAINT "ai_service_versions_taxonomy_version_id_ai_taxonomy_versions_id_fk" FOREIGN KEY ("taxonomy_version_id") REFERENCES "public"."ai_taxonomy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_taxonomy_versions" ADD CONSTRAINT "ai_taxonomy_versions_taxonomy_id_ai_taxonomies_id_fk" FOREIGN KEY ("taxonomy_id") REFERENCES "public"."ai_taxonomies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_processing_run_id_ai_processing_runs_id_fk" FOREIGN KEY ("processing_run_id") REFERENCES "public"."ai_processing_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_artifact_id_ai_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."ai_artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_provider_connection_id_ai_provider_connections_id_fk" FOREIGN KEY ("provider_connection_id") REFERENCES "public"."ai_provider_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_budget_policy_scope" ON "ai_budget_policies" USING btree ("key","environment","scope_type","scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_capability_version_unique" ON "ai_capability_versions" USING btree ("capability_id","version");--> statement-breakpoint
CREATE INDEX "ai_capability_active" ON "ai_capability_versions" USING btree ("capability_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_context_policy_version_unique" ON "ai_context_policy_versions" USING btree ("policy_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_event_delivery_idempotency" ON "ai_event_deliveries" USING btree ("subscription_id","source_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_event_subscription_unique" ON "ai_event_subscriptions" USING btree ("consumer_key","event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_model_approval_scope" ON "ai_model_approvals" USING btree ("model_id","environment");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_model_price_effective" ON "ai_model_prices" USING btree ("model_id","effective_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_model_provider_identity" ON "ai_models" USING btree ("connection_id","provider_model_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_output_schema_version_unique" ON "ai_output_schema_versions" USING btree ("schema_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_pipeline_version_unique" ON "ai_pipeline_versions" USING btree ("pipeline_id","version");--> statement-breakpoint
CREATE INDEX "ai_pipeline_active" ON "ai_pipeline_versions" USING btree ("pipeline_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_prompt_version_unique" ON "ai_prompt_versions" USING btree ("prompt_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_provider_connection_scope" ON "ai_provider_connections" USING btree ("provider_key","environment","connection_label");--> statement-breakpoint
CREATE INDEX "ai_provider_connection_status" ON "ai_provider_connections" USING btree ("environment","status","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_route_version_unique" ON "ai_route_versions" USING btree ("route_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_service_version_unique" ON "ai_service_versions" USING btree ("service_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_taxonomy_version_unique" ON "ai_taxonomy_versions" USING btree ("taxonomy_id","version");
