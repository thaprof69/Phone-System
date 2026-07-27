# ADR 0016: Canonical Conversation Intelligence Manifest

## Status

Accepted — 2026-07-27.

## Context

ADR 0015 made real post-call classification and the provisional/final artifact distinction genuine:
conversation → canonical transcript → real `callSummaries`/`callClassifications`/`callOutcomes` →
real incremental `aggregate_facts`. The user's follow-on request arrived as a 27-section "final
backbone hardening" prompt asking to introduce a "Conversation Intelligence Manifest" — a canonical
per-conversation index of which intelligence is current, complete, and eligible for operational use
— plus wiring it into Mission Control, Intelligence, Reports and Call Detail, with supersession
scaffolding, a "required processing profile" config system, weighted completeness, and extensive new
tests/docs.

Two audits (one exploratory, one design-validating, both grounded in direct code reads and a live
query against the dev database) found the real gap narrower than the literal prompt: **there is no
persisted, per-conversation completeness/discovery record anywhere in the repository.** The closest
existing thing, `computeReportLineage()`, was a period-level, classification-only, recomputed-from-
scratch ratio — never a queryable per-conversation record. `getCall()` picked "the current" summary/
classification by naive array-index (`summaries[0]`), which worked only because no conversation had
ever had more than one revision or a `SUPERSEDED` artifact.

The audits also found several of the literal prompt's sections describe wiring with **no current
consumer to attach to**: none of the six Intelligence sub-pages read artifact-level data at all
(they all read pre-aggregated `aggregate_facts`/`aiUsageRecords`); Mission Control's "processing gap"
concept is purely `conversations.processingState`-derived, and its `/calls/partial` link is already a
pre-existing dead route, unrelated to this work; `outboxEvents` has zero consumers today (documented
non-goal in ADR 0014). Building manifest-aware UI for these would be new, unasked-for product surface
with nothing real to plug into.

## Decision

### The manifest is a discovery/completeness index, not a second intelligence store

`aiArtifacts`, `callSummaries`, `callClassifications`, `callOutcomes` remain the source of
intelligence truth. `conversation_intelligence_manifests` is the source of discovery/completeness
truth — it references and counts artifacts, it never duplicates their payload content. Each row
answers: which transcript revision was analysed, which outputs currently exist, how complete the
conversation's intelligence is, and whether processing succeeded, partially succeeded, or failed
outright.

### Schema and the partial-unique-index correction

`conversation_intelligence_manifests`: `conversationId`, nullable `transcriptRevisionId` (nullable to
allow `INSUFFICIENT_EVIDENCE` rows with no transcript at all), `manifestVersion`,
`processingProfileVersion`, `synthetic`, `status` (`COMPLETE`/`PARTIAL`/`INSUFFICIENT_EVIDENCE`/
`FAILED`), `expectedArtifactCount`/`presentArtifactCount`/`completenessRatio`, `artifactIndex`
(jsonb — ids and `intelligenceState` per output, never full payloads), `warnings`,
`supersedesManifestId`/`supersededAt`, `processingCompletedAt`.

