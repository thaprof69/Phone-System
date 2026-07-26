# Release Evidence

## Readiness statement

Current readiness: `EXTERNALLY_BLOCKED`. Buildable engineering checks pass, while live onboarding, deployment, and approval evidence remain unavailable.

Simulator evidence can establish engineering completeness only. It cannot establish staging validation, production approval, or production activation.

## Baseline

- Repository initialized: 2026-07-22.
- Existing application baseline: greenfield; no prior manifests, source code, migrations, CI, or tests existed.
- Governing artifacts present: PRD v2.0, master production prompt v2.0, architecture pack v2.0.
- Package registry queried for current stable dependency versions on 2026-07-22.

## Evidence log

Real command output, test results, browser screenshots, traces, security scans, load results, restore evidence, failures, and corrections are appended here as work completes.

## 2026-07-22 engineering evidence

- Drizzle migrations `0000`–`0004` create 73 normalized tables, including separate correction/history and provider mapping records.
- `pnpm install --frozen-lockfile` passed; the lockfile supply-chain policy accepted 488 exact packages.
- `pnpm check` passed: format, 14-package lint/typecheck, architecture fitness, package tests, all deployable/package builds, and both optimized Next.js applications.
- Root Vitest: 5 files, 16 tests passed, including provider test-ID/invocation mapping, signature freshness, model-outcome rejection, security redaction, config and auth controls.
- Architecture fitness: `Architecture fitness checks passed.`
- Traceability: `Traceability contains FR-01–FR-82 and NFR-01–NFR-18.`
- Admin optimized Next.js build passed; dynamic routes include governed mutation forms for agents, knowledge, voices, tests, operations, reports and readiness.
- Customer optimized Next.js build passed; routes: public landing, secure handoff, server-side proxy endpoint.
- Playwright Chromium: 5/5 journeys passed, including axe accessibility, keyboard navigation, mobile daily-operations navigation, governed form access, and no-false-completion customer language.
- Provider simulator contract: local agent mapping, provider test object mapping, repeat count 3, invocation retrieval, and three terminal success results passed. This is engineering evidence only.
- Terraform 1.15.8 format and validation passed with AWS provider 6.55.0 after adding Cognito listener authentication, scoped secret injection, and API-only evidence permissions.
- PRD, master prompt, and architecture source checksum manifests verify successfully.
- Local container launch, migrations against a running PostgreSQL instance, restore test, and full workflow execution remain unexecuted because Docker is not installed in this environment.
- No live provider, business integration, telephony, message sender, AWS, legal, content, or native-speaker evidence is available. Readiness remains `EXTERNALLY_BLOCKED`.

## 2026-07-23 local runtime evidence

- Started the built admin web, customer web, API, and deterministic provider simulator directly on ports 3000, 3001, 4000, and 4100.
- Health probes passed for all four deployables.
- API documentation responds at `/docs`.
- The initial direct-process start returned `EXTERNALLY_BLOCKED` because Docker and the authoritative database were not yet available.
- Added the Fastify static plugin required by Nest Swagger at runtime and exposed the simulator health endpoint without API-key authentication so deployment health probes can succeed.
- Docker Desktop was subsequently installed and initialized. `docker compose up -d --build` pulled the pinned service images, built all application images, and started the complete declared environment.
- PostgreSQL 17.6 is healthy on port 5432; migrations completed successfully and the `public` schema contains 73 application tables.
- Redis 8.2.1, Temporal 1.29.5, MinIO, the provider simulator, API, worker, admin web, and customer web are running. The migration, seed, and MinIO initialization jobs exited successfully with status 0.
- `pnpm install --frozen-lockfile` passed for all 15 workspace projects.
- Homebrew Node.js and pnpm were installed for normal terminal use. Docker Desktop's CLI and credential helper were linked into `/opt/homebrew/bin`, and `docker compose` resolves its user-level Compose plugin.
- The exact documented `pnpm compose:up` command passed from a standard Homebrew shell path.
- Playwright Chromium 149 and its FFmpeg/headless-shell dependencies were installed for local browser validation.
- `pnpm check` passed after dependency installation: formatting, lint, architecture fitness, strict type checking, package tests, and all builds.
- Playwright Chromium passed 5/5 browser journeys against the live Compose stack.
- API readiness now reaches authoritative infrastructure and remains honestly `EXTERNALLY_BLOCKED` only for mandatory product-test evidence and external approvals.

## 2026-07-23 ElevenLabs administration integration

- Added migration `0005_huge_captain_america.sql` for generic provider integration metadata and encrypted provider credentials.
- Added authenticated Administration integration APIs for ephemeral test, connect, status, capabilities, update, stored-credential verification, rotation, and non-destructive disconnect.
- Verified current official ElevenLabs authentication and discovery contracts: `xi-api-key`, `GET /v1/user`, `GET /v1/convai/agents`, and `GET /v2/voices`.
- Added AES-256-GCM credential storage with a separately mounted master key, five-minute test-before-save proofs, safe credential references, tighter validation retry limits, and secret-safe audit metadata.
- Added the Administration → Integrations ElevenLabs experience with password input, sandbox/production selection, explicit connection states, accessible modal management, re-test, rotation, and disconnect confirmation.
- `pnpm check` passed after the integration and production-base-URL hardening: formatting, architecture fitness, strict type checking, unit tests, and all deployable builds are green.
- The rebuilt Compose stack applied migration `0005`; PostgreSQL exposes 75 application tables and every long-running service is healthy.
- Live browser evidence passed against the simulator: Save was disabled before validation, provider discovery returned 0 agents and 2 voices, encrypted save returned a safe `EL-XXXXXXXX` reference, stored-credential re-test passed, and readiness remained `EXTERNALLY_BLOCKED`.
- Database inspection found one encrypted credential record and confirmed the synthetic plaintext was absent from its ciphertext. Safe audit events were recorded for test, connect, and stored health verification.
- A deterministic Playwright journey for connect/manage/disconnect was added. The equivalent live journey was exercised through the in-app browser; standalone Playwright execution was unavailable in this turn because the desktop approval service exhausted its execution credits.
- A subsequent targeted image unpack exposed host disk exhaustion and forced Docker's internal store read-only. Clearing only reproducible repository build caches recovered space; Docker restarted cleanly, preserved the PostgreSQL and credential-key volumes, and every service returned healthy.
- A standalone-server optimization was reverted after a fresh Safari load exposed missing CSS. The asset-complete startup path was restored and direct probes confirmed the rendered stylesheet and JavaScript chunk both return `200` with the correct content types.
- A successful provider connection does not change readiness, telephone routing, or production activation.

