CREATE TYPE "public"."provider_integration_environment" AS ENUM('SANDBOX', 'PRODUCTION');--> statement-breakpoint
CREATE TYPE "public"."provider_integration_status" AS ENUM('NOT_CONFIGURED', 'VALIDATING', 'CONNECTED', 'DEGRADED', 'INVALID_CREDENTIALS', 'DISCONNECTED', 'ERROR');--> statement-breakpoint
CREATE TABLE "encrypted_provider_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"secret_reference" text NOT NULL,
	"provider" text NOT NULL,
	"ciphertext" text NOT NULL,
	"initialization_vector" text NOT NULL,
	"authentication_tag" text NOT NULL,
	"key_version" text NOT NULL,
	"rotated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "encrypted_provider_credentials_secret_reference_unique" UNIQUE("secret_reference")
);
--> statement-breakpoint
CREATE TABLE "provider_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"credential_reference_id" uuid NOT NULL,
	"connection_label" text NOT NULL,
	"environment" "provider_integration_environment" NOT NULL,
	"status" "provider_integration_status" NOT NULL,
	"default_agent_id" text,
	"default_voice_id" text,
	"agent_count" integer DEFAULT 0 NOT NULL,
	"voice_count" integer DEFAULT 0 NOT NULL,
	"capability_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_error_code" text,
	"disconnected_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_integrations" ADD CONSTRAINT "provider_integrations_workspace_id_provider_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."provider_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_integrations" ADD CONSTRAINT "provider_integrations_credential_reference_id_provider_credential_references_id_fk" FOREIGN KEY ("credential_reference_id") REFERENCES "public"."provider_credential_references"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_integration_provider_unique" ON "provider_integrations" USING btree ("provider");