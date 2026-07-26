CREATE TYPE "public"."ai_intelligence_state" AS ENUM('PROVISIONAL', 'FINAL', 'SUPERSEDED');--> statement-breakpoint
ALTER TABLE "aggregate_facts" DROP CONSTRAINT "aggregate_facts_date_dimension_key_dimension_value_metric_pk";--> statement-breakpoint
ALTER TABLE "aggregate_facts" ADD COLUMN "synthetic" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Every pre-existing row was written exclusively by the synthetic seed script (no
-- production writer exists yet); backfill them as synthetic rather than defaulting to real.
UPDATE "aggregate_facts" SET "synthetic" = true;--> statement-breakpoint
ALTER TABLE "aggregate_facts" ADD CONSTRAINT "aggregate_facts_date_dimension_key_dimension_value_metric_synthetic_pk" PRIMARY KEY("date","dimension_key","dimension_value","metric","synthetic");--> statement-breakpoint
ALTER TABLE "ai_artifacts" ADD COLUMN "intelligence_state" "ai_intelligence_state";--> statement-breakpoint
UPDATE "ai_artifacts" ar
SET "intelligence_state" = CASE
  WHEN ac."key" = 'INTERACTION_ANALYSIS' THEN 'PROVISIONAL'::"ai_intelligence_state"
  ELSE 'FINAL'::"ai_intelligence_state"
END
FROM "ai_capability_versions" acv
JOIN "ai_capabilities" ac ON ac.id = acv.capability_id
WHERE ar.capability_version_id = acv.id;--> statement-breakpoint
ALTER TABLE "ai_artifacts" ALTER COLUMN "intelligence_state" SET NOT NULL;