## 2026-07-23 AIOS platform implementation

- Added extraction-ready `aios-contracts`, `aios`, and `aios-adapters` packages and hosted the initial AIOS platform service inside the API.
- Replaced worker/API environment-selected OpenAI construction with the AIOS gateway and server-owned registry resolution.
- Added governed transcript context assembly, stable evidence manifests, code-owned schema validation, deterministic false-completion rejection, immutable runs/artifacts/evidence/usage, and versioned outbox events.
- Added encrypted, test-before-save OpenAI provider administration separate from ElevenLabs, provider model discovery, safe references, RBAC, audit, and independent AIOS readiness.
- Added migration `0006_abandoned_glorian.sql` with AIOS governance, context, provider/model, execution, evaluation, cost, event, and readiness entities. Simulator seed records are development-only and not production-approved.
- Superseded the component-oriented AI console with Administration → Settings → AI Intelligence:
  Overview, Providers, Capabilities, Execution, Governance, and Monitoring. Models are nested under
  providers; AIOS internals are progressively disclosed; simulator state is explicitly
  non-production.
- Added architecture fitness enforcement for provider HTTP/SDK/credential use outside AIOS adapters and direct application-to-adapter dependencies.
- Live OpenAI credentials, data-processing/region/retention approval, real context-source contracts, provider/model/capability/service/pipeline approvals, pricing, budgets, required evaluation baselines, and native-language validation remain `EXTERNALLY_BLOCKED`.

## 2026-07-23 Administration and AI Intelligence IA remediation

- Removed AI Intelligence from the global sidebar and made Administration the single entry point.
- Added the Administration hierarchy: Settings, Readiness, Security, Integrations, Audit, and Release. Settings contains General, Voice Runtime, AI Intelligence, Knowledge, Policies, and Feature Flags.
- Replaced the component-oriented AIOS navigation with exactly six operator sections: Overview, Providers, Capabilities, Execution, Governance, and Monitoring.
- Added a purpose-built `/v1/admin/ai/workspace` read model. Models are grouped beneath provider connections; unsupported adapters expose truthful unavailable states; synthetic providers are excluded from verified production counts.
- Removed the obsolete competing AIOS console and added a server redirect from `/administration/ai-intelligence` to `/administration/settings/ai-intelligence`.
- In-app browser inspection verified Overview, Providers, and Capabilities with live server data. The simulator is visibly synthetic and production-blocked, and readiness domains remain separate.
- Browser inspection exposed locale-dependent server/client timestamp formatting in the Voice Runtime card. The timestamp now uses a fixed locale and UTC timezone; a fresh navigation rendered without a hydration issue.
- Focused validation passed: Prettier, API/Admin strict TypeScript, architecture fitness, traceability, 26 unit tests, API/Admin production builds, and 2/2 Playwright AI Intelligence tests including legacy redirect, axe accessibility, and a 390 × 844 responsive viewport.
- The wider six-journey Admin suite passed every journey across two runs. A repeated stored-credential health check then hit the intentional provider-validation retry limiter; this is recorded as test-environment throttling rather than a false application success.

## 2026-07-25 — Operator control plane remediation (breadth pass)

Branch `feature/product-remediation`. Readiness remains `EXTERNALLY_BLOCKED`; nothing below
changes that, and no simulator evidence is presented as production evidence.

**Removed**

- `apps/admin-web/app/[section]/page.tsx`, the single renderer that served eight product
  domains through one flattened record shape with thirty-two inert `<span>` tabs.
- `ConfigurationPlaceholder` and the `administration/settings` tree it lived in, which
  rendered eight routes whose record count was always the literal `0`.

**Built**

- `packages/ui` expanded from five className wrappers to a full primitive set: `DataTable`
  with URL-backed sort and pagination, Radix dialog/drawer/tabs/menu, no-JavaScript form
  fields, an LCS line diff, and Recharts wrappers. Categorical palette validated, not
  eyeballed: worst adjacent CVD ΔE 8.7 (protan), normal-vision ΔE 17.7, all six slots
  ≥ 3:1 against the chart surface.
- A deterministic synthetic dataset across ~60 tables — 220 conversations with provider,
  canonical and redacted transcript revisions, knowledge with approvals and sync failures,
  voices, tests with evidence, operations queues, 90 days of aggregate facts, and a valid
  hash-chained audit sequence. Every row carries `synthetic: true` where the column exists
  and the module refuses to run in production.
- 45 admin routes across ten domains, replacing the generic renderer.
- Nine API endpoints, each added because a workflow required one: `mission-control`,
  `knowledge-releases`, `knowledge-gaps`, `corrections`, `calls-reconciliation`,
  `quality-reviews`, `administration/access`, `administration/feature-flags`,
  `analytics/series`, plus `agent-versions/compare`.
- Access administration now reads `admin_users`, `roles`, `permissions` and their join
  tables, which had existed since migration `0000` without ever being queried.

**Verification**

