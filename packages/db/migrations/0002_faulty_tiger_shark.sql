CREATE TYPE "public"."correction_status" AS ENUM('PROPOSED', 'APPROVED', 'REJECTED', 'APPLIED');--> statement-breakpoint
CREATE TYPE "public"."correction_target" AS ENUM('CANONICAL_TRANSCRIPT', 'REDACTED_TRANSCRIPT', 'SUMMARY', 'CLASSIFICATION', 'ENTITY', 'CUSTOMER_LINK');--> statement-breakpoint
CREATE TABLE "correction_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"correction_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_status" "correction_status",
	"to_status" "correction_status" NOT NULL,
	"actor_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"target_type" "correction_target" NOT NULL,
	"target_record_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"status" "correction_status" DEFAULT 'PROPOSED' NOT NULL,
	"reason" text NOT NULL,
	"proposed_value" jsonb NOT NULL,
	"proposed_by" uuid NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"applied_record_id" uuid,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "correction_history" ADD CONSTRAINT "correction_history_correction_id_corrections_id_fk" FOREIGN KEY ("correction_id") REFERENCES "public"."corrections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "correction_target_revision_unique" ON "corrections" USING btree ("target_type","target_record_id","revision");--> statement-breakpoint
CREATE INDEX "correction_conversation_status" ON "corrections" USING btree ("conversation_id","status");