CREATE TABLE "customer_registration_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"digital_link_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"park" text NOT NULL,
	"communication_preferences" jsonb NOT NULL,
	"state" text DEFAULT 'REQUESTED' NOT NULL,
	"external_customer_id" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy_consent_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_request_id" uuid NOT NULL,
	"policy_version" text NOT NULL,
	"purpose" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_inbox_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_event_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"state" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"workflow_id" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_registration_requests" ADD CONSTRAINT "customer_registration_requests_digital_link_id_digital_links_id_fk" FOREIGN KEY ("digital_link_id") REFERENCES "public"."digital_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_consent_acceptances" ADD CONSTRAINT "privacy_consent_acceptances_registration_request_id_customer_registration_requests_id_fk" FOREIGN KEY ("registration_request_id") REFERENCES "public"."customer_registration_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_inbox_entries" ADD CONSTRAINT "webhook_inbox_entries_raw_event_id_raw_webhook_events_id_fk" FOREIGN KEY ("raw_event_id") REFERENCES "public"."raw_webhook_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "registration_digital_link_unique" ON "customer_registration_requests" USING btree ("digital_link_id");--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_consent_registration_unique" ON "privacy_consent_acceptances" USING btree ("registration_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_inbox_raw_event_unique" ON "webhook_inbox_entries" USING btree ("raw_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_inbox_idempotency_unique" ON "webhook_inbox_entries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "webhook_inbox_pending" ON "webhook_inbox_entries" USING btree ("state","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "digital_link_token_hash_unique" ON "digital_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "digital_link_expiry" ON "digital_links" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tool_invocation_provider_request_unique" ON "tool_invocations" USING btree ("provider_request_id");