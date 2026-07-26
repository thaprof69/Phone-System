# ADR 0015: Real post-call classification, provisional/final intelligence, and the finalisation pipeline registry

## Status

Accepted — 2026-07-26.

## Context

The prior work (ADR 0013/0014) made the Simulation Lab's per-turn evidence pipeline real —
`INTERACTION_ANALYSIS` produces a genuine, evidence-linked Interaction Evidence Pack, resolved at
read time by `QuantumResultService`. Auditing the real post-call pipeline (`webhook.controller.ts`
→ `WebhookIngestionService.accept()` → Temporal `postCallWorkflow`) found it diverges sharply:
`normalizeAndRedact` → `enrichConversation` (`CALL_SUMMARY`) → `deriveOutcome` (deterministic) →
`linkAndFollowUp`/`aggregateConversation` (confirmed no-op state transitions only) →
`completeProcessing`. It never invoked `INTERACTION_ANALYSIS`. Net effect: every real call got a
summary and a deterministic outcome but zero intent/sentiment — `callClassifications`/`callEntities`
had columns ready (including an `aiArtifactId` FK) but their only writer anywhere in the repository
was the synthetic seed script. Every intent shown on Calls, Call Detail, and Mission Control's
"what callers are asking" panel was fabricated seed data with no live path to ever become real.

Separately, `aggregateFacts` (5 of Intelligence's ~7 sub-pages, and Reports' entire lineage) was
populated exclusively by the seed script — no cron, no scheduler, anywhere in `apps/api/src` or
`apps/worker/src`. There was no mechanism, even in principle, for these tables to reflect a real
conversation. And no artifact anywhere distinguished a live, in-conversation (provisional)
evaluation from a settled, post-conversation (final) one.

Two concrete, pre-existing facts in the code pointed at exactly this gap being intentional but
unfinished: `enrichConversation` already set `conversations.processingState = 'CLASSIFYING'` as its
last step, and the `conversation_processing_state` enum already included an unused `LINKING` value
— the workflow was built anticipating a classification stage between summarisation and linking that
was never implemented.

The user's follow-on brief for this work was large (a 34-section "transcript-centred intelligence"
specification). Two direct-code audits confirmed the correct scope was to close this one
architectural gap — reusing `INTERACTION_ANALYSIS` rather than building any of 18 other draft
capability keys, extending the existing incremental table rather than building a generic
read-model/rebuild framework — and to explicitly defer the rest (full observability, multi-channel
ingestion, legacy data migration — there is none, every existing row is synthetic — and a full
outcome-action-state redesign). The user signed off on that scope with one addition: a lightweight,
declarative pipeline registry so future finalisation stages are _registered_, not hand-wired into
`postCallWorkflow`'s control flow.

## Decision

### Reuse `INTERACTION_ANALYSIS` for real post-call classification

No new AIOS capability was built. `INTERACTION_ANALYSIS` already produces intent/sentiment/urgency/
entities with its own real prompt/schema/service, is seeded `ACTIVE`, and its capability version's
`allowedCallers: ['worker', 'api']` already permits a worker call with no governance change. A new
worker activity, `classifyInteraction` (`apps/worker/src/activities.ts`), mirrors
`enrichConversation`'s exact shape: idempotency check against `callClassifications`, the same
`executionContext`/`contextSources` construction against the REDACTED transcript revision, a real
`callClassifications` row plus `callEntities` rows on success, `{ state: 'PARTIAL' }` on any
non-success exactly like `enrichConversation`, and — the one real state-machine fix — transitions
`conversations.processingState` to the previously-unused `LINKING` value on success, completing the
sequence `CLASSIFYING → LINKING → FOLLOW_UP → AGGREGATED → COMPLETED/PARTIAL` the schema already
implied. The field-mapping from a parsed `InteractionEvidence` pack to the classification/entity
insert rows is a pure function, `buildClassificationInsert`, extracted for direct unit testing —
matching this codebase's existing convention (`buildDiagnosticChecks`) of unit-testing only
DB-independent logic.

The entity schema in `packages/intelligence` gained `entity_type` on each entity item (matching
`callEntities.entityType`/`value`), refreshed in place at schema version 1 rather than versioned to
2 — this capability has not yet processed a conversation outside this development cycle, so its
schema is still safely revisable; once a real artifact references it in a shipped environment, a
future content change must become a genuine new schema version instead.

