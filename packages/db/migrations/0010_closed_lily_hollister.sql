CREATE TYPE "public"."receptionist_session_mode" AS ENUM('VOICE', 'TEXT');--> statement-breakpoint
CREATE TYPE "public"."receptionist_session_purpose" AS ENUM('TEST', 'TRAINING', 'DEBUG', 'VALIDATION');--> statement-breakpoint
CREATE TYPE "public"."receptionist_session_source" AS ENUM('SCENARIO', 'MANUAL', 'LIVE');--> statement-breakpoint
CREATE TYPE "public"."receptionist_session_status" AS ENUM('ACTIVE', 'ENDED');--> statement-breakpoint
ALTER TYPE "public"."provider_integration_status" ADD VALUE 'AGENT_UNAVAILABLE' BEFORE 'DISCONNECTED';--> statement-breakpoint
ALTER TYPE "public"."provider_integration_status" ADD VALUE 'RATE_LIMITED' BEFORE 'DISCONNECTED';--> statement-breakpoint
ALTER TYPE "public"."provider_integration_status" ADD VALUE 'PROVIDER_UNAVAILABLE' BEFORE 'DISCONNECTED';--> statement-breakpoint
CREATE TABLE "receptionist_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"environment" "environment" NOT NULL,
	"mode" "receptionist_session_mode" NOT NULL,
	"purpose" "receptionist_session_purpose" DEFAULT 'TEST' NOT NULL,
	"source" "receptionist_session_source" NOT NULL,
	"status" "receptionist_session_status" DEFAULT 'ACTIVE' NOT NULL,
	"label" text NOT NULL,
	"voice_session_id" uuid,
	"conversation_id" uuid,
	"transcript_revision_id" uuid,
	"latest_analysis_artifact_id" uuid,
	"started_by" text NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"message_count" integer DEFAULT 0 NOT NULL,
	"synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receptionist_sessions" ADD CONSTRAINT "receptionist_sessions_agent_version_id_agent_config_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_config_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receptionist_sessions" ADD CONSTRAINT "receptionist_sessions_workspace_id_provider_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."provider_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receptionist_sessions" ADD CONSTRAINT "receptionist_sessions_voice_session_id_voice_sessions_id_fk" FOREIGN KEY ("voice_session_id") REFERENCES "public"."voice_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receptionist_sessions" ADD CONSTRAINT "receptionist_sessions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receptionist_sessions" ADD CONSTRAINT "receptionist_sessions_transcript_revision_id_transcript_revisions_id_fk" FOREIGN KEY ("transcript_revision_id") REFERENCES "public"."transcript_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receptionist_sessions" ADD CONSTRAINT "receptionist_sessions_latest_analysis_artifact_id_ai_artifacts_id_fk" FOREIGN KEY ("latest_analysis_artifact_id") REFERENCES "public"."ai_artifacts"("id") ON DELETE no action ON UPDATE no action;