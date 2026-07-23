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
- A subsequent targeted image unpack exposed host disk exhaustion and forced Docker's internal store read-only. Clearing only reproducible repository build caches recovered space; Docker restarted cleanly, preserved the PostgreSQL and credential-key volumes, and every service returned healthy. Both Next.js applications now start through their standalone production entrypoints without the prior startup warning.
- A successful provider connection does not change readiness, telephone routing, or production activation.