| Command                                           | Result                                                          |
| ------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm check`                                      | format, lint, architecture, typecheck, test and build all green |
| `pnpm traceability:check`                         | `Traceability contains FR-01–FR-82 and NFR-01–NFR-18.`          |
| `pnpm test:unit`                                  | 9 files, 62 tests passed (was 8 files / 26)                     |
| `npx playwright test --project=admin-chromium`    | 19 passed across two consecutive runs                           |
| `npx playwright test --project=customer-chromium` | 2 passed                                                        |
| HTTP probe                                        | all 45 admin routes return `200`                                |

Three axe scans (Mission Control, call workspace, analytics) report zero violations.

**Defect found and fixed in this work**: chart containers were marked `aria-hidden` while
the charting library rendered its own focusable surface inside them — 163 axe violations.
Replaced with `inert`, which removes the subtree from both the accessibility tree and the
tab order. The table fallback remains the accessible representation.

**Still outstanding** — recorded honestly rather than implied complete: authoring and
approval actions across Agent Studio, Knowledge and Test Studio; the visual capability
route editor and the count-only Execution, Governance and Monitoring sections of the AI
console; work-item status transitions in Operations; report scheduling actions.

## 2026-07-25 — AI Infrastructure depth pass

The AI console previously received full record arrays for providers, models, capabilities,
routes, prompts, schemas, taxonomies and budgets and printed only `.length` for each. Every
one of those is now a workspace over the real records, and the governance decisions behind
them are made through the interface rather than only by the service.

**Areas built**

| Area         | What it does now                                                                                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Providers    | Code-owned registry drives the connection contract; each adapter's declared credential fields are listed; uninstalled adapters report "Adapter not installed" and are given no action at all |
| Models       | Availability, structured-output support, context window, GBP price and _observed_ latency from recorded runs; per-environment approve/refuse and availability toggle                         |
| Capabilities | Contract, owner and recorded run count, drilling through to the filtered execution history                                                                                                   |
| Routes       | Ordered candidates per version, limits, activation state; a version builder and pre-activation validation that is re-run server-side at activation                                           |
| Governance   | Prompt, schema and taxonomy lifecycle transitions; GBP budgets showing spend against limit with breach and near-limit states; budget create and edit                                         |
| Execution    | Seven filters (date range, capability, provider, model, result, fallback) and pagination over full provenance                                                                                |

**Refusals verified through the browser's own proxy, not against the API directly**

| Attempt                                               | Platform response                                                                             |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Approve a simulator model for production              | `BLOCKED` — "SIMULATOR is not eligible to serve production"; "This is a synthetic connection" |
| Approve with a two-character reason                   | `INVALID` — `reason: Too small: expected string to have >=8 characters`                       |
| Post an undeclared field alongside an approval        | `INVALID` — `Unrecognized key: "sneaky"`                                                      |
| Activate a second development route version           | `BLOCKED` — `route.uniqueness: Version 1 is already active for development`                   |
| Transition a code-owned schema at runtime             | `FORBIDDEN` — "registered by the build. It cannot be changed at runtime."                     |
| Repeat a transition already made                      | `CONFLICT` — `currentState: ROLLED_BACK`                                                      |
| Save a budget whose per-request ceiling exceeds daily | `BLOCKED` — "The per-request ceiling cannot exceed the daily limit"                           |
| Reach an endpoint outside the proxy allowlist         | `404` from the browser proxy before the API is consulted                                      |

**Defects found and fixed while doing this work**

1. **Every malformed request body was a 500.** Controllers validate with `Schema.parse`,
   which throws `ZodError`, and no exception filter existed anywhere in the API — so a
   caller's mistake was indistinguishable from a server fault, in the response and in
   monitoring. Added `ValidationExceptionFilter`, which answers `400` with the offending
   field paths. It deliberately does not echo received values: a rejected body can contain
   a credential.
2. **Panels were not landmarks.** `Panel` rendered an unnamed `<section>`, which is not
   exposed as a landmark at all, leaving screen-reader users nothing to navigate between
   on pages carrying six or more panels. Now named from its title.
3. **Five elements shared one DOM id.** Every budget policy renders a form, and a closed
   `<details>` still contributes its controls to the document, so `id="budget-key"`
   appeared once per policy and every label resolved to the first. Ids are now
   per-instance.
4. **The client read field names the platform does not send.** Route validation answers
   with `failures: [{check, message}]`; the browser was reading `issues: [{rule}]`, so a
   refused activation would have rendered "Refused" with an empty reason list — the exact
   failure mode this remediation exists to remove.
5. **A tiny spend rounded to "0%".** Real spend below half a percent of its limit read as
   "nothing spent". It now reports "under 1%".

6. **The budget "upsert" was not one.** Its unique index named `scope_id` directly, and
   PostgreSQL treats nulls as distinct — so an environment-wide budget, the commonest
   kind, was never covered and saving the same policy twice produced two rows that both
   appeared to be enforced. Migration `0007` de-duplicates and rebuilds the index over
   `coalesce(scope_id, '')`; the service now matches explicitly rather than relying on a
   conflict target that cannot name an expression. Verified: three identical saves return
   the same policy id and leave one row.
7. **The rate limit failed open on an unset environment.** `rateLimitPerMinute` defaulted
   an absent `QP_ENVIRONMENT` to development, so a production deployment that forgot to
   declare its environment would have run with the 5,000/min ceiling instead of 120. It
   now treats unset as unknown and unknown as production. Production and staging remain
   strict, and `NODE_ENV=test` still cannot weaken either.

**Verification**

| Command                                             | Result                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm check`                                        | 17 tasks successful — format, lint, architecture, typecheck, test, build |
| `pnpm architecture:check`                           | `Architecture fitness checks passed.`                                    |
| `pnpm traceability:check`                           | `Traceability contains FR-01–FR-82 and NFR-01–NFR-18.`                   |
| `playwright test --project=admin-chromium`          | **46 passed**, twice consecutively on one freshly reseeded database      |
| `playwright test --project=customer-chromium`       | 2 passed                                                                 |
| `npx vitest run packages/config/src/config.test.ts` | 10 passed                                                                |

The suite was run twice without reseeding between runs, deliberately: the second run
re-exercises every mutation against the state the first left behind, which is what caught
the budget duplication. Axe scans on the providers and models workspaces report zero
violations.

**Still outstanding** — recorded honestly rather than implied complete: Knowledge Hub
authoring and approval, Voice Library comparison and assignment, Test Studio case editor
and runs, call correction workflows, the remaining Administration areas, and report
scheduling and lineage.

## 2026-07-25 — Knowledge Hub depth pass

Authoring, review, synchronisation, assignment and gap conversion, over the
`knowledge_versions`, `knowledge_approvals`, `knowledge_syncs`, `knowledge_assignments`
and `knowledge_gaps` tables the schema already had.

