# Execution Record — Operator Control Plane Remediation

Branch: `feature/product-remediation`
Started: 2026-07-24
Status: IN PROGRESS — foundations and breadth pass complete; depth passes 2.2 onward remain

---

## 1. Objective and governing requirements

Replace the generic, engineering-led product layer with a real operator control plane, preserving the sound backend, domain model and governance architecture.

**Objective:** every primary navigation item opens a dedicated functional workspace; every visible tab navigates; every visible action calls an authoritative endpoint; simulator and production states are stated honestly; no placeholder routes remain.

**Governing sources**, in the precedence order set by `AGENTS.md`:

1. Security, privacy, payment, verification and sensitive-case boundaries.
2. `docs/product/source/Quantum_Parks_ElevenLabs_AI_Receptionist_PRD_v2.0.docx`.
3. The Architecture Pack and its ADRs (`docs/architecture/`, `docs/adr/0001`–`0011`).
4. `Quantum_Parks_ElevenLabs_Architecture_Driven_Master_Production_Build_Prompt_v2.0.md`.
5. Repository conventions.

**Requirements in scope:** FR-01–FR-82 and NFR-01–NFR-18 as mapped in
`docs/architecture/Quantum_Parks_ElevenLabs_Architecture_Pack_v2.0/matrices/requirements-architecture-traceability.csv`.
The control-plane surface is the presentation of nearly all of them; NFR-10 (accessibility, WCAG 2.2 AA) and
NFR-04 (control-plane responsiveness) are directly exercised by this work.

**Product boundary reaffirmed (ADR-0001):** ElevenLabs owns live telephony, STT, TTS, turn-taking and the
published runtime agent. Quantum Parks owns the entire operator control plane, local authoritative
configuration, versions, approvals, knowledge, tests, publication, canonical call history, intelligence,
operations, analytics, security and readiness. This remediation adds no runtime voice component.

---

## 2. Decisions and assumptions

| #   | Decision                                                                                  | Rationale                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Breadth pass first (remove all generic/placeholder surfaces), then depth module by module | Removes the misleading product layer fastest; one continuous remediation, not phased scope                                               |
| D2  | Radix primitives styled with the existing CSS custom properties                           | Battle-tested keyboard/focus semantics for tabs, dialog, select, popover; retains the existing design tokens rather than discarding them |
| D3  | Recharts, wrapped behind product-owned components in `packages/ui`                        | Feature pages never import Recharts; wrappers enforce tokens, formatting, responsive containers, accessible titles and table fallbacks   |
| D4  | Extend existing endpoints before adding new ones                                          | The control-plane controller already covers most domains; speculative API surface is prohibited                                          |
| D5  | Provider registry drives the AI admin contract                                            | Replaces `z.literal('OPENAI')`; keeps uninstalled adapters honestly reported rather than offering fake connect actions                   |
| D6  | Rich synthetic seed is a prerequisite, not a nicety                                       | The seed currently creates zero business records, so no populated state can be built or verified without it                              |

**Assumptions**

- A1. Local and CI environments use the deterministic provider simulator; production routing stays `EXTERNALLY_BLOCKED`.
- A2. Non-production requests bypass OIDC via the development principal in `access.guard.ts`; RBAC behaviour is therefore verified by unit tests against `authorize()` rather than by browser session switching.
- A3. Synthetic seed rows carry `synthetic: true` wherever the column exists and are gated on `QP_ENVIRONMENT !== 'production'` (risks R-06, R-15).

---

## 3. Ordered implementation checklist

### Phase 0 — Foundations

- [x] 0.1 Branch `feature/product-remediation` created; baseline suite recorded
- [x] 0.2 Execution record created (this file)
- [x] 0.3 `packages/ui` primitive library — 10 modules, Radix interactives, validated chart palette, 36 unit tests
- [x] 0.4 Rich synthetic seed across the business tables — `packages/db/src/seed-synthetic.ts`
- [x] 0.5 Single navigation source of truth + §6 information architecture

### Phase 1 — Breadth pass