**Binding correction from plan review**: the uniqueness constraint is a _partial_ unique index
(`WHERE superseded_at IS NULL`), never a permanent constraint on `conversationId` alone. A permanent
constraint would have made it structurally impossible for a future reprocessing or transcript-
correction run to insert `manifestVersion = 2` while preserving the `manifestVersion = 1` row —
exactly the scenario `supersedesManifestId`/`supersededAt` exist to support. Every current-manifest
read and the worker activity's idempotency check filter on `conversationId` + `supersededAt IS
NULL`. This task implements no reprocessing or active supersession _behaviour_ — no code path ever
sets `supersedesManifestId`, `supersededAt`, or `manifestVersion > 1` — only the schema headroom to
support it later without a destructive migration, matching the precedent already set by
`aiArtifacts.intelligenceState`'s unused `SUPERSEDED` value.

### `processingProfileVersion` — a second binding refinement from plan review

`expectedArtifactCount`/`presentArtifactCount`/`completenessRatio` depend on an implicit assumption:
that summary, classification, and outcome are _today's_ required outputs. Future capabilities
(sentiment, quality, follow-up, knowledge gap) will eventually join that required set. Without a
recorded profile version, every historical manifest's completeness score would silently mean
something different the day that set grows — "100%" would stop meaning "100% of what was required
when this was computed" and start meaning "100% of today's requirements," retroactively. Each
manifest stores `processingProfileVersion` (currently always `1`, named by the exported constant
`CURRENT_PROCESSING_PROFILE_VERSION` in `apps/worker/src/activities.ts`) precisely so this never
happens: a manifest computed under profile version 1 always means 100% of profile version 1's
requirements, regardless of what profile version 2 later adds. Bumping the constant is the entire
cost of a future required output — no other manifest logic changes.

This is deliberately _not_ a separate "required processing profile" config system: the profile is
one integer plus one three-item check (`computeManifestCompleteness`), not a hand-authored registry
duplicating `CONVERSATION_FINALISATION_PIPELINE`. A genuine per-stage config system was considered
and rejected — `CONVERSATION_FINALISATION_PIPELINE`'s own `outputArtifactTable` field is not
uniformly per-conversation-checkable (`aggregate_facts` has no `conversationId` column at all; many
conversations' contributions sum into the same row), so the pipeline's own `partialSoFar` boolean —
already threaded into every stage's input — is the correct signal for the two stages
(`LINK_AND_FOLLOW_UP`, `AGGREGATE`) that can't be checked by row presence, combined with three direct
per-conversation queries for the stages that can.

### One new finalisation pipeline stage — no workflow-code changes

`BUILD_INTELLIGENCE_MANIFEST` is appended as the new last entry in
`CONVERSATION_FINALISATION_PIPELINE` (`packages/workflows/src/finalisation-pipeline.ts`), running
after `AGGREGATE`. `postCallWorkflow` needed zero changes — it already iterates the registry
generically. The new activity, `buildConversationIntelligenceManifest`
(`apps/worker/src/activities.ts`), mirrors `aggregateConversation`'s idempotency convention (check
first, bail if a current manifest already exists), queries the same three tables `getCall()` already
reads (`callSummaries`/`callClassifications`/`callOutcomes`, latest revision/created-at), resolves
referenced `aiArtifacts` for their `intelligenceState`, and writes one row. Its return state is
always `COMPLETED` on a successful write — mirroring `aggregateConversation`'s own precedent that a
stage's return state reflects whether the stage itself ran, not whether the underlying data was
complete; partiality is encoded in the written row, not the stage's own completion signal.

### Deterministic backfill — all 212 completed/partial conversations

The user's binding scope decision: the backfill must cover all completed/partial conversations, real
and synthetic alike, not just the single real one — because the synthetic dataset is what operator
testing/UX refinement (the explicitly stated next phase after this task) will actually be exercised
against, and an empty manifest panel on 211 of 212 seeded calls would look like a bug rather than a
deliberate boundary. Ten binding rules governed it (preserve `synthetic`; never fabricate; derive
status purely from real record presence, never copied from `conversations.processingState`; one
deterministic idempotent SQL statement; report final counts). The backfill (appended to migration
`0013_chilly_payback.sql`) confirmed, rather than assumed, that every one of the 212 conversations
already has exactly one summary, classification, and outcome row — all 212 backfilled as `COMPLETE`,
none `PARTIAL`/`FAILED`/`INSUFFICIENT_EVIDENCE`, including the 16 conversations whose
`processingState` was `PARTIAL` for an unrelated historical reason (per rule 6: they remain `PARTIAL`
only if their real linked records genuinely fail to satisfy the complete profile — here they don't).

### Read path and Reports — additive, not a new endpoint

`getCall()` (`platform.service.ts`) gained a private `getCurrentManifest()` helper, called as one
more parallel query in the existing `Promise.all`, returned as an additive `manifest` field — no new
endpoint or admin-web proxy route, since `control-plane.controller.ts`'s `getCall` route is a bare
passthrough. `computeReportLineage()`'s ad-hoc `callClassifications ⋈ aiArtifacts` join was replaced
with a query against `conversationIntelligenceManifests` (joined once to `conversations` for the
period + `synthetic = false` filter), deriving `conversationsWithFinalClassification` from each
manifest's `artifactIndex.classification.intelligenceState === 'FINAL'` in application code — a
genuine simplification, since the manifest now is the thing that join was approximating.
`conversationCount` (from `aggregate_facts`) is untouched.

### Call Detail

A compact "Conversation intelligence" panel was added to the call-rail aside (between "Call
details" and "Provider evidence"), showing status, completeness (`present of expected`), processing
profile version, finalisation time, and any warnings — using existing `Panel`/`DefinitionList`/
`EmptyState` components, no new primitives.

## Consequences

- Equal weighting of the three required outputs (summary/classification/outcome) is the honest
  default, stated here as a deliberate non-decision: no product signal anywhere in the schema or
  existing readers suggests any one output matters more than another for "is this call understood."
  A weighting scheme would be invented, not derived.
- Live verification: a signed webhook round trip against the live API/worker/Temporal stack produced
  a real `conversation_intelligence_manifests` row (`status = 'COMPLETE'`,
  `presentArtifactCount = 3`), and Call Detail's new panel was browser-verified rendering it.
- Explicitly out of scope, deferred with reasons (not silently dropped): Mission Control's
  processing-gap panel (its gap concept is purely `processingState`-derived today and untouched by
  this; its `/calls/partial` destination is a separate, pre-existing dead route); Intelligence
  eligibility integration across the six sub-pages (none of them read artifact-level data today —
  there is no current consumer to wire a manifest into); full supersession/reprocessing trigger
  logic (reprocessing doesn't exist as a feature — only schema headroom is added); a manifest
  history/list API, a technical-detail permission system beyond reusing the existing
  `RequirePermission` guard on `getCall()`, and a bulk reprocessing control plane (no current need).
- `trends` remains unpopulated by any real writer, unchanged by this task.