Per-turn `INTERACTION_ANALYSIS` calls from `QuantumResultService.evaluateTurn()` are untouched: same
capability, different call site, different purpose, different `intelligenceState`. Simulation Lab
conversations never enter `postCallWorkflow`, so no conversation ever receives both a provisional
per-turn artifact and a final post-call one from the same activity.

### Provisional vs. final intelligence

`aiArtifacts` gained `intelligenceState: 'PROVISIONAL' | 'FINAL' | 'SUPERSEDED'`, required at
insert with no default — every caller states it explicitly, never inferred from `purpose` or
capability key. It threads through `AIOSExecutionContext` (`packages/aios-contracts`) into
`AiosPlatformService.persistExecution()`'s artifact insert. `enrichConversation` and
`classifyInteraction` pass `'FINAL'`; `QuantumResultService.evaluateTurn()` passes `'PROVISIONAL'`.
`QuantumResultService.resolve()` surfaces it on the returned `QuantumResult`, additively. `SUPERSEDED`
is reserved now for a future reprocessing/versioning system and is not set anywhere — stated here so
it is never mistaken for a half-built feature.

The migration backfilling this column on the 40 pre-existing `ai_artifacts` rows used a considered
mapping, not a blanket default: 39 `CALL_SUMMARY` rows backfilled `FINAL` (they are settled post-call
evidence), the 1 `INTERACTION_ANALYSIS` row — the genuine per-turn artifact from ADR 0013's live
manual verification — backfilled `PROVISIONAL`, joining through `ai_capability_versions` to read
each row's real capability key rather than guessing from row order.

### The conversation finalisation pipeline registry

**The one binding addition from plan review.** `postCallWorkflow`'s hard-coded activity chain is
replaced by a small, statically-declared array, `CONVERSATION_FINALISATION_PIPELINE`
(`packages/workflows/src/finalisation-pipeline.ts`), each entry declaring `key`, `activityName`,
`kind` (`DETERMINISTIC` | `AI_CAPABILITY`), `requiresTranscriptState` (`NONE` | `REDACTED`),
`blocking`, `outputArtifactTable`, and `retryPolicy`. The workflow special-cases only the first
stage (`NORMALIZE_AND_REDACT`, the one stage whose input/output shape genuinely differs — it has no
transcript revision yet, it produces one) and then iterates the remaining five stages
(`CALL_SUMMARY`, `INTERACTION_ANALYSIS`, `DERIVE_OUTCOME`, `LINK_AND_FOLLOW_UP`, `AGGREGATE`)
generically via `activities[stage.activityName]`, building one Temporal activity proxy per stage
from its own `retryPolicy` (all currently identical, but genuinely per-stage — a future stage with
different retry needs is a data change, not a workflow change).

`shouldHaltPipeline(blocking, failed)` is the one real piece of control-flow logic in the loop —
named and exported so it is independently unit-testable without a Temporal workflow runtime — a
failing blocking stage halts the pipeline (thrown, propagating exactly as an unwrapped failure
already did before this change); a failing non-blocking stage marks the run `partial` and continues.
`LINK_AND_FOLLOW_UP` (the pre-existing `linkAndFollowUp` no-op-content activity) stays in the
registry even though the original plan's stage list only named five stages — dropping it would have
silently removed the `FOLLOW_UP` processing-state transition the schema still expects, which is a
regression the plan never asked for.

This is deliberately not a dynamic, DB-driven pipeline: no runtime stage lookup inside the workflow,
no admin-editable stage list. `CONVERSATION_FINALISATION_PIPELINE` is static, versioned TypeScript
data — safe for Temporal replay because it's compiled data, not a runtime read — checked into the
same file the workflow already lives in. Adding a future capability (Quality, Knowledge Gap,
Compliance, Customer Effort, Follow-up) is one activity function with the shared
`{conversationId, transcriptRevisionId, partialSoFar} → {state}` shape, one `PostCallActivities`
entry, and one registry row — `postCallWorkflow`'s own code does not change.

### Real, incremental aggregate population and synthetic exclusion

`aggregateConversation` is now a real activity: idempotent (skips if `processingState` already shows
this conversation was aggregated), reads the conversation's park/language/synthetic flag, its (now
real) `callClassifications.primaryIntent`, its `callOutcomes.outcome`, and duration, and upserts
`aggregate_facts` rows (`ON CONFLICT ... DO UPDATE SET count = count + excluded.count, sum = sum +
excluded.sum`) for exactly the dimensions the existing readers already consume (`total`, `park`,
`language`, `intent`, `outcome`). One conversation contributes exactly once. The dimension-row
construction, `buildAggregateRows`, is a second pure, directly-tested function.

