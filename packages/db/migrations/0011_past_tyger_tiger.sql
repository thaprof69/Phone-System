CREATE TYPE "public"."elevenlabs_diagnostic_status" AS ENUM('PASS', 'WARNING', 'FAIL', 'NOT_CONFIGURED');--> statement-breakpoint
CREATE TYPE "public"."elevenlabs_voice_mode" AS ENUM('WEBRTC_PREFERRED', 'WEBSOCKET_ONLY');--> statement-breakpoint
CREATE TYPE "public"."media_verification_status" AS ENUM('PASS', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."voice_session_transport" AS ENUM('WEBRTC', 'WEBSOCKET');--> statement-breakpoint
CREATE TABLE "elevenlabs_diagnostic_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"status" "elevenlabs_diagnostic_status" NOT NULL,
	"checks" jsonb NOT NULL,
	"warnings" text[] NOT NULL,
	"errors" text[] NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "elevenlabs_media_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"voice_session_id" uuid,
	"transport" "voice_session_transport" NOT NULL,
	"status" "media_verification_status" NOT NULL,
	"microphone_established" boolean DEFAULT false NOT NULL,
	"agent_audio_received" boolean DEFAULT false NOT NULL,
	"transcript_events_received" boolean DEFAULT false NOT NULL,
	"connected_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_integrations" ADD COLUMN "voice_mode" "elevenlabs_voice_mode" DEFAULT 'WEBSOCKET_ONLY' NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD COLUMN "transport" "voice_session_transport" NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD COLUMN "session_expires_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD COLUMN "receptionist_session_id" uuid;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD COLUMN "replaces_voice_session_id" uuid;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD COLUMN "failure_category" text;--> statement-breakpoint
ALTER TABLE "elevenlabs_diagnostic_runs" ADD CONSTRAINT "elevenlabs_diagnostic_runs_integration_id_provider_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."provider_integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elevenlabs_media_verifications" ADD CONSTRAINT "elevenlabs_media_verifications_integration_id_provider_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."provider_integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elevenlabs_media_verifications" ADD CONSTRAINT "elevenlabs_media_verifications_voice_session_id_voice_sessions_id_fk" FOREIGN KEY ("voice_session_id") REFERENCES "public"."voice_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "elevenlabs_diagnostic_runs_integration_idx" ON "elevenlabs_diagnostic_runs" USING btree ("integration_id","checked_at");--> statement-breakpoint
CREATE INDEX "elevenlabs_media_verifications_integration_idx" ON "elevenlabs_media_verifications" USING btree ("integration_id","transport","verified_at");--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_receptionist_session_id_receptionist_sessions_id_fk" FOREIGN KEY ("receptionist_session_id") REFERENCES "public"."receptionist_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_replaces_voice_session_id_voice_sessions_id_fk" FOREIGN KEY ("replaces_voice_session_id") REFERENCES "public"."voice_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sessions" DROP COLUMN "signed_url_expires_at";