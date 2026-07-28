CREATE TYPE "public"."intelligence_capability" AS ENUM('TRANSCRIPT_SUMMARY', 'AI_COPILOT', 'CONTEXTUAL_GUIDE');--> statement-breakpoint
CREATE TYPE "public"."intelligence_error_category" AS ENUM('AUTHENTICATION', 'AUTHORIZATION', 'MODEL_NOT_FOUND', 'RATE_LIMIT', 'TIMEOUT', 'NETWORK', 'PROVIDER_ERROR', 'INVALID_RESPONSE', 'INVALID_REQUEST', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."intelligence_execution_outcome" AS ENUM('SUCCESS', 'FAILURE');--> statement-breakpoint
CREATE TYPE "public"."intelligence_execution_tier" AS ENUM('PRIMARY', 'FALLBACK');--> statement-breakpoint
CREATE TYPE "public"."intelligence_model_status" AS ENUM('NOT_TESTED', 'CONNECTED', 'FAILED', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."intelligence_provider" AS ENUM('OPENAI', 'ANTHROPIC', 'DEEPSEEK', 'KIMI', 'QWEN', 'GEMINI');--> statement-breakpoint
CREATE TYPE "public"."intelligence_route_status" AS ENUM('READY', 'MISSING_MODEL', 'PROVIDER_UNAVAILABLE', 'FALLBACK_ACTIVE');--> statement-breakpoint
CREATE TABLE "intelligence_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capability" "intelligence_capability" NOT NULL,
	"route_id" uuid,
	"configured_model_id" uuid,
	"provider" "intelligence_provider" NOT NULL,
	"submodel" text NOT NULL,
	"tier" "intelligence_execution_tier" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"latency_ms" integer,
	"outcome" "intelligence_execution_outcome" NOT NULL,
	"error_category" "intelligence_error_category",
	"error_message" text,
	"provider_request_id" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intelligence_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "intelligence_provider" NOT NULL,
	"submodel" text NOT NULL,
	"credential_reference_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"status" "intelligence_model_status" DEFAULT 'NOT_TESTED' NOT NULL,
	"last_successful_test_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_failure_category" "intelligence_error_category",
	"last_failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intelligence_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capability" "intelligence_capability" NOT NULL,
	"primary_model_id" uuid,
	"fallback_model_id" uuid,
	"status" "intelligence_route_status" DEFAULT 'MISSING_MODEL' NOT NULL,
	"last_tested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intelligence_executions" ADD CONSTRAINT "intelligence_executions_route_id_intelligence_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."intelligence_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_executions" ADD CONSTRAINT "intelligence_executions_configured_model_id_intelligence_models_id_fk" FOREIGN KEY ("configured_model_id") REFERENCES "public"."intelligence_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_models" ADD CONSTRAINT "intelligence_models_credential_reference_id_provider_credential_references_id_fk" FOREIGN KEY ("credential_reference_id") REFERENCES "public"."provider_credential_references"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_routes" ADD CONSTRAINT "intelligence_routes_primary_model_id_intelligence_models_id_fk" FOREIGN KEY ("primary_model_id") REFERENCES "public"."intelligence_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_routes" ADD CONSTRAINT "intelligence_routes_fallback_model_id_intelligence_models_id_fk" FOREIGN KEY ("fallback_model_id") REFERENCES "public"."intelligence_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intelligence_execution_capability_idx" ON "intelligence_executions" USING btree ("capability","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "intelligence_model_provider_submodel_unique" ON "intelligence_models" USING btree ("provider","submodel");--> statement-breakpoint
CREATE UNIQUE INDEX "intelligence_route_capability_unique" ON "intelligence_routes" USING btree ("capability");