`aggregate_facts` gained a `synthetic` boolean, made part of its composite primary key (not just a
filter column) — a synthetic and a real conversation on the same day/dimension/value must accumulate
into separate counters, never collide. The migration backfilled every pre-existing row `synthetic =
true`: the audit confirmed every one of the 762 existing rows came exclusively from the synthetic
seed script, so defaulting to `false` (real) would have been factually wrong for 100% of existing
data. `analyticsSeries()` and `computeReportLineage()` (`platform.service.ts`) now default to
excluding synthetic rows, with an optional `includeSynthetic` parameter threaded from the controller
for explicit dev/QA visibility. `analyticsAgentPerformance()` deliberately defaults the opposite way
(`includeSynthetic = true`) — its three dimension keys (`agentVersion`/`agentVersionOutcome`/
`agentVersionTest`) have no real writer anywhere, including the real `aggregateConversation` built in
this same task, so excluding synthetic by default would empty its entire page for no honesty gain.
This was found by the full e2e suite (not the live webhook verification, which never touches this
page) and fixed before this task's verification was considered complete.

### Evidence lineage and reports coverage

Call Detail's `getCall()` now also returns `evidenceArtifacts` (the real `aiArtifacts` rows behind
this call's `callSummaries`/`callClassifications`, via their `aiArtifactId`) and `entities` (real
`callEntities` rows). A new "Evidence" tab renders provider/model/prompt-version/schema-version/
confidence/`intelligenceState`/`generatedAt` for each, plus extracted entities — additive fields
only, no existing response shape changed. `computeReportLineage()` additionally computes
`conversationsWithFinalClassification` against `conversationCount` (excluding synthetic
conversations) as a real coverage ratio, rather than a report only ever describing volume with no
statement of how much of that volume is actually classified.

## Consequences

- A genuine, end-to-end live verification was performed: a signed webhook payload (HMAC-SHA256,
  matching ElevenLabs' real signature scheme) was posted against a live API + worker + Temporal
  stack (docker-compose dependencies, locally-built `dist/` for api/worker/provider-simulator).
  The resulting conversation reached `processing_state = COMPLETED`, produced a real
  `call_classifications` row (`primary_intent: general_enquiry`, `intelligence_state: FINAL` on its
  joined artifact, real `provider_key`/model/prompt/schema version identifiers), a real
  `call_outcomes` row, and five real `aggregate_facts` rows correctly marked `synthetic: false` —
  verified side-by-side with the 762 pre-existing rows, all `synthetic: true`. Call Detail's Evidence
  tab rendered both real artifacts correctly in a live browser check.
- That same live verification surfaced and fixed a real, pre-existing bug unrelated to this task's
  own new code: `apps/admin-web/app/calls/[id]/page.tsx` rendered `SummarySchema`'s `purpose`/
  `caller_requests`/`unresolved_items` fields as if they were plain strings, when the real schema
  (`packages/intelligence`) has always defined them as `{text, evidence_ids}` claim objects — this
  crashed the entire Call Detail page for any conversation with a real (non-seed-fabricated) summary.
  Fixed in the page component, and the synthetic seed script's own summary generation
  (`seed-synthetic.ts`) was corrected to produce the same real shape, so seeded and real call
  summaries are now structurally identical — no separate "seed data has its own approximate shape"
  drift going forward. The 211 already-seeded `call_summaries` rows were reshaped in place.
- `trends` stays unpopulated by any real writer — named here as a deliberate, unaddressed follow-on,
  not silently dropped. No reader currently depends on it being live.
- Full bespoke prompt/schema authoring for the other 18 draft capability keys, a generic
  rebuildable read-model framework, a fully dynamic/DB-driven finalisation pipeline, full
  observability instrumentation beyond the existing `aiUsageRecords`/`auditEvents`/outbox events,
  legacy production data migration (there is none — every row anywhere is synthetic or
  development-verification data), multi-channel (WhatsApp/Zendesk/email) ingestion, Simulation Lab
  transcript redaction, and a full outcome action-state redesign are all explicitly out of scope —
  each a genuine, larger follow-on in its own right, not an oversight.