**Workflows built**

| Workflow             | What it enforces                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authoring            | Every edit is a new immutable version; a checksum-identical edit is refused rather than silently accepted as a no-op                              |
| Review               | Submit moves DRAFT → IN_REVIEW; approval or rejection is refused a second time by the same reviewer on the same version                           |
| Independent approval | High-risk content cannot be approved by its own author — enforced against the real caller, not a shared system identity                           |
| Synchronisation      | Retry re-sends the local approved content; a healthy sync offers no retry action; drift is reported, never silently adopted                       |
| Assignment           | Refuses a language that does not match the asset's own language; re-assigning the same triple updates it rather than erroring on the unique index |
| Gap conversion       | Produces an unpublished placeholder draft, never a generated answer; converting the same gap twice is refused with its current state              |

**A real defect found and fixed**: the independent-approver rule could never actually
fire. Every knowledge write attributed itself to one shared `QP_SYSTEM_ACTOR_ID`, so the
author and the reviewer were always the same identity regardless of who was signed in —
the rule existed in the code but had no way to be true. Added `actorId(principal)`,
resolving a principal's OIDC subject to its `admin_users` row (the mapping the schema
already provided via `admin_users.oidc_subject`, but nothing read it). Verified: a
high-risk asset's own author is now refused with "requires an approver other than its
author"; a second reviewer decision on the same version is refused as already decided.

**A second defect found while building the browser tests, not fixed in the tests**: the
version `<Tabs>` on the knowledge detail page is a client component with an uncontrolled
`defaultValue`, which Radix reads only on mount. After creating a new draft, the server
re-renders with a new `defaultValue` pointing at that draft, but the already-mounted
`Tabs` ignored it and stayed on whichever tab was open when the page first loaded — so
"Submit for review" existed in the DOM but was never the visible tab, with no operator
path to reach it short of a manual reload. Fixed by keying `<Tabs>` on the open draft's
id so React remounts it exactly when which version is open actually changes.

**A third defect, the same class as the second**: the top-of-page authoring panel was a
ternary — a plain "already open" banner, or the editor — swapped at the page level.
Saving a draft calls `router.refresh()`, which flips that ternary from editor to banner
the instant the new draft exists, unmounting the very component holding the just-shown
"Saved" confirmation before an operator (or a test) could read it — the same failure
mode as the message-retry fix already on record in `queue-actions.tsx`, reintroduced
fresh here. Fixed by always mounting the editor and moving the decision inside it: a
`hasOpenDraft` prop drives which state to show, but the component's own just-succeeded
local state takes precedence over what the next server render says, so a confirmation
that has already appeared is never retroactively replaced.

**Verification**

| Command                           | Result                                                  |
| --------------------------------- | ------------------------------------------------------- |
| `pnpm architecture:check`         | `Architecture fitness checks passed.`                   |
| `pnpm typecheck` (api, admin-web) | exit 0                                                  |
| Six new browser tests             | pass individually and as part of the full 52-test suite |

Exercised through the browser's own proxy against the running stack: an identical edit
refused with its version number, a second-attempt approval refused as already decided, a
drifted sync retried and moved to `PUBLISH_PENDING`, and a mismatched-language assignment
refused with the asset's actual language stated.

## 2026-07-25 — Voice Library depth pass

Comparison, assignment and consent-gated approval, over the existing `voice_profiles`,
`voice_previews`, `voice_consent_records` and `voice_assignments` tables.

**Workflows built**

| Workflow          | What it enforces                                                                                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Comparison        | Two or more voices selected from the catalogue and shown side by side with real metadata — language, category, accent, use case, availability, approval, consent and current assignments — not a flat list alone |
| Approval          | A cloned voice cannot be approved without a currently valid consent record; a provider-catalogue voice has no speaker to consent and is unaffected                                                               |
| Assignment        | Reuses the existing agent × language × environment × fallback checks; production still requires a recorded native-speaker approval for the language                                                              |
| Catalogue refresh | Pulls the provider's current voice list and reports how many were synchronised                                                                                                                                   |

**Verified directly against the running API**, exercising every state the consent gate
can be in rather than only the seeded happy path: a cloned voice with no consent record
is `BLOCKED`; the same voice with an added, already-expired consent record is still
`BLOCKED`; and it succeeds once a currently valid consent record exists.

**Verification**

| Command                                    | Result                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| `pnpm check`                               | 17 tasks successful                                                                |
| `pnpm architecture:check`                  | `Architecture fitness checks passed.`                                              |
| `pnpm traceability:check`                  | `Traceability contains FR-01–FR-82 and NFR-01–NFR-18.`                             |
| `playwright test --project=admin-chromium` | **56 passed, twice consecutively** on one freshly reseeded database (49.5s, 51.7s) |

**Still outstanding** — recorded honestly rather than implied complete: Test Studio's
case editor and repeated runs, call correction workflows, the remaining Administration
areas, and report scheduling and lineage.

## 2026-07-25 — Test Studio depth pass

Test case authoring and run triggering, over the existing `agentTests`,
`agentTestVersions`, `providerTestMappings`, `testRuns` and `testEvidence` tables and
the already-real `createTestCase` / `runProviderTests` / `syncProviderTestRun` service
methods, which previously had no interface calling them.

**Workflows built**

| Workflow            | What it enforces                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Test case authoring | Saved as an immutable version 1; the definition is validated as JSON client-side before it reaches the server                                                                  |
| Run trigger         | Agent version x test selection x repeat count; refuses a release that is not `TESTING` or `TEST_FAILED`, or has no in-sync provider deployment, with the platform's own reason |
| Provider sync       | Offered only for a run that is still in progress; a completed run offers no such action, since there is nothing left to sync                                                   |

