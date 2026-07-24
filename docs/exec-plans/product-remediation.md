# Execution Record — Operator Control Plane Remediation

Branch: `feature/product-remediation`
Started: 2026-07-24
Status: IN PROGRESS

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

| # | Decision | Rationale |
|---|---|---|
| D1 | Breadth pass first (remove all generic/placeholder surfaces), then depth module by module | Removes the misleading product layer fastest; one continuous remediation, not phased scope |
| D2 | Radix primitives styled with the existing CSS custom properties | Battle-tested keyboard/focus semantics for tabs, dialog, select, popover; retains the existing design tokens rather than discarding them |
| D3 | Recharts, wrapped behind product-owned components in `packages/ui` | Feature pages never import Recharts; wrappers enforce tokens, formatting, responsive containers, accessible titles and table fallbacks |
| D4 | Extend existing endpoints before adding new ones | The control-plane controller already covers most domains; speculative API surface is prohibited |
| D5 | Provider registry drives the AI admin contract | Replaces `z.literal('OPENAI')`; keeps uninstalled adapters honestly reported rather than offering fake connect actions |
| D6 | Rich synthetic seed is a prerequisite, not a nicety | The seed currently creates zero business records, so no populated state can be built or verified without it |

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
- [ ] 0.5 Single navigation source of truth + §6 information architecture + per-segment loading/error/not-found

### Phase 1 — Breadth pass
- [ ] 1.1 Delete `apps/admin-web/app/[section]/page.tsx` and `ConfigurationPlaceholder`
- [ ] 1.2 Dedicated route trees for all ten domains with real tabs, tables and actions
- [ ] 1.3 Mission Control rebuilt as an operator cockpit
- [ ] 1.4 Engineering-facing wording removed from operator surfaces

### Phase 2 — Depth passes (fixed order)
- [ ] 2.1 Mission Control (§7)
- [ ] 2.2 Agent Studio (§8)
- [ ] 2.3 Knowledge Hub (§9)
- [ ] 2.4 Voice Library (§10)
- [ ] 2.5 Test Studio (§11)
- [ ] 2.6 Calls and Call Detail (§12)
- [ ] 2.7 Operations (§13)
- [ ] 2.8 AI Infrastructure (§14)
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

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | Already up to date, 18 workspace projects, 317 ms |
| `pnpm architecture:check` | `Architecture fitness checks passed.` |
| `pnpm traceability:check` | `Traceability contains FR-01–FR-82 and NFR-01–NFR-18.` |
| `pnpm typecheck` | 17 tasks successful, 17 total, 8.524 s |
| `pnpm test` | 29 tasks successful; api 1 file / 2 tests passed |
| `pnpm test:unit` | 8 test files, 26 tests passed, 594 ms |

### Phase 0 results

| Command | Result |
|---|---|
| `pnpm --filter @quantum-parks/ui typecheck` | exit 0 |
| `npx vitest run packages/ui/src/ui.test.ts` | 1 file, **36 tests passed** |
| `node scripts/validate_palette.js "#e2701a,#1c6d99,#d13f3f,#7a4ac4,#0f8a63,#b1860c" --mode light --surface "#fcfcf8"` | **ALL CHECKS PASS** — worst adjacent CVD ΔE 8.7 (protan), normal-vision ΔE 17.7, all six ≥ 3:1 contrast |
| `npx tsx packages/db/src/seed.ts` | `people=6, agentVersions=5, voices=25, knowledgeAssets=30, tests=30, testRuns=3, conversations=220, corrections=8, knowledgeGaps=8, aggregateFacts=515, trends=5, reports=5, auditEvents=14` |
| `GET /v1/calls?limit=3` | 220 conversations available; states include `COMPLETED`, `FAILED_FINAL`, `PARTIAL` |
| `GET /v1/knowledge` | 30 items |
| `GET /v1/voices` | `SUCCESS`, 25 items |
| `GET /v1/operations` | `transfers=7, callbacks=41, tasks=10, deliveries=20` |
| `GET /v1/analytics/summary` | `eligibleConversationCount=0`, `syntheticConversationCount=220`, 12 intents — synthetic records correctly excluded from production-eligible analytics |

Toolchain: Node v26.0.0, pnpm 11.9.0, Docker running.

---

## 5. Failures, corrections, and evidence paths

Recorded as encountered. Evidence base path: `docs/qa/evidence/`.

### Defects this remediation corrects (verified by inspection, 2026-07-24)

| ID | Defect | Evidence |
|---|---|---|
| X1 | Tabs are inert `<span>` elements with index 0 hardcoded active; 32 declared tabs, 8 functional | `apps/admin-web/app/[section]/page.tsx:154-162` |
| X2 | Eight product domains share one record shape with no table, filter, sort, search, pagination or drill-down | `apps/admin-web/app/[section]/page.tsx:163-209` |
| X3 | Eight administration routes render a placeholder whose record count is always the literal `0` | `apps/admin-web/app/administration/admin-shell.tsx:115-142` |
| X4 | AI console receives full registry arrays and renders only `.length` | `apps/admin-web/app/administration/settings/ai-intelligence/ai-intelligence-console.tsx:633-664` |
| X5 | AI admin API accepts only `OPENAI` and exposes no model, capability, route, prompt, schema, budget, run or monitoring operations | `apps/api/src/controllers/aios-admin.controller.ts:9` |
| X6 | Seed creates no conversations, knowledge, voices, tests, operations records, aggregate facts or reports, so every domain page renders empty | `packages/db/src/seed.ts` |
| X7 | Three independent hardcoded navigation arrays; active state matched by label string rather than pathname | `shell.tsx:18`, `admin-shell.tsx:19`, `admin-shell.tsx:28` |
| X8 | Dead CSS for a tab pattern the console no longer uses | `apps/admin-web/app/globals.css:270-288` |

---

## 6. FR/NFR and architecture-compliance updates

Pending completion of the phases above. `docs/product/requirements-traceability.md` and
`docs/architecture/compliance-matrix.md` are updated as each module reaches depth, not in advance.

---

## 7. External gates and the smallest unblock action

| Gate | State | Smallest unblock action |
|---|---|---|
| ElevenLabs production workspace and credentials | `EXTERNALLY_BLOCKED` | Supply a production API key and workspace id, then run the Administration → Voice Runtime connection flow |
| `ELEVENLABS_CAPABILITY_MODE=live` | Blocked | Requires the gate above plus verified capability snapshot |
| AI provider production approval | Blocked by design | `AI_DATA_REGION_UNAPPROVED`, `AI_RETENTION_UNAPPROVED` and `AI_EVALUATION_FAILED` are raised unconditionally in production so AI can never self-certify; needs recorded human approval |
| OIDC issuer for production RBAC | Not configured | Provide `OIDC_ISSUER` and `OIDC_AUDIENCE`; no OIDC container exists in `docker-compose.yml` |
| Native language approvals | Empty | Populate `NATIVE_LANGUAGE_APPROVALS` after linguistic review |

Local and CI readiness remains `EXTERNALLY_BLOCKED`. No simulator evidence is presented as production evidence.
