CREATE TYPE "public"."conversation_intelligence_manifest_status" AS ENUM('COMPLETE', 'PARTIAL', 'INSUFFICIENT_EVIDENCE', 'FAILED');--> statement-breakpoint
CREATE TABLE "conversation_intelligence_manifests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"transcript_revision_id" uuid,
	"manifest_version" integer DEFAULT 1 NOT NULL,
	"processing_profile_version" integer DEFAULT 1 NOT NULL,
	"synthetic" boolean DEFAULT false NOT NULL,
	"status" "conversation_intelligence_manifest_status" NOT NULL,
	"expected_artifact_count" integer NOT NULL,
	"present_artifact_count" integer NOT NULL,
	"completeness_ratio" numeric(5, 4) NOT NULL,
	"artifact_index" jsonb NOT NULL,
	"warnings" text[] DEFAULT '{}' NOT NULL,
	"supersedes_manifest_id" uuid,
	"superseded_at" timestamp with time zone,
	"processing_completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_intelligence_manifests" ADD CONSTRAINT "conversation_intelligence_manifests_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_intelligence_manifests" ADD CONSTRAINT "conversation_intelligence_manifests_transcript_revision_id_transcript_revisions_id_fk" FOREIGN KEY ("transcript_revision_id") REFERENCES "public"."transcript_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_intelligence_manifest_current_unique" ON "conversation_intelligence_manifests" USING btree ("conversation_id") WHERE "conversation_intelligence_manifests"."superseded_at" IS NULL;--> statement-breakpoint
-- Deterministic backfill for every completed/partial conversation (real and synthetic alike).
-- Status is derived purely from which real records genuinely exist for that conversation — never
-- copied from conversations.processing_state — matching the binding backfill rules agreed at plan
-- review. Idempotent: reruns insert nothing where a current manifest already exists.
WITH latest_transcript AS (
  SELECT DISTINCT ON (conversation_id) conversation_id, id
  FROM transcript_revisions
  ORDER BY conversation_id,
    CASE revision_type WHEN 'REDACTED' THEN 0 WHEN 'CANONICAL' THEN 1 ELSE 2 END,
    revision DESC
),
latest_summary AS (
  SELECT DISTINCT ON (conversation_id) conversation_id, id, ai_artifact_id
  FROM call_summaries
  ORDER BY conversation_id, revision DESC
),
latest_classification AS (
  SELECT DISTINCT ON (conversation_id) conversation_id, id, ai_artifact_id
  FROM call_classifications
  ORDER BY conversation_id, revision DESC
),
latest_outcome AS (
  SELECT DISTINCT ON (conversation_id) conversation_id, id
  FROM call_outcomes
  ORDER BY conversation_id, created_at DESC
),
present_counts AS (
  SELECT
    c.id AS conversation_id,
    c.synthetic,
    c.ended_at,
    c.updated_at,
    lt.id AS transcript_revision_id,
    ls.id AS call_summary_id,
    ls.ai_artifact_id AS summary_artifact_id,
    lc.id AS call_classification_id,
    lc.ai_artifact_id AS classification_artifact_id,
    lo.id AS call_outcome_id,
    (CASE WHEN ls.id IS NOT NULL THEN 1 ELSE 0 END
      + CASE WHEN lc.id IS NOT NULL THEN 1 ELSE 0 END
      + CASE WHEN lo.id IS NOT NULL THEN 1 ELSE 0 END) AS present_count
  FROM conversations c
  LEFT JOIN latest_transcript lt ON lt.conversation_id = c.id
  LEFT JOIN latest_summary ls ON ls.conversation_id = c.id
  LEFT JOIN latest_classification lc ON lc.conversation_id = c.id
  LEFT JOIN latest_outcome lo ON lo.conversation_id = c.id
  WHERE c.processing_state IN ('COMPLETED', 'PARTIAL')
)
INSERT INTO conversation_intelligence_manifests (
  conversation_id, transcript_revision_id, manifest_version, processing_profile_version,
  synthetic, status, expected_artifact_count, present_artifact_count, completeness_ratio,
  artifact_index, warnings, processing_completed_at
)
SELECT
  pc.conversation_id,
  pc.transcript_revision_id,
  1,
  1,
  pc.synthetic,
  (CASE
    WHEN pc.transcript_revision_id IS NULL THEN 'INSUFFICIENT_EVIDENCE'
    WHEN pc.present_count = 3 THEN 'COMPLETE'
    WHEN pc.present_count = 0 THEN 'FAILED'
    ELSE 'PARTIAL'
  END)::conversation_intelligence_manifest_status,
  3,
  pc.present_count,
  ROUND(pc.present_count::numeric / 3.0, 4),
  jsonb_strip_nulls(jsonb_build_object(
    'summary', CASE WHEN pc.call_summary_id IS NOT NULL THEN jsonb_build_object(
      'callSummaryId', pc.call_summary_id,
      'aiArtifactId', pc.summary_artifact_id,
      'intelligenceState', (SELECT intelligence_state FROM ai_artifacts WHERE id = pc.summary_artifact_id)
    ) END,
    'classification', CASE WHEN pc.call_classification_id IS NOT NULL THEN jsonb_build_object(
      'callClassificationId', pc.call_classification_id,
      'aiArtifactId', pc.classification_artifact_id,
      'intelligenceState', (SELECT intelligence_state FROM ai_artifacts WHERE id = pc.classification_artifact_id)
    ) END,
    'outcome', CASE WHEN pc.call_outcome_id IS NOT NULL THEN jsonb_build_object('callOutcomeId', pc.call_outcome_id) END
  )),
  (CASE
    WHEN pc.transcript_revision_id IS NULL THEN ARRAY['No canonical transcript revision found for this conversation']
    ELSE array_remove(ARRAY[
      CASE WHEN pc.call_summary_id IS NULL THEN 'Missing call summary' END,
      CASE WHEN pc.call_classification_id IS NULL THEN 'Missing call classification' END,
      CASE WHEN pc.call_outcome_id IS NULL THEN 'Missing deterministic outcome' END
    ], NULL)
  END),
  COALESCE(pc.ended_at, pc.updated_at, now())
FROM present_counts pc
ON CONFLICT (conversation_id) WHERE superseded_at IS NULL DO NOTHING;