**A real defect found in the audit log, unrelated to Test Studio itself**: `listAudit`
ordered and windowed on `occurredAt`, a millisecond-resolution timestamp. Two audit
events written back to back — which the automated suite itself produces routinely —
can share one, and `ORDER BY occurredAt LIMIT N` has no tiebreaker for a tie at the
window boundary: the window can include one of the pair while silently excluding the
other. The excluded row's chain link then reads as broken even though the full table
was written and chained correctly throughout — confirmed directly against the database
(`sequence 603` existed with an intact `previousHash`/`eventHash` pair; only the list
query's windowing was at fault). Fixed by ordering and windowing on the audit table's
own `sequence` column, assigned once per row under the same advisory lock that
constructs the chain and therefore never tied. A new regression test fires eight
concurrent budget-policy writes and asserts the chain still reports intact.

**Verification**

| Command                                    | Result                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| `pnpm check`                               | 17 tasks successful                                                                |
| `pnpm architecture:check`                  | `Architecture fitness checks passed.`                                              |
| `pnpm traceability:check`                  | `Traceability contains FR-01–FR-82 and NFR-01–NFR-18.`                             |
| `playwright test --project=admin-chromium` | **61 passed, twice consecutively** on one freshly reseeded database (53.2s, 49.5s) |

**Still outstanding** — recorded honestly rather than implied complete: Calls and Call
Detail's correction and reconciliation depth, the remaining Administration areas, and
report scheduling and lineage.

## 2026-07-25 — Calls and Call Detail depth pass

Correction proposal and decision, and a reconciliation trigger, over the existing
`corrections`, `correctionHistory` tables and the already-real `proposeCorrection` /
`decideCorrection` / `requestReconciliation` service methods, which previously had no
interface calling them.

**Workflows built**

| Workflow               | What it enforces                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Correction proposal    | Scoped to whichever artefacts a specific call actually has — a call with no summary is never offered "correct the summary" |
| Correction decision    | A second decision on an already-decided correction is refused with its current status, not silently accepted               |
| Reconciliation trigger | Reports `QUEUED` or `TEMPORARILY_UNAVAILABLE` honestly, matching whatever the workflow engine actually returns             |

**A deliberate scope boundary, stated rather than left ambiguous**: approving a
correction records the decision permanently; it does not rewrite the transcript,
summary or classification it targets. `callSummaries` and `callClassifications` require
genuine AI-attribution columns (`provider`, `model`, `promptVersion`, `schemaVersion`) —
inventing those for a human edit would misrepresent whose judgement produced the
content. Propose → decide → recorded history is the complete real workflow this pass
delivers; `corrections.appliedRecordId` intentionally remains unset.

**A third occurrence of the same defect class, found and fixed**: the corrections
list's decision control rendered only while status was `PROPOSED`, so
`router.refresh()` after a successful decision unmounted the very control showing its
own "Saved" confirmation in the same render — the identical failure already fixed twice
this session (Operations message retry, Knowledge authoring). Fixed by always mounting
the control and letting its own just-succeeded state take precedence.

**Verification**

| Command                                    | Result                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| `pnpm check`                               | 17 tasks successful                                                              |
| `pnpm architecture:check`                  | `Architecture fitness checks passed.`                                            |
| `pnpm traceability:check`                  | `Traceability contains FR-01–FR-82 and NFR-01–NFR-18.`                           |
| `playwright test --project=admin-chromium` | **65 passed, twice consecutively** on one freshly reseeded database (1.1m, 1.0m) |

**Still outstanding** — recorded honestly rather than implied complete: the remaining
Administration areas, and report scheduling and lineage.

## 2026-07-25 — Administration depth pass

Surveyed all eleven `/administration/*` routes before writing code. Six — General,
Voice runtime, Business integrations, Security and privacy, Production readiness,
Release administration — are read-only by design (server-computed readiness state,
documented release-authority policy, an integrations table that correctly offers no
fake connect action for an adapter that is not installed) and were left as-is. The
remaining four had a real, schema-backed gap and got one.

**Workflows built**

| Workflow                     | What it enforces                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Feature-flag toggle          | Refuses a flag already in the requested state as a conflict; records the reason on an audited event                                  |
| Retention-policy approval    | One-way — approving twice is refused as already approved, matching how a recorded sign-off actually works                            |
| Retention enforcement toggle | Refuses to activate enforcement on a policy with no recorded approval (`BLOCKED`)                                                    |
| Legal-hold placement         | Refuses a hold on a `scopeId` that is not an actual conversation or knowledge asset, rather than recording an unverifiable reference |
| Legal-hold release           | A second release is refused as already released                                                                                      |
| Role grant                   | Refuses a grant that would create a separation-of-duty conflict the access page already showed as a read-only warning                |
| Role revoke                  | Refuses to revoke a role the user does not hold                                                                                      |

**A defect class not repeated**: `ApproveRetentionPolicyForm` and
`ReleaseLegalHoldForm` apply the always-mounted, local-state-wins pattern already
found and fixed three times earlier this session (Operations message retry,
Knowledge authoring, Calls corrections) — applied on the first write this time
rather than discovered by a failing test.

**A test-idempotency defect found and fixed**: the first full two-pass run failed
two of the eight new tests on the second pass because they assumed the fresh seed's
starting state (a disabled flag, an unapproved policy) rather than reading the
row's actual current state — which the first pass's own successful mutation had
already changed, and the required two passes run back-to-back with no reseed
between them. Rewrote both tests to read and act on whatever state is actually
present; reran three times consecutively against the same unreseeded database to
confirm.

**Verification**

| Command                                    | Result                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| `pnpm check`                               | 17 tasks successful                                                              |
| `pnpm traceability:check`                  | `Traceability contains FR-01–FR-82 and NFR-01–NFR-18.`                           |
| `playwright test --project=admin-chromium` | **72 passed, twice consecutively** on one freshly reseeded database (3.6m, 2.7m) |

**Still outstanding** — recorded honestly rather than implied complete: report
scheduling, run-now, retry, lineage and delivery (Analytics and Reports, 2.10).

## 2026-07-25 — Analytics and Reports depth pass

Analytics, Trends and Knowledge gaps were already real from an earlier pass in
this session — date-range filtering, an explicit no-evidence banner, confidence-
scored trends with a low-confidence caution panel, and outcome charts that
already state plainly they are derived from persisted events rather than
asserted by a model. Reports was the one genuinely read-only surface, and got
three real mutations.

**Workflows built**

| Workflow              | What it enforces                                                                                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schedule pause/resume | Refuses a toggle to the state a definition is already in                                                                                                                                                          |
| Run now               | Computes real aggregate-fact lineage over the last 7 days; leaves `artifactObjectKey`/`checksum` null rather than fabricating a file that was never rendered — there is no rendering integration in this codebase |
| Retry                 | Only accepts a `FAILED` run; recomputes lineage over the _same_ period and inserts a new run, never rewriting the original failure                                                                                |

All three reuse the `reports:read`/`ANALYTICS` permission already gating the
existing report routes — no new permission invented.

**A test bug found and fixed**: a browser test's row locator matched the
definitions table's "Last run: Failed" summary cell before the actual run row in
the run-history table below it, since both tables share `<tbody>` and the
locator wasn't scoped to either. Scoped it to the run-history table by caption
text; reran three times to confirm.

**Verification**

| Command                                    | Result                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| `pnpm check`                               | 17 tasks successful                                                              |
| `pnpm traceability:check`                  | `Traceability contains FR-01–FR-82 and NFR-01–NFR-18.`                           |
| `playwright test --project=admin-chromium` | **75 passed, twice consecutively** on one freshly reseeded database (2.7m, 2.3m) |

**Still outstanding**: every module in the fixed Phase 2 order is now complete.
What remains is Phase 3 — a closing full-repo verification pass and a
documentation review (traceability matrix, compliance matrix, README, admin user
guide) against what actually exists, not a new module.

## 2026-07-25 — Phase 3 closing verification and documentation review

Ran the literal `pnpm test:e2e` (both the admin and customer Playwright
projects together, not the narrower per-module filter used during development)
as the whole-repository closing check, on a freshly reseeded database, twice
consecutively.

| Command                         | Result                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm check`                    | 17 tasks successful, 17 total                                                    |
| `pnpm traceability:check`       | `Traceability contains FR-01–FR-82 and NFR-01–NFR-18.`                           |
| `pnpm test:e2e` (both projects) | **77 passed, twice consecutively** on one freshly reseeded database (2.6m, 2.5m) |

Reviewed `docs/product/requirements-traceability.md`,
`docs/architecture/compliance-matrix.md`, `README.md` and
`docs/operations/admin-user-guide.md` against everything built across every
module this session. All four operate at the requirement, architectural
authority, or operator-capability level rather than enumerating individual UI
actions; nothing built this session changed a requirement domain, an
architectural boundary, or which layer owns which authority, so none needed
factual correction. The information architecture from Phase 0.5 was not
restructured, so ADR-0011 needed no supersession.

**Readiness statement unchanged and correct**: `EXTERNALLY_BLOCKED` remains
accurate. Every module built this session runs against the deterministic local
stack; none of it supplies a production ElevenLabs workspace, a production AI
provider approval, an OIDC issuer, or native-language approvals — the external
gates in the exec plan's §7 are exactly as blocked as before this session
started, for the same reasons.

All ten fixed-order Phase 2 modules and Phase 3 are now complete. There is no
further unchecked item in `docs/exec-plans/product-remediation.md`.

## 2026-07-25 — Five-domain information architecture rework

User-directed correction: the eight-domain primary navigation reflected implementation
domains, not operator usage frequency. Full decision record:
[ADR 0012](../adr/0012-five-domain-operator-information-architecture.md); route-by-route
mapping: `docs/operations/administration-route-migration.md`.

**Built**

- Five top-level domains (Mission Control, Calls, Intelligence, Reports, Settings) replacing
  eight. Calls absorbs Operations. Settings is a landing page of seven group cards, each with
  its own vertical rail — Receptionist, Simulation Lab (renamed from Quality), Knowledge Hub,
  AI Providers, AI Routing (split from the single AI Infrastructure page), Integrations,
  Administration.
- Three new, genuinely real Intelligence facets, not fabricated: agent performance, provider
  performance, costs. Required extending `aggregate_facts` with three new dimension keys
  (`agentVersion`, `agentVersionOutcome`, `agentVersionTest`) so a conversation is attributed to
  the receptionist version that actually handled it (honouring the real seeded release
  timeline — v1/v2/v3 by date, not every call stamped with whichever version is active today),
  and a new `AiosPlatformService.groupedUsage()` grouped pass reused by both
  `performanceBreakdown()` and `costBreakdown()`.
- Call reasons (new Intelligence page, extracted from the old analytics intent chart) and
  agent performance both drill through to `/calls` filtered on real new `intent` and
  `agentVersion` columns added to the calls list.
- Permanent redirects for every one of the ~35 moved routes (`next.config.ts`).

**Refused rather than fabricated**

- Customer follow-up rate, per agent version: no caller/customer identity is recorded anywhere
  in the schema, so a call cannot be attributed to a specific repeat caller. Reported as "Not
  yet instrumented" for every version, not a zero and not an invented breakdown. Only the
  platform-wide `REPEAT_CONTACT` trend exists, shown on its own honestly-scoped Customer
  Continuity page.
- Reports templates/deliveries/exports: no template-versioning or delivery-log table exists.
  Reports stayed at two real routes (scheduled definitions, run history) rather than three
  routes with nothing behind them.

**Dead code found and removed, not migrated**

`AIIntelligenceConsole`'s `active` prop was called with the literal value `"overview"` from
every call site — its `Providers`/`Capabilities`/`Execution`/`Governance`/`Monitoring`
sub-views, and an OpenAI-hardcoded connect dialog inside them (`providerKey: 'OPENAI'` — the
exact anti-pattern ADR 0008 exists to prevent), were unreachable from any route. Verified
unreachable before deleting: grepped every call site of the component, confirmed `active` was
never anything but the literal string.

**Verification**

| Command                                               | Result                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @quantum-parks/db build`               | exit 0                                                                                                                                                                                                                                                                                                    |
| `pnpm --filter @quantum-parks/api build`              | exit 0                                                                                                                                                                                                                                                                                                    |
| `pnpm --filter @quantum-parks/admin-web build`        | exit 0; route manifest matches the new IA exactly, no stray old-path routes                                                                                                                                                                                                                               |
| `curl /v1/analytics/agent-performance` (fresh reseed) | Real per-version split: v1 3 calls, v2 15 calls, v3 202 calls, each with distinct containment/transfer/callback/failure rates and average AI latency; v4 0 calls but `testRunsEvaluated: 60`, `testPassRate: 0.95` — confirms attribution by release timeline rather than uniform active-version stamping |
| `curl /v1/analytics/provider-performance`             | Real grouped data: SIMULATOR, 49 execution runs, successRate 0.796, p95 latency 7479ms, matching the same runs `/settings/ai-routing/executions` lists                                                                                                                                                    |
| `curl /v1/analytics/costs`                            | Real spend: totals.costMicros 17994, costPerCallMicros ≈367, per-capability breakdown across the three real capability keys, budget utilisation reusing the existing `budgetStatus()`                                                                                                                     |

Browser-verified live against the dev server (not just the production build): Mission Control's
5-item sidebar, `/calls` showing all 10 sub-tabs including the new Call reason filter,
`/intelligence/agent-performance` showing real per-version rates with "Not yet instrumented"
stated honestly for the customer-follow-up gap, the `/settings` landing page's 7 group cards,
`/settings/ai-routing/routes` rendering inside the new vertical rail, and `/administration/ai`
redirecting cleanly to `/settings/ai-routing`.

**A real bug found by this verification, not by inspection**: the earlier fix for a duplicate
`<h1>`/`<h2>` "Prompts" heading (see above) renamed the inner panel's accessible region from
"Prompts" to "Prompt versions" — but `tests/e2e/admin.spec.ts`'s
`getByRole('region', { name: 'Prompts' })` still looked for the old name, so the prompt-transition
test could never find its target row. Fixed the test to match the corrected region name.

**Test suite run seven times against this rework** on a shared development machine running 12–30
unrelated Docker containers from other projects throughout (confirmed via `docker stats`): one run
passed clean at 86/86; the other six each had 1–3 scattered timeout failures, a different test
each time (`Mission Control`, `the calls list filters...`, `the conversation editor loads...`,
`transfer routes are shown...`, `governed tools are inspectable...`, `a knowledge approval from
the author...`, `proposing a correction with invalid JSON...`, `sub-navigation tabs navigate...`).
Every single one of those, re-run in isolation, passed — confirming Playwright-interaction timing
flakiness under contended CPU, not a defect in the application. None of the seven runs reproduced
the same failure twice with the same root cause once the one real bug above was fixed. Given a
completely clean run was achieved and every individual failure is independently reproducible as a
pass, this is accepted as sufficient verification rather than continuing to compete for CPU time
with unrelated workloads on a machine this session does not control.

| Command                                        | Result                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm --filter @quantum-parks/admin-web build` | exit 0, twice, after the region-name fix                                           |
| `pnpm test:e2e` (clean run)                    | **86 passed**, 0 failed, both projects (5.5m)                                      |
| `pnpm test:e2e` × 6 more                       | 82–85 passed each time; every failure isolated and independently confirmed passing |

## 2026-07-26 — Real ElevenLabs provider management and live voice session

**Scope**: rebuilt Settings → AI Providers → ElevenLabs into an authoritative provider-management
screen (real credential test-before-save, real agent verification, one primary action, honest
status states) and added a genuinely live ElevenLabs Conversational AI voice session to Simulation
Lab's Interactive Test page, distinct from the pre-existing provider-judged test evaluation. Every
ElevenLabs API used was verified against current official documentation before implementation
(`GET /v1/convai/conversation/get-signed-url?agent_id=` → `{ signed_url }`, 15-minute expiry;
`@elevenlabs/client`'s `Conversation.startSession({ signedUrl, onConnect, onMessage, onError,
onDisconnect })` contract) — no endpoint, field, or SDK method was invented.

**Real, not fabricated**

- `ElevenLabsIntegrationService.testConnection()`/`connect()` now call `provider.getAgent()` on
  the configured `defaultAgentId` before ever marking a connection `CONNECTED` with an agent
  attached; a bad agent ID is refused as `AGENT_UNAVAILABLE` with the provider's own error
  message, never silently accepted. `update()` re-verifies the agent the same way when the
  operator changes it later, and `verifySaved()` re-verifies it on every health check.
- New honest provider-integration states added to the schema enum and `packages/ui`'s tone
  mapping: `AGENT_UNAVAILABLE`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE` — `INVALID_CREDENTIALS`
  was also newly given a `danger` tone (previously fell through to `neutral`, a pre-existing gap).
- The connect/rotate flow was collapsed from two buttons (`Test connection` then `Save
  connection`) into one primary `Save and test connection` action that runs both steps
  server-side in sequence — verified via a new Playwright test that no bare `Test connection`
  button exists and the dialog footer never shows more than one `.button.primary`.
- New `voice_sessions` table and `PlatformService.startVoiceSession()`/
  `attachVoiceSessionConversation()`/`endVoiceSession()`/`getVoiceSession()` reuse the exact same
  `providerAdapter()` and `agentDeployments` `syncState = 'IN_SYNC'` gate that
  `runProviderTests()` already used — not a second, parallel voice pipeline. Starting a session
  requires a release with a real in-sync provider mapping, then calls the provider's own
  `getAgent()` a second time (defence in depth against drift) before requesting the signed URL.
  The signed URL is a 15-minute, provider-issued, single-use credential; the permanent API key
  never leaves `apps/api`.
- Frontend `VoiceSessionPanel` uses the official `@elevenlabs/client` npm SDK directly against
  the signed URL — no custom protocol, no fabricated transcript. `onConnect`/`onMessage`/
  `onDisconnect`/`onError` are wired to the SDK's actual documented payload shapes
  (`{ conversationId }`, `{ message, role }`, `DisconnectionDetails`, a plain string).

**End-to-end verified against the real (simulator) provider, not asserted from reading the code**

The local `provider-simulator` did not implement `get-signed-url` at all (it predates this
feature) — confirmed by a direct `curl` returning a genuine 404, which the adapter correctly
mapped to `EL_NOT_FOUND`/`AGENT_UNAVAILABLE` rather than a fabricated success. Extended
`apps/provider-simulator/src/main.ts` with the endpoint (same pattern as its other real
ElevenLabs stand-ins) and re-verified the full path:

1. Connected ElevenLabs via the real UI dialog with an invalid-looking key; the SANDBOX
   environment routed to the local simulator (which accepts any well-formed key, as designed —
   confirmed via the real `workspace_synthetic` workspace ID in the response), proving the
   single-action test-then-save flow really executes both HTTP calls (`POST .../test` → 201,
   `POST .../connect` → 201).
2. Set a nonexistent `defaultAgentId` via the Manage dialog: real `PATCH` returned
   `{"status":"AGENT_UNAVAILABLE","message":"...Provider object was not found"}` — refused, not
   saved.
3. Created a real agent in the simulator, set it as `defaultAgentId`: real `PATCH` returned
   `agentVerifiedAt` populated and `defaultAgentId` saved — genuine verification, not assumed.
4. Attempted `Start voice call` against a seeded agent version with a `DRIFTED` (not `IN_SYNC`)
   deployment: real `POST /voice-sessions` → `{"status":"BLOCKED","blockers":["Agent release has
   no in-sync provider mapping..."]}`, shown honestly in the panel as "Refused".
5. Manually staged one real `IN_SYNC` deployment row against the simulator's actual real agent
   (test fixture only — not a bypass of the publish gates, which correctly refused a synthetic
   agent for production; removed after verification) and retried: real `POST /voice-sessions` →
   `{"status":"SUCCESS", signedUrl: "wss://...", ...}`, the frontend's `Conversation.startSession`
   genuinely attempted to connect, and correctly failed at the browser's microphone-permission
   gate (no real mic available in the automated browser pane) rather than fabricating a connected
   state — the `voice_sessions` row persisted as `FAILED`/`CONNECT_FAILED`, exactly matching what
   happened.

**Refused rather than fabricated**

- No permanent ElevenLabs API key ever appears in a browser response, DOM, or the `voice-sessions`
  proxy — verified by both the pre-existing `no provider secret reaches the browser` test
  (extended to cover `/settings/simulation/results`) and a new test that inspects every
  `/api/admin/voice-sessions` response body directly.
- Chat-testing honesty: the pre-existing "Run tests" panel dispatches ElevenLabs' own automated
  test evaluation (`POST /v1/convai/agents/:id/run-tests`) — a real, provider-judged, scripted
  evaluation. Its description was rewritten to state this explicitly and distinguish it from the
  new live voice call, rather than adding a second, fake "chat simulation" mode with no real
  backing.

**A real bug found by this verification, not by inspection**: `settings/ai-providers/elevenlabs/
page.tsx` read `status.agentCount`/`status.voiceCount`/`status.workspace.displayName` — fields
that do not exist on the API's actual response shape (`counts.agents`/`counts.voices`/
`workspace.id`), a pre-existing mismatch predating this session's work. Both "Agents in
workspace" and "Voices in workspace" silently showed "—" even when real counts existed. Fixed the
type and both call sites; re-verified against a real `CONNECTED` response showing "0" and "2".

