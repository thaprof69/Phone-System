# Release Evidence

## Knowledge Hub AI Copilot and document understanding

- Direct-entry enhancements execute only through the configured `AI_COPILOT` route and remain operator-applied drafts.
- Uploaded PDF, DOCX, XLSX/CSV, Markdown and text files are extracted locally; extracted source is bounded to 80,000 characters and sent through the configured `KNOWLEDGE_HUB` route.
- AI document analysis is schema validated. Every displayed evidence quote must be an exact substring of extracted source text.
- No Copilot suggestion or document analysis creates, approves, publishes or synchronises knowledge automatically.
- URL crawling remains unconnected and reports that state without creating a synthetic ingestion item.
- Verification evidence: API and admin unit tests, strict typecheck, focused Playwright desktop/mobile/accessibility journey, traceability check and production build.

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

## 2026-07-27 — Live ElevenLabs provider onboarding and receptionist bootstrap

The runtime provider path now targets `https://api.elevenlabs.io` only. The deterministic provider
simulator is excluded from the normal Compose stack and retained under the `test` profile. Saving a
verified provider now encrypts the credential, verifies the selected agent, projects the approved
active receptionist configuration into ElevenLabs' `conversation_config` DTO, PATCHes the existing
agent, reads it back, and records `IN_SYNC` only when the projected checksums match. Simulation uses
the exact mapped agent-version id instead of the first version returned by the agent list.

| Evidence                         | Result                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Production provider verification | Credential accepted; configured agent resolved as `Quantum`                                                                             |
| Provider mapping                 | Active release mapped to the configured production agent; `IN_SYNC`; local and remote checksums match                                   |
| Live session bootstrap           | Production WebRTC voice session created with a real ElevenLabs conversation id; permanent API key remained server-side                  |
| Runtime topology                 | API, admin web, and worker healthy; provider simulator container removed from the normal stack                                          |
| `pnpm typecheck`                 | 17/17 packages passed                                                                                                                   |
| Production Docker build          | 17/17 package builds passed and the stack restarted healthy                                                                             |
| Focused Vitest                   | 3 files, 36 tests passed in a disposable writable Node 24 runtime container                                                             |
| Traceability checker             | Passed: FR-01–FR-82 and NFR-01–NFR-18 present                                                                                           |
| Architecture checker             | Ran in Node 24; failed on two pre-existing, unrelated direct AIOS-adapter imports in the intelligence-models controller/routing service |
| Browser media                    | Bootstrap succeeded; final audio handshake awaits the operator granting microphone permission                                           |

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

