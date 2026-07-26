CREATE TYPE "public"."voice_session_status" AS ENUM('INITIATED', 'CONNECTED', 'ENDED', 'FAILED');--> statement-breakpoint
CREATE TABLE "voice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_deployment_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"environment" "environment" NOT NULL,
	"status" "voice_session_status" DEFAULT 'INITIATED' NOT NULL,
	"provider_conversation_id" text,
	"initiated_by" text NOT NULL,
	"signed_url_expires_at" timestamp with time zone NOT NULL,
	"connected_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"error_code" text,
	"synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_agent_id_voice_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."voice_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_agent_deployment_id_agent_deployments_id_fk" FOREIGN KEY ("agent_deployment_id") REFERENCES "public"."agent_deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_workspace_id_provider_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."provider_workspaces"("id") ON DELETE no action ON UPDATE no action;