-- The previous unique index listed `scope_id` directly. PostgreSQL treats nulls as
-- distinct, so an environment-wide budget (scope_id null) was never covered by it and the
-- same policy could be inserted repeatedly. Any database that ran with the old index may
-- therefore already hold duplicates, which would make the new index fail to build.
--
-- Keep the most recently updated row in each scope and remove the rest. Budget policies
-- carry no child rows, so a duplicate is redundant rather than load-bearing.
DELETE FROM "ai_budget_policies" a
USING "ai_budget_policies" b
WHERE a."key" = b."key"
  AND a."environment" = b."environment"
  AND a."scope_type" = b."scope_type"
  AND coalesce(a."scope_id", '') = coalesce(b."scope_id", '')
  AND (a."updated_at", a."id") < (b."updated_at", b."id");--> statement-breakpoint
DROP INDEX "ai_budget_policy_scope";--> statement-breakpoint
CREATE UNIQUE INDEX "ai_budget_policy_scope" ON "ai_budget_policies" USING btree ("key","environment","scope_type",coalesce("scope_id", ''));
