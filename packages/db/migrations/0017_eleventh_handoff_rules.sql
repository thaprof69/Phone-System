ALTER TABLE "provider_integrations" ADD COLUMN "transfer_configuration" jsonb DEFAULT '{}'::jsonb NOT NULL;