- [x] 1.1 Deleted `apps/admin-web/app/[section]/page.tsx` and `ConfigurationPlaceholder`, plus the whole `administration/settings` tree
- [x] 1.2 Dedicated route trees for all ten domains — 44 routes, real tabs, filtering, sorting, pagination
- [x] 1.3 Mission Control rebuilt as an operator cockpit
- [x] 1.4 Engineering-facing wording removed; "AIOS" now appears only in technical detail

### Phase 2 — Depth passes (fixed order)

- [x] 2.1 Mission Control (§7)
- [x] 2.2 Agent Studio (§8) — conversation editor with server-validated save, governed tool contracts, transfer routing, version comparison, publication judged by provider read-back, rollback and drift reconciliation
- [x] 2.3 Knowledge Hub (§9) — authoring as immutable new versions with a checksum-based identical-edit refusal, submit/review with a genuinely independent approver (resolved from the real principal via `admin_users`, not a shared system identity), sync retry that re-sends local state and never adopts the remote copy, language-validated agent assignment, and gap-to-draft conversion that never auto-publishes
- [x] 2.4 Voice Library (§10) — side-by-side comparison of real per-voice metadata (language, category, accent, use case, availability, approval, consent, assignments); assignment by agent version × language × environment × fallback with the existing production native-language check; a consent-gated approval that refuses a cloned voice with no currently valid consent record; catalogue refresh
- [x] 2.5 Test Studio (§11) — test case authoring saved as an immutable version 1; a run trigger over agent version x test selection x repeat count, reusing the existing provider test creation, mapping and evidence-recording workflow; provider sync for a run still in progress; release-gate wording verified unchanged
- [x] 2.6 Calls and Call Detail (§12) — correction proposal scoped to whichever artefacts a call actually has (transcript, summary, classification), independent decision with a genuinely refused repeat decision, and a reconciliation trigger that reports honestly when the workflow engine cannot be reached rather than assuming success
- [x] 2.7 Operations (§13) — mutating transitions on handoffs, callbacks, staff tasks and messaging, all permissioned, audited and idempotent
- [x] 2.8 AI Infrastructure (§14) — eight areas, each rendered from real records: adapter-driven provider registry with connections, model registry with per-environment approval and availability, capability list drilling through to runs, route registry with a version builder and pre-activation validation, prompt/schema/taxonomy lifecycle, GBP budgets showing spend against limit, execution history with seven filters and pagination, and monitoring
- [ ] 2.9 Administration (§15)
- [ ] 2.10 Analytics and Reports (§16)

### Phase 3 — Verification and documentation

- [ ] 3.1 Browser verification of the 29 required routes across all state variants
- [ ] 3.2 Required behavioural tests and axe checks
- [ ] 3.3 `pnpm check`, `pnpm traceability:check`, `pnpm test:e2e` green
- [ ] 3.4 Traceability, compliance matrix, release evidence, route map and admin guide updated

---

## 4. Commands and real results

### Baseline before any change — 2026-07-24

| Command                          | Result                                                 |
| -------------------------------- | ------------------------------------------------------ |
| `pnpm install --frozen-lockfile` | Already up to date, 18 workspace projects, 317 ms      |
| `pnpm architecture:check`        | `Architecture fitness checks passed.`                  |
| `pnpm traceability:check`        | `Traceability contains FR-01–FR-82 and NFR-01–NFR-18.` |
| `pnpm typecheck`                 | 17 tasks successful, 17 total, 8.524 s                 |
| `pnpm test`                      | 29 tasks successful; api 1 file / 2 tests passed       |
| `pnpm test:unit`                 | 8 test files, 26 tests passed, 594 ms                  |

### Phase 0 results

