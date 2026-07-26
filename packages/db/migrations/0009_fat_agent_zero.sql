ALTER TABLE "provider_integrations" ADD COLUMN "verified_agent_name" text;--> statement-breakpoint
ALTER TABLE "provider_integrations" ADD COLUMN "agent_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provider_integrations" ADD COLUMN "receptionist_display_name" text;--> statement-breakpoint
ALTER TABLE "provider_integrations" ADD COLUMN "greeting_override" text;--> statement-breakpoint
ALTER TABLE "provider_integrations" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "provider_integrations" ADD COLUMN "voice_testing_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_integrations" ADD COLUMN "chat_testing_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_integrations" ADD COLUMN "transcript_capture" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_integrations" ADD COLUMN "summary_generation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_integrations" ADD COLUMN "escalation_detection" boolean DEFAULT false NOT NULL;