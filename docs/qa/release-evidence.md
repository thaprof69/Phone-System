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

| Command | Result |
|---|---|
| `pnpm check` | format, lint, architecture, typecheck, test and build all green |
| `pnpm traceability:check` | `Traceability contains FR-01–FR-82 and NFR-01–NFR-18.` |
| `pnpm test:unit` | 9 files, 62 tests passed (was 8 files / 26) |
| `npx playwright test --project=admin-chromium` | 19 passed across two consecutive runs |
| `npx playwright test --project=customer-chromium` | 2 passed |
| HTTP probe | all 45 admin routes return `200` |

Three axe scans (Mission Control, call workspace, analytics) report zero violations.

**Defect found and fixed in this work**: chart containers were marked `aria-hidden` while
the charting library rendered its own focusable surface inside them — 163 axe violations.
Replaced with `inert`, which removes the subtree from both the accessibility tree and the
tab order. The table fallback remains the accessible representation.

**Still outstanding** — recorded honestly rather than implied complete: authoring and
approval actions across Agent Studio, Knowledge and Test Studio; the visual capability
route editor and the count-only Execution, Governance and Monitoring sections of the AI
console; work-item status transitions in Operations; report scheduling actions.