| Command                                                                                                               | Result                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @quantum-parks/ui typecheck`                                                                           | exit 0                                                                                                                                                                                       |
| `npx vitest run packages/ui/src/ui.test.ts`                                                                           | 1 file, **36 tests passed**                                                                                                                                                                  |
| `node scripts/validate_palette.js "#e2701a,#1c6d99,#d13f3f,#7a4ac4,#0f8a63,#b1860c" --mode light --surface "#fcfcf8"` | **ALL CHECKS PASS** — worst adjacent CVD ΔE 8.7 (protan), normal-vision ΔE 17.7, all six ≥ 3:1 contrast                                                                                      |
| `npx tsx packages/db/src/seed.ts`                                                                                     | `people=6, agentVersions=5, voices=25, knowledgeAssets=30, tests=30, testRuns=3, conversations=220, corrections=8, knowledgeGaps=8, aggregateFacts=515, trends=5, reports=5, auditEvents=14` |
| `GET /v1/calls?limit=3`                                                                                               | 220 conversations available; states include `COMPLETED`, `FAILED_FINAL`, `PARTIAL`                                                                                                           |
| `GET /v1/knowledge`                                                                                                   | 30 items                                                                                                                                                                                     |
| `GET /v1/voices`                                                                                                      | `SUCCESS`, 25 items                                                                                                                                                                          |
| `GET /v1/operations`                                                                                                  | `transfers=7, callbacks=41, tasks=10, deliveries=20`                                                                                                                                         |
| `GET /v1/analytics/summary`                                                                                           | `eligibleConversationCount=0`, `syntheticConversationCount=220`, 12 intents — synthetic records correctly excluded from production-eligible analytics                                        |

### Breadth pass results — 2026-07-25

| Command                                        | Result                                                                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm format`                                  | `All matched files use Prettier code style!`                                                                                                                                                                 |
| `pnpm architecture:check`                      | `Architecture fitness checks passed.`                                                                                                                                                                        |
| `pnpm traceability:check`                      | `Traceability contains FR-01–FR-82 and NFR-01–NFR-18.`                                                                                                                                                       |
| `pnpm typecheck`                               | 17 tasks successful, 17 total                                                                                                                                                                                |
| `pnpm test`                                    | 29 tasks successful, 29 total                                                                                                                                                                                |
| `pnpm test:unit`                               | **9 test files, 62 tests passed** (was 8 files / 26)                                                                                                                                                         |
| `pnpm build`                                   | 17 tasks successful; 44 admin routes compiled                                                                                                                                                                |
| `npx playwright test --project=admin-chromium` | **18 passed**, including 3 axe scans (was 6 tests)                                                                                                                                                           |
| HTTP probe of all 44 routes                    | every route `200`                                                                                                                                                                                            |
| New endpoints probed                           | `mission-control`, `knowledge-releases`, `knowledge-gaps`, `corrections`, `calls-reconciliation`, `quality-reviews`, `administration/access`, `administration/feature-flags`, `analytics/series` — all `200` |

Toolchain: Node v26.0.0, pnpm 11.9.0, Docker running.

---

## 5. Failures, corrections, and evidence paths

Recorded as encountered. Evidence base path: `docs/qa/evidence/`.

### Failures encountered and corrected during the breadth pass

| #   | Failure                                                                                                                                                                                       | Correction                                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Turbopack could not resolve the `.js` specifiers `packages/ui` used under NodeNext, so the barrel exported nothing and every page 500'd                                                       | `packages/ui` is bundler-consumed only; switched it to `moduleResolution: bundler` with extensionless relative imports                                                                                                          |
| F2  | A generated 32-byte credential key was written into the committed `.env.local.example`                                                                                                        | Replaced with an empty placeholder plus the command to generate one; added `!.env.local.example` to `.gitignore` so the template is tracked while `.env.local` stays ignored                                                    |
| F3  | **Real accessibility defect introduced by this work**: chart containers were marked `aria-hidden`, but Recharts renders its own focusable surface inside, which axe reports as 163 violations | Replaced `aria-hidden` with `inert`, which removes the subtree from both the accessibility tree and the tab order. Verified by the axe scan in the analytics browser test                                                       |
| F4  | 14 browser tests failed against the dev server at default parallelism                                                                                                                         | Cold Turbopack compiles, not product defects: the API answered in ~140 ms throughout. Raised the Playwright assertion timeout to 15 s with the reason recorded in the config, and gave the route-walking tests their own budget |
| F5  | `getByRole('heading', { name: 'Roles' })` matched both the `h1` "Users and roles" and the `h2` "Roles"                                                                                        | Test selector corrected to `exact: true`                                                                                                                                                                                        |

### Defects this remediation corrects (verified by inspection, 2026-07-24)