| Command                                            | Result                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm --filter @quantum-parks/elevenlabs test`     | 7 passed                                                                       |
| `pnpm --filter @quantum-parks/admin-web typecheck` | exit 0                                                                         |
| `pnpm --filter @quantum-parks/api build`           | exit 0                                                                         |
| `pnpm test:e2e` (admin project, run 1)             | **88 passed**, 0 failed, after fixing the regression above                     |
| `pnpm test:e2e` (admin project, run 2)             | 87 passed, 1 failed (unrelated, see below)                                     |
| `pnpm check`                                       | exit 0 (format, lint, typecheck, unit tests, production build — both web apps) |
| `pnpm architecture:check`                          | passed                                                                         |
| `pnpm traceability:check`                          | passed (FR-01–FR-82, NFR-01–NFR-18 present)                                    |

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

## 2026-07-26 Live Receptionist Test and Quantum Result evaluation pipeline

Ported Quantum Park Lite's `/settings/phone/test` operator workflow into `/settings/simulation` as
the sole primary Simulation Lab experience, replacing every fabricated piece of the source
(a voice call that never opened ElevenLabs; a keyword-matched "Quantum Result") with real
production architecture, per ADR 0013.

- Added `receptionist_sessions` (migration `0010_closed_lily_hollister.sql`) — `mode`/`purpose`/
  `source` fields, and deliberately only one result pointer (`latestAnalysisArtifactId`); no
  denormalized escalation/booking/confidence/routing/policy columns. Migration also applied three
  `provider_integration_status` enum values (`AGENT_UNAVAILABLE`/`RATE_LIMITED`/
  `PROVIDER_UNAVAILABLE`) added to the schema earlier this session but never yet migrated — found
  via a live `pg_enum` check before/after.
- Added a genuinely new AIOS capability, `INTERACTION_ANALYSIS`, with its own authored prompt,
  strict Zod/JSON schema (Interaction Evidence Pack: intent, entities, sentiment, urgency,
  requested/knowledge actions, candidate routes, risk signals, confidence, evidence IDs — no
  `recommended_route` or `proposed_action` field), service and route version, promoted to `ACTIVE`
  — not reused from `CALL_SUMMARY`, not left `DRAFT`.
- Added `ReceptionistPolicyService` and `ReceptionistRoutingService`, pure deterministic functions
  with no AI involvement, and `QuantumResultService`, which re-derives the full Quantum Result from
  the real `aiArtifacts` row and real `toolInvocations` fresh on every read — verified by reading
  a session immediately after ending it and confirming the result matches, not a cached copy.
- **Two real pre-existing bugs found while wiring this feature, not by inspection**:
  `AiosPlatformService.getSchema()`'s validator was hardcoded to only ever validate `CALL_SUMMARY`
  — every other capability silently failed schema validation regardless of correctness. And
  `aiArtifacts.confidence` was never populated for any capability's persisted result. Both fixed.
- **End-to-end verified against the real running stack** (not just typechecked): created a real
  agent via the local provider-simulator, inserted a real `agent_deployments` row
  (`syncState: 'IN_SYNC'`) as a test fixture, then via curl: started a receptionist session (real
  signed URL), attached a real provider conversation (real `providerConversations` →
  `conversations` → `transcriptRevisions` rows created), sent the `complaint` preset scenario and
  received a fully real, non-fabricated Quantum Result (`escalationStatus: "REQUIRED"`,
  `routingDecision: "ESCALATION_QUEUE"`, real `evidenceIds`, real `artifactId`), ended the session,
  then re-read it and confirmed the result re-derives identically from the persisted artifact. All
  fixture rows were deleted afterward.
- Moved the pre-existing Scenario/Test collection/Provider test run/Release check/Review QA
  console to **Settings → Advanced**, out of primary operator navigation but fully functional and
  unchanged in substance — a separation of concerns, not a deletion. Removed the now-redundant
  live-voice-call panel from the old "Interactive test" page (`voice-session-panel.tsx` deleted):
  its capability is fully superseded by the new Live Receptionist Test, and keeping both would
  have duplicated the same intelligence path. Old `/settings/simulation/{scenarios,collections,
results,release-checks,reviews}` routes redirect (308) to `/settings/advanced/*`; `/quality/*`
  legacy redirects were repointed to match.
- **A real bug found by the first full Playwright run, not by inspection**: the new "Advanced"
  Settings group's card description contained the literal phrase "Simulation Lab", so
  `getByRole('link', { name: 'Simulation Lab' })` in the mobile-navigation test resolved
  ambiguously to two cards (a real accessible-name collision an operator's screen reader would hit
  too, not just a test artifact). Fixed by rewording the description to avoid the phrase, and
  scoped the corresponding heading assertion to `level: 1` after the new page's `Panel` title
  duplicated its own `h1` as a same-text `h2`.
- **A real hydration-mismatch bug found in the browser, not by inspection**: the ported
  Instructions panel called `new Date(generatedAt).toLocaleString()` inside a client component,
  which renders differently between the server's process locale and the browser's locale — Next.js
  threw and regenerated the tree client-side on every load. Fixed by switching to
  `@quantum-parks/ui`'s `formatDateTime()`, which already uses a fixed `Intl.DateTimeFormat` locale
  for exactly this reason elsewhere in the app.
- Browser-verified live: real agent-version list, real preset scenario buttons, real generated
  instructions from `composeRuntimePrompt()`, and the honest `Refused` banner with the real
  server-stated reason (`"Agent release has no in-sync provider mapping; publish it before
starting a live call"`) when starting a session against a seeded agent version with no in-sync
  deployment — confirmed via a real network request to `/api/admin/receptionist-sessions`
  returning `201` with a `BLOCKED` body, not a client-side fabrication.

| Command                                               | Result                                                                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @quantum-parks/admin-web typecheck`    | exit 0                                                                                                                                                              |
| `pnpm --filter @quantum-parks/admin-web build`        | exit 0 (all new routes present, incl. `/settings/simulation`, `/settings/simulation/sessions`, `/settings/simulation/sessions/[sessionId]`, `/settings/advanced/*`) |
| `pnpm --filter @quantum-parks/api build`              | exit 0                                                                                                                                                              |
| `pnpm test` (all 29 packages)                         | passed                                                                                                                                                              |
| `pnpm architecture:check`                             | passed                                                                                                                                                              |
| `pnpm traceability:check`                             | passed (FR-01–FR-82, NFR-01–NFR-18 present)                                                                                                                         |
| `pnpm test:e2e` (admin project, run 1)                | 85 passed, 4 failed — one real bug (mobile-nav name collision, fixed above), three pre-existing correction-workflow flakes                                          |
| `pnpm test:e2e` (admin project, run 2, after the fix) | 87 passed, 2 failed — both the same pre-existing correction-workflow flakes                                                                                         |

The two remaining failures across both runs — `proposing a correction with invalid JSON is
refused` and `a proposed correction can be decided, and a second decision is refused as already
decided` — are the same class of shared-machine Playwright-under-contention flake already
documented earlier in this file (a button that stays disabled under load until the retry budget is
exhausted). Neither touches Simulation Lab, ElevenLabs, or any file this session changed; both
passed when re-run individually in isolation except the JSON one, which needed the machine's load
average to drop before its 120s timeout could complete — consistent with, not a regression from,
the documented pattern.

**Readiness statement unchanged**: `EXTERNALLY_BLOCKED` remains accurate. The full Live
Receptionist Test pipeline was verified end-to-end against the local deterministic simulator and
fixture data; no production ElevenLabs agent, OIDC issuer, or native-language approval was
exercised.

## 2026-07-26 — Dual-transport ElevenLabs voice sessions, honest diagnostics, Conversation Lifecycle authority

Ported the second half of Quantum Park Lite's phone workflow — the Provider configuration screen
— replacing its entirely fake diagnostics (its own source comment: _"Live ElevenLabs lookup is
not enabled for this local diagnostic run"_) and its unbacked "Voice Mode" field with real
infrastructure, per ADR 0014. Confirmed via ElevenLabs' own docs that a genuine second transport
(WebRTC, via `GET /v1/convai/conversation/token`) exists alongside the WebSocket signed-URL flow
already in production use; built both for real rather than fake one or drop the field.

- **Real WebRTC adapter method**: `getConversationToken()` added to `HttpElevenLabsAdapter`,
  mirroring `getSignedConversationUrl()`'s exact request/mapping pattern. A matching deterministic
  stub was added to the local provider simulator so dev/CI needs zero real ElevenLabs credentials.
- **Schema**: `providerIntegrations.voiceMode` (new integrations default `WEBRTC_PREFERRED` at the
  application layer; the DB column default `WEBSOCKET_ONLY` only ever backfills pre-existing
  rows); new `elevenlabs_diagnostic_runs` and `elevenlabs_media_verifications` tables; `voiceSessions`
  gained `transport`, `receptionistSessionId`, `replacesVoiceSessionId`, `failureCategory`, and a
  renamed `sessionExpiresAt` (replacing the WebSocket-only `signedUrlExpiresAt`). Migration
  `0011_past_tyger_tiger.sql` applied cleanly against the empty `voice_sessions` table.
- **Dual-transport bootstrap**: `platform.service.ts`'s `startVoiceSession()` now returns a
  discriminated union on `transport`. **Scope decision, documented in the ADR**: no server-side
  WebRTC→WebSocket retry — a token-endpoint failure and a signed-url-endpoint failure share the
  same auth/agent-availability failure surface, so the only real fallback need (a browser-side
  WebRTC/ICE/media failure after a token was already issued) is handled entirely client-side.
- **Fallback stays inside one `ReceptionistSession`**: `ConversationLifecycleService.
retryWithFallbackTransport()` marks the failed WebRTC `voiceSessions` row `FAILED` with its
  failure category before starting a replacement WebSocket row chained via
  `replacesVoiceSessionId`, then moves the session's active-runtime pointer. Exactly one
  `ReceptionistSession`, one transcript, one Recent Sessions entry throughout — verified by direct
  code review of the chaining logic (a live browser test of an actual WebRTC failure requires a
  real in-sync agent deployment, which the seeded development data does not have — the same
  externally-blocked limitation already documented for live voice sessions).
- **Honest diagnostics, not a single fabricated green light**: `runDiagnostics()` keeps the
  source's 8 checks (each a real round trip — `agent_found` really calls `getAgent()`,
  `webrtc_available`/`websocket_fallback` each really request a token/signed-URL, `turn_timeout` is
  a permanent honest WARNING since ElevenLabs genuinely doesn't expose it) plus a 9th,
  `fallback_policy_enabled`, shown only in WebRTC-preferred mode and explicitly labeled
  "verified, not exercised." Critically, a passing bootstrap check is labeled reachability-only —
  the diagnostics panel shows a **separate** "media session" fact per transport, sourced from
  `elevenlabs_media_verifications` and starting at `NOT_VERIFIED` until a real Simulation Lab
  voice session actually connects and exchanges audio.
- **Conversation Lifecycle authority**: new `ConversationLifecycleService` is now the single
  orchestration authority for the Simulation Lab pipeline (start/attach/record-turn/retry-transport/
  end), publishing lifecycle events through the existing `outbox_events` table (same direct-insert
  pattern already used by `aios-platform.service.ts` — no new event-bus abstraction).
  `receptionist-session.service.ts` was reduced to read-only methods. **Explicit non-goal**: zero
  event consumers were built — Mission Control, Reports, Intelligence and Knowledge Gap discovery
  are unchanged. This is documented in ADR 0014 precisely so it isn't mistaken for an oversight.
- **Frontend rebuild**: the ElevenLabs provider page moved from a `<dialog>`-modal editor to a
  direct inline form (matching the source's un-gated UX), reusing `@quantum-parks/ui`'s
  `Fieldset`/`TextField`/`SelectField`/`CheckboxField` rather than hand-styled dialog CSS. New
  Diagnostics panel + `/settings/ai-providers/elevenlabs/diagnostics` history page. Simulation Lab
  gained a compact provider-readiness summary (connected? diagnostics status+age? agent verified?)
  and a "Configure ElevenLabs" link, sourced from existing status endpoints — not a second
  BLOCKED-computation; the real session-start readiness gate remains solely in `startVoiceSession`.

**Tests**: new adapter test pair for `getConversationToken` (real request shape, key-never-leaked,
404→honest-failure mapping) alongside the existing signed-url pair. New
`elevenlabs-integration.service.test.ts` — `buildDiagnosticChecks()` was extracted as a pure
function (no DB/adapter dependency, matching this codebase's existing convention of only
unit-testing DB-independent logic) and directly tested: `agent_found` never passes on a bare
config-presence check, `llm_configured`/`first_message_configured` never treat a local override as
a provider-verified fact, WebRTC/WebSocket bootstrap checks are independent, a passing bootstrap is
worded as reachability-only, `turn_timeout` is permanently a WARNING, and the overall status can
never be a fabricated `PASS` while `turn_timeout` exists. Playwright gained: the provider form is a
direct inline form with no dialog and exactly one primary save action; running diagnostics reports
an honest result with independent bootstrap/media-session facts; the Simulation Lab readiness
summary and "Configure ElevenLabs" link; the diagnostics history page.

| Command                                                     | Result                                    |
| ----------------------------------------------------------- | ----------------------------------------- |
| `pnpm --filter @quantum-parks/db generate` + review         | Clean migration, reviewed before applying |
| `pnpm --filter @quantum-parks/elevenlabs test`              | 9 passed                                  |
| `pnpm --filter @quantum-parks/api test`                     | 12 passed (2 test files)                  |
| `pnpm build` (full monorepo)                                | exit 0, all 17 tasks                      |
| `pnpm --filter @quantum-parks/admin-web typecheck`          | exit 0                                    |
| `pnpm architecture:check`                                   | passed                                    |
| `pnpm test:e2e` (admin project, targeted new/changed tests) | 6 passed                                  |
| `pnpm test:e2e` (admin project, full suite)                 | 91 passed, 1 failed                       |

The one failure — `a failed report run can be retried without altering the original failure` —
is in the Reports domain, which this task did not touch at all (no file under
`apps/api/src/services/*report*` or `apps/admin-web/app/reports/**` was changed). The database
genuinely has exactly one `FAILED` report run row; the test's `/reports/history` table appears to
not surface it on the default page/sort (a pagination/fixture-visibility issue, not a functional
regression), reproduced consistently in isolation and unrelated to dual-transport, diagnostics, or
the Conversation Lifecycle work in this task.

**Real end-to-end verification against the live local stack** (direct API calls, not just
Playwright), confirming all three binding corrections genuinely hold:

1. The pre-existing dev ElevenLabs integration (created before this task) reports
   `voiceMode: WEBSOCKET_ONLY` via `GET /admin/integrations/elevenlabs/status` — the migration's DB
   column default correctly protected it; it was never silently switched to WebRTC.
2. With no agent configured, `POST /admin/integrations/elevenlabs/diagnostics` returned real,
   independent failures (`agent_found`, `webrtc_available`, `websocket_fallback` each separately
   `FAIL`, each with its own real provider error — "Provider object was not found" — not one shared
   fabricated status). A real agent was then created via the local simulator
   (`POST /v1/convai/agents/create` with a real prompt and first message) and configured as
   `defaultAgentId`; diagnostics then returned a fully genuine result — `provider_status`,
   `agent_found`, `voice_configured`, `llm_configured`, `first_message_configured`,
   `webrtc_available`, and `websocket_fallback` all real `PASS`es (each independently verified
   against the real simulator, including a real `POST`-created agent's real system prompt and
   first message), with only the permanent, honest `turn_timeout` WARNING keeping the overall
   status at `WARNING` rather than a fabricated `PASS`.
3. Immediately after that all-real-PASS diagnostics run, `GET
/admin/integrations/elevenlabs/media-verification-summary` still returned `NOT_VERIFIED` for
   both `webrtc` and `websocket` — proving the binding correction holds in practice, not just in
   the unit tests: a passing bootstrap check never flips the separately-tracked real-media-session
   fact to `PASS` on its own. That fact only ever changes from a real Simulation Lab session's
   `onConnect`/message/disconnect events reaching `POST /receptionist-sessions/:id/media-verification`.

This exercise also caught and fixed a real deployment mistake made mid-verification: the running
local API and provider-simulator processes were stale compiled builds from before this task's
backend changes (`Cannot POST .../diagnostics`, and a 404 for the new WebRTC token route even
though the exact same agent ID had just succeeded against `getAgent()`/`getSignedConversationUrl()`
moments earlier). Rebuilding and restarting both processes resolved it — a reminder that a NestJS
compiled-dist deployment (used in this session in place of `tsx watch`, which has an unrelated
pre-existing Reflector dependency-injection bug under this Node/tsx version) must be rebuilt after
every backend change, not just restarted.

## 2026-07-27 — Real post-call classification, provisional/final intelligence, finalisation pipeline registry

See ADR 0015 for the full decision record. Summary: `INTERACTION_ANALYSIS` is now invoked from the
real post-call Temporal workflow via a new `classifyInteraction` activity, writing real
`callClassifications`/`callEntities` rows; every `aiArtifacts` row now states `intelligenceState`
(`PROVISIONAL`/`FINAL`) explicitly; `aggregateConversation` is a real incremental upsert into
`aggregate_facts` with a `synthetic` composite-key column; `postCallWorkflow` now executes a
declarative `CONVERSATION_FINALISATION_PIPELINE` registry instead of a hard-coded activity chain;
Call Detail gained a real Evidence tab; report lineage gained a real classification-coverage ratio.

| Command                                             | Result                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm --filter @quantum-parks/db generate` + review | Clean migration, hand-edited for correct order and considered backfill, reviewed before applying |
| `pnpm --filter @quantum-parks/db migrate`           | Applied cleanly against the local dev database                                                   |
| `pnpm --filter @quantum-parks/aios-contracts build` | exit 0                                                                                           |
| `pnpm --filter @quantum-parks/aios build`           | exit 0                                                                                           |
| `pnpm --filter @quantum-parks/aios test`            | 3 passed                                                                                         |
| `pnpm --filter @quantum-parks/intelligence build`   | exit 0                                                                                           |
| `pnpm --filter @quantum-parks/intelligence test`    | 2 passed                                                                                         |
| `pnpm --filter @quantum-parks/workflows build`      | exit 0                                                                                           |
| `pnpm --filter @quantum-parks/workflows test`       | 8 passed (pipeline registry + `shouldHaltPipeline`)                                              |
| `pnpm --filter @quantum-parks/worker typecheck`     | exit 0                                                                                           |
| `pnpm --filter @quantum-parks/worker test`          | 8 passed (`buildAggregateRows` + `buildClassificationInsert`)                                    |
| `pnpm --filter @quantum-parks/api typecheck`        | exit 0                                                                                           |
| `pnpm --filter @quantum-parks/admin-web typecheck`  | exit 0                                                                                           |
| `pnpm -r build`                                     | exit 0, all packages including admin-web static/dynamic routes                                   |
| `pnpm -r test`                                      | all package suites passed                                                                        |

**Real end-to-end verification against a live local stack** (docker-compose `postgres`/`redis`/
`minio`/`temporal`, locally-built `dist/` for `provider-simulator`/`api`/`worker`/`admin-web` run as
plain Node processes — the same pattern used for ADR 0014's verification):

1. A non-synthetic `provider_workspaces` row was inserted directly (the only pre-existing workspace
   was the seeded synthetic one), so this run's `synthetic: false` propagation could be proven
   end-to-end rather than assumed.
2. A real ElevenLabs-shaped post-call webhook payload was constructed and signed with the real
   HMAC-SHA256 scheme (`t=<timestamp>,v0=<hex>`, matching `signWebhook`/`verifyWebhookSignature` in
   `packages/elevenlabs`) and posted to `POST /v1/webhooks/elevenlabs/post-call`.
3. The webhook was accepted (`processingQueued: true`) and the real Temporal worker picked up
   `postCallWorkflow`. Within one poll, the conversation reached `processing_state = COMPLETED`.
4. Direct database verification: a real `call_classifications` row (`primary_intent:
general_enquiry`, non-null `ai_artifact_id`, joined `ai_artifacts.intelligence_state = FINAL`,
   `result_state = SUCCESS`, `provider_key = SIMULATOR`), a real `call_outcomes` row
   (`NO_ACTION_REQUIRED`), a real `call_summaries` row with a real `ai_artifact_id`, and five real
   `aggregate_facts` rows (`total`/`intent`/`outcome`, each `synthetic: false`) — verified
   side-by-side against the 762 pre-existing rows, all `synthetic: true` after the migration's
   considered backfill (every existing row came exclusively from the seed script, confirmed by the
   original audit).
5. Call Detail's Evidence tab was browser-verified live: both real artifacts rendered with their
   real `intelligenceState: Final`, provider/model/prompt/schema-version identifiers, and (for the
   classification artifact) real confidence.
6. Regression check: the one pre-existing `PROVISIONAL` artifact (the real per-turn evidence from
   ADR 0013's manual verification) was confirmed to have survived the migration's backfill
   correctly, distinct from the 39 `FINAL` `CALL_SUMMARY` rows.

**A real, pre-existing bug was found and fixed during this verification**, unrelated to this task's
own new code: `apps/admin-web/app/calls/[id]/page.tsx` rendered `SummarySchema`'s `purpose`/
`caller_requests`/`unresolved_items` fields as plain strings; the real schema (`packages/
intelligence`, unchanged by this task) has always defined them as `{text, evidence_ids}` claim
objects. This crashed the entire Call Detail page (`Objects are not valid as a React child`) for any
conversation with a real (non-seed-fabricated) summary — never caught before because the synthetic
seed script's own summary generation used a different, non-conforming ad-hoc shape, and no real
conversation had ever reached this page in a live browser check before this task. Both were fixed:
the page now correctly extracts `.text` from each claim, and `seed-synthetic.ts` now generates the
same real `SummarySchema`-conforming shape, so seeded and real call summaries are structurally
identical going forward. The 211 already-seeded `call_summaries` rows were reshaped in place via a
direct SQL update, verified before and after.

A second local-environment-only obstacle was found and fixed: the docker-compose `minio` container
rejected the app's `ServerSideEncryption: AES256` webhook-evidence upload with `NotImplemented:
Server side encryption specified but KMS is not configured` — a pre-existing local MinIO
configuration gap (no `MINIO_KMS_SECRET_KEY`), not a regression from this task. Resolved for this
verification via a local-only `docker-compose.override.yml` setting a generated KMS key (not
committed — a throwaway verification aid, deleted after use).

**A genuine regression was found and fixed by the full Playwright suite, not just the live webhook
round trip**: `analyticsAgentPerformance()`'s default synthetic exclusion (task scope: exclude
synthetic rows from Intelligence/Reports by default) emptied `/intelligence/agent-performance`
entirely — "0 versions", "No versioned call data yet". The `agentVersion`/`agentVersionOutcome`/
`agentVersionTest` dimension keys this page reads have no real writer anywhere in the repository,
including the real `aggregateConversation` activity built in this same task — they are, and remain,
exclusively produced by the synthetic seed script. Excluding synthetic by default therefore hid the
only data this page has ever had, for no honesty gain (nothing became "more real" by hiding it).
Fixed by defaulting `analyticsAgentPerformance(includeSynthetic = true)` (the opposite default from
`analyticsSeries()`/`computeReportLineage()`, deliberately, with the reasoning in a code comment) and
threading an explicit `undefined` (not a forced `false`) through the controller when the query
param is absent, so the service's own default actually takes effect. Verified live in the browser
(agent-performance page restored: 4 versions, real containment/transfer figures) and by the e2e
suite before/after.

| Command                                                      | Result                                                                                                                                                                                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @quantum-parks/api typecheck` (after the fix) | exit 0                                                                                                                                                                                                |
| `pnpm check` (full, after the fix)                           | exit 0, all 17 tasks                                                                                                                                                                                  |
| `pnpm test:e2e --project=admin-chromium` (run 1 of 2)        | 91 passed, 1 failed (the same pre-existing, already-documented Reports-domain flake from the 2026-07-26 dual-transport evidence entry — reproduced consistently in isolation, unrelated to this task) |
| `pnpm test:e2e --project=admin-chromium` (run 2 of 2)        | 91 passed, 1 failed (identical result — stable)                                                                                                                                                       |

## 2026-07-27 — Canonical Conversation Intelligence Manifest

See ADR 0016 for the full decision record. Summary: `conversation_intelligence_manifests` is the
new canonical, per-conversation discovery/completeness index — artifacts remain the intelligence
authority, the manifest never duplicates their payloads. One new `buildConversationIntelligenceManifest`
finalisation-pipeline stage builds it after `AGGREGATE`, with zero `postCallWorkflow` code changes.
`getCall()` gained an additive `manifest` field; `computeReportLineage()` now reads manifests instead
of re-deriving the same join; Call Detail gained a "Conversation intelligence" panel. A deterministic
backfill covered all 212 completed/partial conversations (real and synthetic alike, per the user's
binding scope decision).

| Command                                               | Result                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm --filter @quantum-parks/db generate` + review   | Clean migration, hand-edited to append the deterministic backfill, reviewed before applying      |
| `pnpm --filter @quantum-parks/db migrate`             | Applied cleanly against the local dev database                                                   |
| `pnpm --filter @quantum-parks/workflows build/test`   | exit 0; 8 passed (updated stage-order/known-activity assertions)                                 |
| `pnpm --filter @quantum-parks/worker typecheck/test`  | exit 0; 19 passed (`computeManifestCompleteness`/`deriveManifestStatus`/`buildManifestWarnings`) |
| `pnpm --filter @quantum-parks/api typecheck`          | exit 0                                                                                           |
| `pnpm --filter @quantum-parks/admin-web typecheck`    | exit 0                                                                                           |
| `pnpm check` (full monorepo)                          | exit 0, all 17 tasks                                                                             |
| `pnpm architecture:check`                             | passed                                                                                           |
| `pnpm test:e2e --project=admin-chromium` (run 1 of 2) | 91 passed, 1 failed (same pre-existing Reports-domain flake)                                     |
| `pnpm test:e2e --project=admin-chromium` (run 2 of 2) | 91 passed, 1 failed (identical result — stable)                                                  |

**Backfill counts** (per the user's binding rule 10), verified directly against the dev database
after applying the migration:

| Split                                          | Result                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Total completed/partial conversations          | 212                                                                                                                                                                                                                                                                                                                                         |
| Manifests created                              | 212 (0 skipped — no current manifest existed for any of them)                                                                                                                                                                                                                                                                               |
| Real (`synthetic = false`)                     | 1, status `COMPLETE`                                                                                                                                                                                                                                                                                                                        |
| Synthetic (`synthetic = true`)                 | 211, all status `COMPLETE`                                                                                                                                                                                                                                                                                                                  |
| `PARTIAL` / `FAILED` / `INSUFFICIENT_EVIDENCE` | 0                                                                                                                                                                                                                                                                                                                                           |
| Missing required outputs                       | None — direct verification confirmed all 212 conversations already had exactly one `call_summaries`/`call_classifications`/`call_outcomes` row each, including the 16 whose `processingState` was `PARTIAL` for an unrelated historical reason (they satisfy the complete profile per rule 6, so they backfilled `COMPLETE`, not `PARTIAL`) |

**Real end-to-end verification against the live local stack** (same API/worker/Temporal/
provider-simulator stack proven in the ADR 0015 verification, rebuilt fresh for this task's code):
a second signed webhook round trip was posted for a brand-new conversation. It reached
`processing_state = PARTIAL` on the first attempt — genuinely, not a bug in this task's own code:
investigation found two real AI prompt versions (`INTERACTION_ANALYSIS`'s and
`EVIDENCE_LINKED_INTELLIGENCE`/`CALL_SUMMARY`'s) had been left in `ROLLED_BACK` state, confirmed via
`audit_events` as a side effect of the `admin.spec.ts` test "a governed prompt refuses a transition
it has already made" (`AI_PROMPT_ROLLBACK` action), which grabbed `tbody tr :first-child` on the
Prompts governance table — whichever real prompt happened to sort first — and rolled it back
destructively with no restoration. The manifest mechanism itself behaved perfectly honestly under
this real degradation: it recorded `status: PARTIAL`, `presentArtifactCount: 1`, and warnings
`["Missing call summary", "Missing call classification"]` — exactly the outcome
`deriveManifestStatus`/`buildManifestWarnings` are supposed to produce when real capabilities fail.

**This was fixed as a genuine test-isolation/governance-integrity defect, not worked around**:

1. Confirmed via the governance transition state machine (`aios-platform.service.ts`) that
   `ROLLED_BACK` has no path back to `ACTIVE` through any exposed transition (`ACTIVATE` only
   accepts `from: ['APPROVED']`) — so no "supported governance path" restoration was possible for an
   already-rolled-back version, and the real defect was that the test rolled back a real,
   production-relied-upon prompt at all.
2. Added a dedicated, disposable `E2E_GOVERNANCE_FIXTURE` prompt to `packages/db/src/seed.ts` —
   seeded `ACTIVE`, referenced by no real capability's service version — so the test always has a
   safe-to-destroy target.
3. Retargeted the test to filter on `E2E_GOVERNANCE_FIXTURE` by name instead of taking the first row
   positionally.
4. Added a "Prompt" column to the Prompts governance table (`governance-view.tsx`) and joined the
   parent prompt's `key` into `AiosPlatformService.catalogue()`'s prompts query — the rows were
   previously visually indistinguishable, which is what let the test target "whichever one sorts
   first" without anyone noticing which real prompt was at risk.
5. Restored both real prompts to `ACTIVE` — not via raw SQL, but by re-running
   `pnpm --filter @quantum-parks/db seed`, since the AIOS governance section's own
   `onConflictDoUpdate({..., set: {state: 'ACTIVE', ...}})` upserts already restore exactly this
   state on every re-seed; no ad-hoc repair statement was needed.
6. Re-ran the corrected test in isolation — passed, and confirmed both real prompts stayed `ACTIVE`
   afterward while the fixture alone moved to `ROLLED_BACK`.
7. Re-ran the full e2e suite twice (results above) — confirmed both real prompts remained `ACTIVE`
   after both runs, and a second live webhook round trip then produced a genuine
   `conversation_intelligence_manifests` row with `status = 'COMPLETE'`, `presentArtifactCount: 3`,
   real `FINAL`-state artifact references for both summary and classification. Call Detail's new
   "Conversation intelligence" panel was browser-verified rendering it live: "Status: Complete",
   "Completeness: 100.0% (3 of 3 required outputs)", "Processing profile: Version 1".

Acceptance criteria confirmed: governance e2e tests no longer mutate real, production-relied-upon
capability state; no manual SQL repair was required for the final restoration; live verification was
performed only after the governance state was confirmed clean.

## 2026-07-27 — Simplified Test Your AI Receptionist screen

Replaced the multi-panel Simulation Lab composition with the focused `Test Your AI Receptionist`
experience from Quantum Park OS: one readiness state, live voice controls, preset prompts, chat,
transcript and a concise Quantum Result. The approved default agent is selected server-side, while
the existing receptionist lifecycle, short-lived ElevenLabs access, deterministic policy/routing
and honest refusal behavior remain unchanged. Generated instructions, provider setup summary and
recent-session content were removed from this route; their dedicated routes remain available.

| Command / check                                                                                  | Result                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @quantum-parks/admin-web typecheck`                                               | exit 0                                                                                                                                                                                                                                                      |
| Docker production build (`docker compose up -d --build admin-web`)                               | exit 0; all 17 package builds passed and the rebuilt admin container started healthy                                                                                                                                                                        |
| Focused admin Playwright tests (layout, mobile, distinction, honest refusal)                     | 4 passed                                                                                                                                                                                                                                                    |
| Focused admin Playwright tests (browser secret boundary and live-session response secret safety) | 2 passed                                                                                                                                                                                                                                                    |
| In-app browser verification                                                                      | Desktop and narrow responsive layouts rendered without horizontal overflow; preset chat exercised the real API and returned the expected no-in-sync-provider-mapping refusal                                                                                |
| `pnpm --filter @quantum-parks/admin-web test`                                                    | Externally blocked on this host: macOS rejected the installed Rolldown native binding's code signature before Vitest could start                                                                                                                            |
| `pnpm architecture:check`                                                                        | Blocked by unrelated pre-existing worktree changes in `intelligence-models.controller.ts` and `intelligence-routing.service.ts`, which currently import provider adapters directly; no new architecture violation was reported for this receptionist change |

## 2026-07-27 — Calls mission control and Copilot advisory

The Calls register now begins with live, drillable operational indicators for SLA breaches, failed
processing, open callbacks, partial/unclassified intelligence and sensitive calls. A ranked queue
links to the exact filtered register or governed work queue. The advisory reuses the audited
`AI_COPILOT` route and accepts only bounded aggregates, signal labels and evidence call IDs; cited
signal IDs are validated server-side. AI failure is labelled explicitly and falls back to local
evidence guidance without taking an action.

| Check                                              | Result                                                                                                |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm --filter @quantum-parks/admin-web typecheck` | Passed                                                                                                |
| `pnpm --filter @quantum-parks/admin-web test`      | 4 files, 22 tests passed                                                                              |
| Docker production build                            | All 17 package builds passed; rebuilt admin/API containers healthy                                    |
| Focused Playwright Calls journey                   | 2 passed; metric drill-down URLs, routed evidence, accessibility and 390px overflow covered           |
| Live configured AI Copilot route                   | Returned `AI ROUTED` with an evidence-cited SLA recommendation                                        |
| Desktop browser inspection                         | No horizontal overflow at 1766px; command strip, priority queue and advisory rendered without overlap |

## 2026-07-27 — Whole-app unified operator visual system

Knowledge Hub and Test Your AI Receptionist were used as the visual source of truth. A CSS audit
established the paper, pale green, forest, ink, muted-copy, border and compact-control vocabulary.
That contract now spans Mission Control, Calls, Alerts, Intelligence, Reports, Readiness and every
Settings family. Shared and feature-module surfaces use an `8px` radius, consistent focus treatment,
accessible muted text, solid rather than gradient forest hierarchy, and restrained hover feedback.
Reduced-motion support disables movement. No React handler, route, request body, provider endpoint,
permission or persistence behavior changed.

Verification evidence:

| Check                     | Result                                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin strict typecheck    | Passed                                                                                                                                               |
| Admin unit tests          | Passed: 4 files, 22 tests                                                                                                                            |
| Production Docker build   | Passed: 17 packages; rebuilt admin container healthy                                                                                                 |
| Cross-app visual contract | Passed: 18 desktop route families and five 390px mobile stress routes                                                                                |
| Focused browser journeys  | Passed: Calls, Knowledge Hub, Intelligence, Reports, ElevenLabs provider and Receptionist Simulation                                                 |
| Complete browser suite    | Attempted: 42 passed before stopping; six pre-existing stale assertions target removed simulator/provider-registry/governance UI, with 51 not run    |
| Provider behavior         | Both existing save actions and both voice transports remain available                                                                                |
| Provider computed style   | Paper `rgb(252, 252, 248)`, ink `rgb(23, 32, 29)`, `8px` radius                                                                                      |
| Accessibility             | ElevenLabs and Intelligence axe scans passed; Intelligence muted-label contrast corrected                                                            |
| Responsive visual audit   | No overflow across the route contract; mobile Administration had zero clipped controls and a stable 27px heading                                     |
| Visual inspection         | Mission Control, Intelligence, Reports, Intelligence Models and mobile Administration inspected without overlap or style-family drift                |
| Motion accessibility      | Global and feature-module `prefers-reduced-motion` fallbacks present                                                                                 |
| Traceability policy       | Passed: FR-01–FR-82 and NFR-01–NFR-18 present                                                                                                        |
| Architecture policy       | Existing unrelated failures remain in `intelligence-models.controller.ts` and `intelligence-routing.service.ts` for direct AIOS adapter dependencies |

## 2026-07-27 — Mission Control and Call Detail alignment refinement

Refined the two remaining visually inconsistent operator screens without changing their data,
routes or actions. Mission Control now gives release facts consistent internal gutters, holds metric
labels/values/details to stable baselines, expands the final three metrics across the available row,
and aligns attention/readiness content. Call Detail now presents the at-a-glance strip as one
bounded surface, uses compact summary and follow-up rails, removes the oversized missing-summary
state, and renders the canonical transcript as calm scan rows instead of nested cards.

| Check                       | Result                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| GitNexus upstream impact    | `MissionControlPage` LOW, zero callers/processes; `CallDetailPage` LOW, zero callers/processes               |
| Admin strict typecheck      | Passed                                                                                                       |
| Production Docker build     | Passed: all 17 packages; rebuilt admin/API containers healthy                                                |
| Focused Playwright journeys | 4 passed: Mission Control, desktop Call Detail, 390px Call Detail, and the 18-route shared visual contract   |
| Accessibility               | Focused Mission Control and Call Detail axe scans passed                                                     |
| Visual inspection           | Mission Control plus completed and failed Call Detail states inspected at 1680×1050 without overlap/overflow |
| Behavior boundary           | No API request, route, status derivation, callback/SLA action, provider call or persistence behavior changed |

## 2026-07-28 — Quantum Parks purple navigation

The fixed operator sidebar now uses the official Quantum Parks purple `#3F2599`, sourced from the
public website palette. Navigation structure, active-route logic and semantic status colours are
unchanged; the shared `AppShell` was not edited.

| Check                    | Result                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| GitNexus upstream impact | `AppShell` CRITICAL: 9 direct dependants, 56 flows and 16 modules; implementation is CSS-only |
| Production Docker build  | Passed: all 17 packages; rebuilt admin/API containers healthy                                 |
| Cross-app contract       | Passed: purple token and computed sidebar background across all 18 desktop route families     |
| Live browser inspection  | `/calls/live` renders `rgb(63, 37, 153)` with no horizontal overflow                          |
| Traceability policy      | Passed: FR-01–FR-82 and NFR-01–NFR-18 present                                                 |
| Architecture policy      | Existing unrelated AI-router adapter-boundary violations remain in two API files              |
| Accessibility            | Purple navigation retains light high-contrast text, visible active state and focus treatment  |
| Behavior boundary        | No component, route, request, provider, permission or persistence logic changed               |

## 2026-07-28 — Authentic Quantum Parks shell logo

Replaced both `QP` text placeholders in the shared shell with the supplied Quantum Parks mark.
The source artwork was preserved at 225×225 while black and near-black background pixels were
converted to a real alpha channel, allowing the shell background to show through on purple and
white. Link targets, accessible identity text, user context and navigation behavior are unchanged.

| Check                    | Result                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------- |
| Source asset             | Supplied PNG preserved at 225×225; output reports `hasAlpha: yes`                       |
| GitNexus upstream impact | `AppShell` CRITICAL: 9 direct dependants, 56 flows and 16 modules                       |
| Production Docker build  | Passed: all 17 packages; rebuilt admin/API containers healthy                           |
| Browser contract         | Passed: both shell images complete with non-zero natural width on all 18 desktop routes |
| Live browser inspection  | Optimized 48px/32px images loaded; no `QP` placeholders and no horizontal overflow      |
| Traceability policy      | Passed: FR-01–FR-82 and NFR-01–NFR-18 present                                           |
| Behavior boundary        | Only static image elements and presentation sizing changed                              |

## 2026-07-28 — Persisted blue-indigo dark mode

Added a compact light/dark icon toggle immediately before the header logo and removed the
redundant authenticated-user/activity copy. The preference is persisted locally, defaults to the
operating-system preference on first use, and is reconciled during pre-paint and client startup so
hard refreshes retain the selected appearance. Dark mode uses a navy and blue-indigo surface
system that complements the Quantum Parks identity. The navigation rail uses deep brand navy
`#082B57` in light mode and recedes to `#051A35` in dark mode. Both are darker relatives of the
blue edge in the supplied logo, preserving its silhouette while avoiding a distracting contrast
against the dark canvas. Cyan-blue is reserved for interactive accents and semantic
green/red/amber states remain distinct. No route, provider, permission, request or domain behavior
changed.

| Check                     | Result                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| GitNexus upstream impact  | `AppShell` CRITICAL: 9 direct dependants, 56 flows and 16 modules; `RootLayout` LOW                            |
| Admin strict typecheck    | Passed                                                                                                         |
| Production Docker build   | Passed: all 17 packages; rebuilt admin/API containers healthy                                                  |
| Light/dark route contract | Passed: 18 desktop route families in both modes and five 390px mobile stress routes                            |
| Persistence and header    | Passed: dark selection survives hard navigation; accessible toggle label updates; removed header copy absent   |
| Live visual inspection    | Dark canvas `#0C1020` and rail `#051A35` preserve the logo silhouette without distracting contrast or overflow |
| Traceability policy       | Passed: FR-01–FR-82 and NFR-01–NFR-18 present                                                                  |
| Architecture policy       | Existing unrelated AI-router adapter-boundary violations remain in two API files                               |
| Behavior boundary         | Appearance state is browser-local; no server or provider data path changed                                     |

## 2026-07-28 — Value-scaled Intelligence visualisation

Replaced the flat peak-time grid treatment with six explicit intensity bands derived from each
cell's canonical call count relative to the busiest visible cell. Empty and low-volume cells remain
quiet, while progressively busier cells receive visibly stronger blue shades. Light and dark modes
use separate contrast-safe scales; high-density cells switch foreground colour for legibility.
Clicking a cell still opens the same evidence drawer over the same source calls.

Single-measure categorical bar charts now assign a dedicated 12-colour categorical palette by
category slot through the shared `BarChart` wrapper. Longer lists continue with deterministic
golden-angle colours instead of clamping every remaining bar to the final palette colour. This
affects Top call reasons and the equivalent breakdown charts across Intelligence and Reports.
Multi-series charts and explicit status colours retain their established series semantics.

| Check                  | Result                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| GitNexus impact        | `IntelligenceCockpit` LOW: one page caller; shared `BarChart` LOW: `ComparisonChart` caller  |
| Admin strict typecheck | Passed                                                                                       |
| Shared UI tests        | 37 passed; first 12 category colours are unique and overflow does not repeat the final colour |
| Focused browser test   | Verifies 28 heat cells, distinct value bands/backgrounds and multi-colour categorical bars   |
| Accessibility          | Values, labels and table fallbacks remain available independently of colour                  |
| Behavior boundary      | Filters, chart values, evidence drill-downs, source records and domain actions are unchanged |
