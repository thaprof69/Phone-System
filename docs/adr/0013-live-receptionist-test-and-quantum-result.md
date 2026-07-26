# ADR 0013: Live Receptionist Test and the Quantum Result evaluation pipeline

## Status

Accepted — 2026-07-26.

## Context

A sibling project, Quantum Park Lite, has a well-shaped operator workflow at `/settings/phone/test`:
start a session, fire preset scenarios or a typed message at the receptionist, and see a
"Quantum Result" panel with escalation, booking, confidence, routing and policy. Direct reading of
its source (`phone-live-test.tsx`, `phone-setup.ts`) confirmed both halves of that workflow are
fabricated: the "voice call" never opens a real ElevenLabs session (its own comment says
_"until the ElevenLabs media bridge is connected"_), and the entire Quantum Result panel is
`lower.includes("complaint")`-style keyword matching with no model or business-rule engine behind
it. Phone-System's own prior Simulation Lab (`/settings/simulation/{scenarios,collections,results,
release-checks,reviews}`) is real and working, but it is a QA-engineering console — test-case
checklists, repeat counts, provider-run tables — not an operator workflow for trying the
receptionist.

The objective of this work is not to recreate Quantum Park Lite's internals. It is to reproduce
its operator experience faithfully — copy, buttons, scenario list, panel structure — while
substituting Phone-System's real production architecture everywhere the source is mocked.
Quantum Park Lite is the workflow and UX reference; Phone-System remains the architectural
authority.

## Decision

**`/settings/simulation` becomes the primary, and only, operator-facing testing workflow**: Live
Receptionist Test. It requires a real, published, in-sync ElevenLabs agent for both voice and
text-only testing — no lower-friction fallback path, and no response is ever presented as coming
from the receptionist unless it really did. If the agent isn't published or the provider is
unavailable, the session start is refused with the real server-stated reason (the same honest
`BLOCKED`/reason pattern the live voice session feature already established), never a silent local
fallback.

The engineering QA console (Scenarios, Test collections, Provider test runs, Release checks,
Reviews) is demoted, not deleted, to **Settings → Advanced**. It is a separation of concerns:
operator UX and engineering tooling are different products that no longer share primary
navigation. The old live-voice-call panel that lived inside the Provider test runs page (formerly
"Interactive test" / `/settings/simulation/results`) is removed outright — its capability is fully
superseded by the richer Live Receptionist Test, and keeping both would have been exactly the kind
of duplicated intelligence path this rework exists to avoid.

**The evaluation pipeline is evidence-centred, not decision-centred, and is channel-agnostic.** A
new AIOS capability, `INTERACTION_ANALYSIS`, produces a structured **Interaction Evidence Pack** —
`{ intent, entities, sentiment, urgency, requested_actions, knowledge_requests, possible_routes,
risk_signals, confidence, evidence_ids }` — and nothing else. It has no `recommended_route` or
`proposed_action` field: the AI observes and surfaces candidates, it never decides. Two new
deterministic services consume that evidence:

- `ReceptionistPolicyService` — escalation, blocked actions, and allowed actions, driven by fixed
  business rules (complaint/refund/safety/legal signals always escalate; booking/payment actions
  are always blocked from AI confirmation; low-confidence pricing answers are blocked).
- `ReceptionistRoutingService` — picks the actual destination (Sales/Support/Complaints/
  Emergency/Callback/etc.) from the Evidence Pack's candidate routes plus the policy outcome.
  `executedAction` is always `null`: the system proposes, it never auto-executes.

A new `QuantumResultService` aggregates both across a pipeline that is evidence-source-agnostic by
design: `Interaction → Evidence Collection → Interaction Evidence Pack (AI) → Knowledge
Verification → Policy Evaluation → Routing Engine → Tool Evaluation → Business Action Planning →
Quantum Result`. Only one evidence source (the transcript) exists today; the pipeline shape is
built so a future evidence source (CRM, booking, loyalty, weather) plugs into Evidence Collection
without redesigning anything downstream.

**The session is a first-class, reusable business object**, `ReceptionistSession` (table
`receptionist_sessions`), not a disposable test record — `mode` (VOICE/TEXT), `purpose` (TEST/
TRAINING/DEBUG/VALIDATION), `source` (SCENARIO/MANUAL/LIVE) so the same object can back onboarding,
demo, regression and support-training workflows later without a schema change. The row holds
**only** `latestAnalysisArtifactId`, a pointer into the real `aiArtifacts` table — no denormalized
escalation/booking/confidence/routing/policy columns. Every read (the Quantum Result panel, the
session detail page, the recent/all sessions lists) re-derives those fields from the real artifact
at request time, so the session and its evidence can never drift apart. List views resolve
`escalationStatus` per row the same way for the same reason (`ReceptionistSessionService.
withEscalationStatus`), rather than caching it.

The Generated ElevenLabs Agent Instructions panel is not a second prompt generator: it reuses
`composeRuntimePrompt()` from `packages/domain`, the same function the real agent-publish path
already uses, so the panel can never diverge from what would actually be sent to ElevenLabs.

## Consequences

- **Authority boundaries are explicit and enforced by construction**: Quantum Park Lite is
  workflow/UX reference only; AIOS produces evidence and decides nothing; the Policy and Routing
  services are the only deterministic decision points; Quantum Result is a read-time aggregation,
  never a second source of truth.
- **`AiosPlatformService.getSchema()`'s validator was previously hardcoded to only validate
  `CALL_SUMMARY`** — every other capability key silently returned `false` and could never succeed.
  This was a real pre-existing bug, not something this feature introduced; fixed by adding an
  `INTERACTION_ANALYSIS` branch (and any future capability will need the same).
- **`aiArtifacts.confidence` was never populated for any capability** — a second real pre-existing
  gap found while wiring the Evidence Pack's confidence field through to persistence, fixed in
  `AiosPlatformService.persistExecution()`.
- Old Simulation Lab routes (`/settings/simulation/{scenarios,collections,results,release-checks,
reviews}`) redirect (permanent, 308) to their new `/settings/advanced/*` locations; `/quality/*`
  legacy redirects were repointed to match.
- The full positive-path Live Receptionist Test flow against a real in-sync ElevenLabs agent is
  verified by direct API round trip (see release evidence), not by Playwright, because the seeded
  development agent versions have no genuinely in-sync provider deployment — the same
  externally-blocked limitation already documented for the live voice session feature. The honest
  `Refused` path is covered by Playwright.