| ID  | Defect                                                                                                                                      | Evidence                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| X1  | Tabs are inert `<span>` elements with index 0 hardcoded active; 32 declared tabs, 8 functional                                              | `apps/admin-web/app/[section]/page.tsx:154-162`                                                  |
| X2  | Eight product domains share one record shape with no table, filter, sort, search, pagination or drill-down                                  | `apps/admin-web/app/[section]/page.tsx:163-209`                                                  |
| X3  | Eight administration routes render a placeholder whose record count is always the literal `0`                                               | `apps/admin-web/app/administration/admin-shell.tsx:115-142`                                      |
| X4  | AI console receives full registry arrays and renders only `.length`                                                                         | `apps/admin-web/app/administration/settings/ai-intelligence/ai-intelligence-console.tsx:633-664` |
| X5  | AI admin API accepts only `OPENAI` and exposes no model, capability, route, prompt, schema, budget, run or monitoring operations            | `apps/api/src/controllers/aios-admin.controller.ts:9`                                            |
| X6  | Seed creates no conversations, knowledge, voices, tests, operations records, aggregate facts or reports, so every domain page renders empty | `packages/db/src/seed.ts`                                                                        |
| X7  | Three independent hardcoded navigation arrays; active state matched by label string rather than pathname                                    | `shell.tsx:18`, `admin-shell.tsx:19`, `admin-shell.tsx:28`                                       |
| X8  | Dead CSS for a tab pattern the console no longer uses                                                                                       | `apps/admin-web/app/globals.css:270-288`                                                         |

---

## 6. FR/NFR and architecture-compliance updates

Presentation now exists for the requirement groups below. These are marked as _surfaced_,
not as _complete_: a list view backed by an authoritative endpoint is not the same as the
full authoring and approval workflow the requirement describes.

| Requirement group                                                    | Surface                                             | State                                                                                                        |
| -------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| FR-01–16 provider connection, agents, prompts, tools, transfers      | Receptionist domain, Administration → Voice runtime | Read, compare and release-state surfaces built; authoring and tool-contract editing outstanding              |
| FR-17–29 knowledge lifecycle and provider sync                       | Knowledge domain                                    | Library, review queue, publication state and gaps built; authoring and approval actions outstanding          |
| FR-30–35 voice catalogue, assignment, approval, consent              | Receptionist → Voice library                        | Catalogue, assignments, availability and consent state built; comparison and approval actions outstanding    |
| FR-36–43 Test Studio and release gates                               | Quality domain                                      | Cases, suites, runs, gates and QA reviews built; test-case editor outstanding                                |
| FR-54–64 webhooks, evidence, transcripts, enrichment, reconciliation | Calls domain                                        | Full call workspace, partial and failed views, corrections and reconciliation built                          |
| FR-65–73 calls, analytics, reports, exports                          | Calls and Intelligence domains                      | Analytics with validated charts, trends and report lineage built; export and scheduling actions outstanding  |
| FR-74–82 operations, messaging, QA, RBAC, audit, retention           | Operations and Administration domains               | Queues, SLA view, access registry, audit chain, retention and flags built; work-item transitions outstanding |
| NFR-10 accessibility (WCAG 2.2 AA)                                   | Whole control plane                                 | Three axe scans pass with zero violations; semantic tables, real navigation landmarks, keyboard paths tested |

`docs/architecture/compliance-matrix.md` and `docs/product/requirements-traceability.md`
are updated as each module reaches full depth, not on the strength of a surface existing.

---

### AI Infrastructure depth pass — 2026-07-25