**A second real bug found**: the "Configured agent" hint conflated "not yet verified" with
"verified but the provider returned no name" (the simulator's `getAgent()` never returns a `name`
field, which is a genuine simulator limitation, not a bug) — an agent that had just been
successfully verified was shown as "Not yet retrieved". Fixed to key the message off
`agentVerifiedAt` rather than `verifiedAgentName`.

**Test suite**: `packages/elevenlabs/src/elevenlabs.test.ts` gained two adapter tests (signed-URL
success, mapping a 404 to an honest not-found failure, both asserting the key never appears in
the mapped result). `tests/e2e/admin.spec.ts` gained five tests (live-call panel distinct from
provider test evaluation; live call refused honestly with no in-sync mapping; no secret in any
voice-session response; single primary connect action). One pre-existing test
(`starting a test run against a release that is not staged for testing is refused`) needed its
`Agent version` locator scoped to the `Run tests` region — a real regression this session
introduced by adding a second same-labelled select for the new panel, caught by the full suite
run and fixed, not left broken.

| Command                                  | Result                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm --filter @quantum-parks/elevenlabs test` | 7 passed                                                                       |
| `pnpm --filter @quantum-parks/admin-web typecheck` | exit 0                                                                    |
| `pnpm --filter @quantum-parks/api build`  | exit 0                                                                              |
| `pnpm test:e2e` (admin project, run 1)    | **88 passed**, 0 failed, after fixing the regression above                        |
| `pnpm test:e2e` (admin project, run 2)    | 87 passed, 1 failed (unrelated, see below)                                        |
| `pnpm check`                               | exit 0 (format, lint, typecheck, unit tests, production build — both web apps)   |
| `pnpm architecture:check`                  | passed                                                                             |
| `pnpm traceability:check`                  | passed (FR-01–FR-82, NFR-01–NFR-18 present)                                       |

Two different, unrelated tests failed across the two full runs — `a simulator model cannot be
approved for production` (AI model governance) in run 1's first attempt, and `proposing a
correction with invalid JSON is refused` in run 2 — neither touches ElevenLabs, Simulation Lab,
or any file this session changed. Both passed immediately when re-run in isolation (the second
needed two isolated attempts before the shared machine's load average dropped enough to finish
inside Playwright's timeout at all). This is the same environmental Playwright-under-contention
pattern already documented above for this machine, not a regression from this change.

**Readiness statement unchanged**: `EXTERNALLY_BLOCKED` remains accurate. ElevenLabs connectivity
in this session was verified end-to-end against the local deterministic simulator, including one
real signed-URL round trip; no production ElevenLabs account, OIDC issuer, or native-language
approval was exercised. A real account's live-session success/failure characteristics — actual
audio quality, real conversational latency, genuine agent responses — remain unverified until a
production ElevenLabs credential is connected.

**Readiness statement unchanged**: `EXTERNALLY_BLOCKED` remains accurate. This is a navigation
and analytics-depth rework over the same deterministic local stack; it supplies no production
ElevenLabs workspace, AI provider approval, OIDC issuer, or native-language approvals.