| Command                                             | Result                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm check`                                        | 17 tasks successful, 17 total                                       |
| `pnpm architecture:check`                           | `Architecture fitness checks passed.`                               |
| `pnpm traceability:check`                           | `Traceability contains FR-01–FR-82 and NFR-01–NFR-18.`              |
| `playwright test --project=admin-chromium`          | **46 passed**, twice consecutively on one freshly reseeded database |
| `playwright test --project=customer-chromium`       | 2 passed                                                            |
| `npx vitest run packages/config/src/config.test.ts` | 10 passed                                                           |
| `pnpm db:migrate`                                   | `Database migrations complete.` (migration `0007`)                  |

Fourteen new browser tests cover the adapter-driven registry, model approval and its
refusals, route creation and pre-activation validation, code-owned schema protection,
repeat-transition conflict, budget validation, budget idempotency, execution filtering
and pagination, and capability drill-through.

### Knowledge Hub depth pass — 2026-07-25

| Command                                       | Result                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm check`                                  | 17 tasks successful, 17 total                                                    |
| `pnpm architecture:check`                     | `Architecture fitness checks passed.`                                            |
| `pnpm traceability:check`                     | `Traceability contains FR-01–FR-82 and NFR-01–NFR-18.`                           |
| `playwright test --project=admin-chromium`    | **52 passed, twice consecutively**, one freshly reseeded database (40.9s, 39.8s) |
| `playwright test --project=customer-chromium` | 2 passed                                                                         |

Three real defects found and fixed while building the six new browser tests: the
independent-approver rule was unenforceable because every write attributed itself to one
shared system identity rather than the real signed-in principal; the version `<Tabs>`
froze on its initial tab across a server refresh because Radix reads `defaultValue` only
on mount; and the authoring panel's own success confirmation was destroyed by its own
`router.refresh()` call the instant the new draft it had just announced came into
existence. All three are recorded in `docs/qa/release-evidence.md`.

---

### Voice Library depth pass — 2026-07-25

| Command                                    | Result                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| `pnpm check`                               | 17 tasks successful, 17 total                                                    |
| `pnpm architecture:check`                  | `Architecture fitness checks passed.`                                            |
| `pnpm traceability:check`                  | `Traceability contains FR-01–FR-82 and NFR-01–NFR-18.`                           |
| `playwright test --project=admin-chromium` | **56 passed, twice consecutively**, one freshly reseeded database (49.5s, 51.7s) |

Four new browser tests cover voice comparison, consent-gated approval reporting, voice
assignment with the production native-language refusal, and catalogue refresh. Verified
directly against the running API: a cloned voice with no consent record is `BLOCKED`
with "no currently valid speaker consent on file"; the same voice with an expired
consent record is still `BLOCKED`; and it succeeds once a valid consent record exists —
exercising all three states the consent gate can be in, not only the seeded happy path.

---

### Test Studio depth pass — 2026-07-25

| Command                                    | Result                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| `pnpm check`                               | 17 tasks successful, 17 total                                                    |
| `pnpm architecture:check`                  | `Architecture fitness checks passed.`                                            |
| `pnpm traceability:check`                  | `Traceability contains FR-01–FR-82 and NFR-01–NFR-18.`                           |
| `playwright test --project=admin-chromium` | **61 passed, twice consecutively**, one freshly reseeded database (53.2s, 49.5s) |

Five new browser tests cover test-case authoring, JSON-definition validation, the
run-refusal path for a release not staged for testing, provider sync for an in-progress
run (with no sync action offered once a run is complete), and a regression test for the
audit-log defect below.

**A real defect found while verifying this pass, unrelated to Test Studio itself**: the
audit log's `listAudit` query ordered and windowed by `occurredAt`, a millisecond-
resolution timestamp. Two events written back to back — routine under the automated
suite's own load — can share one, and `ORDER BY occurredAt LIMIT N` has no tiebreaker
for that case: the window can silently include one of a tied pair while excluding the
other, which then reads as a broken hash-chain link even though every row was written
and chained correctly. Manually verified against the database that the excluded row
(sequence 603) existed with a fully intact chain; the fault was in how the list query
selected its window, not in the data. Fixed by ordering and windowing on the audit
table's own monotonic `sequence` column, which is assigned once per row under the same
advisory lock that builds the chain and can never tie. A regression test fires eight
concurrent budget-policy writes and asserts the chain still reports intact.

---

### Calls and Call Detail depth pass — 2026-07-25

| Command                                    | Result                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| `pnpm check`                               | 17 tasks successful, 17 total                                                  |
| `pnpm architecture:check`                  | `Architecture fitness checks passed.`                                          |
| `pnpm traceability:check`                  | `Traceability contains FR-01–FR-82 and NFR-01–NFR-18.`                         |
| `playwright test --project=admin-chromium` | **65 passed, twice consecutively**, one freshly reseeded database (1.1m, 1.0m) |

Four new browser tests cover correction proposal, JSON validation, decision (with a
genuinely refused repeat decision), and the reconciliation trigger's honest reporting
when the workflow engine is unreachable.

**A deliberate scope boundary, stated rather than silently left ambiguous**: approving a
correction records the decision and reason permanently; it does not itself rewrite the
transcript, summary or classification it targets. `callSummaries` and
`callClassifications` require `provider`, `model`, `promptVersion` and
`schemaVersion` — genuine AI-attribution columns — and splicing a human edit into them
under a fabricated provider and model would misrepresent whose judgement produced the
content, which is exactly the kind of fabrication this remediation exists to prevent.
`corrections.appliedRecordId` and `appliedAt` remain unset; propose → decide → recorded
history is the complete, real, permissioned and audited workflow this pass delivers.

**A third occurrence of the same defect class found and fixed**: the corrections list's
decision control was conditionally rendered only while a correction's status was
`PROPOSED`, so `router.refresh()` after a successful decision flipped the status away
from `PROPOSED` and unmounted the very control showing the "Saved" confirmation, in the
same render the confirmation appeared — the identical failure mode already fixed twice
this session (message retry in Operations, the knowledge authoring panel). Fixed the
same way: the control is always mounted, and its own just-succeeded local state takes
precedence over what the next server render says.

---

## 6a. Resume point

Mission Control (2.1), Agent Studio (2.2), Operations (2.7), AI Infrastructure (2.8),
Knowledge Hub (2.3), Voice Library (2.4), Test Studio (2.5) and Calls/Call Detail (2.6)
are complete — every module in the fixed order except Administration and Analytics.

**The next unchecked item is 2.9 — Administration (§15):**

1. **Users and roles.** `/administration/users` already shows separation-of-duty
   conflicts (a passing test verifies this) — check for actual role-assignment mutation,
   not only the read view.
2. **Feature flags.** `listFeatureFlags()` exists in `platform.service.ts` — verify a
   mutation endpoint exists and is wired to the UI; add one if it does not.
3. **Retention and legal holds.** Verify retention policy display has a real action
   (not just a table), and that a legal hold can actually be placed and lifted.
4. **Voice runtime, business integrations, security and privacy.** Audit each remaining
   `/administration/*` route for read-only placeholders versus real actions.
5. **Per-domain production readiness and release administration.** Already substantially
   real per earlier passes — verify no regressions, extend only where a real gap exists.

Then finish with 2.10 — Analytics and Reports: filters, evidence drill-down,
verified-vs-inferred labelling, export controls; report definition CRUD, scheduling,
run-now, retry, lineage, delivery.

**Local stack note.** Docker became unresponsive mid-session, so the dependency stack now
runs natively: PostgreSQL 17 via Homebrew on port 15432 (socket dir `/tmp/qp-pg`, data dir
under the session scratchpad) and the provider simulator from `apps/provider-simulator/dist`.
`docker compose up` remains the documented path once the daemon is healthy.

---

## 7. External gates and the smallest unblock action

| Gate                                            | State                | Smallest unblock action                                                                                                                                                                |
| ----------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ElevenLabs production workspace and credentials | `EXTERNALLY_BLOCKED` | Supply a production API key and workspace id, then run the Administration → Voice Runtime connection flow                                                                              |
| `ELEVENLABS_CAPABILITY_MODE=live`               | Blocked              | Requires the gate above plus verified capability snapshot                                                                                                                              |
| AI provider production approval                 | Blocked by design    | `AI_DATA_REGION_UNAPPROVED`, `AI_RETENTION_UNAPPROVED` and `AI_EVALUATION_FAILED` are raised unconditionally in production so AI can never self-certify; needs recorded human approval |
| OIDC issuer for production RBAC                 | Not configured       | Provide `OIDC_ISSUER` and `OIDC_AUDIENCE`; no OIDC container exists in `docker-compose.yml`                                                                                            |
| Native language approvals                       | Empty                | Populate `NATIVE_LANGUAGE_APPROVALS` after linguistic review                                                                                                                           |

Local and CI readiness remains `EXTERNALLY_BLOCKED`. No simulator evidence is presented as production evidence.
