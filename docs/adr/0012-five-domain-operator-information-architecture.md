# ADR 0012: Five-domain operator information architecture

## Status

Accepted — 2026-07-25. Supersedes [ADR 0011](0011-administration-ai-intelligence-information-architecture.md).

## Context

The primary navigation had eight top-level domains: Mission Control, Receptionist, Knowledge,
Quality, Calls, Operations, Intelligence, Administration. That grouping mirrored how the product
was built, not how an operator actually spends their day. Calls-created work (handoffs,
callbacks, staff tasks, messages) lived in a separate "Operations" domain from the calls that
created it. "Intelligence" was actually only analytics and reports on calls, with no facet for
agent, provider or cost performance. Configuration areas an operator visits occasionally
(receptionist setup, knowledge authoring, test scenarios, AI provider/routing configuration,
integrations, administration) were scattered across five separate top-level entries, each
competing for the same sidebar space as the domains used every day.

## Decision

The primary navigation has exactly five domains, ordered by how often an operator actually visits
each one:

1. **Mission Control** (`/`) — the operating dashboard, unchanged.
2. **Calls** (`/calls/*`) — every call, plus the work a call creates. Operations (handoffs,
   callbacks, staff tasks, messages, SLA) is no longer a separate domain; it is a call's own
   downstream work and lives at `/calls/handoffs`, `/calls/callbacks`, `/calls/tasks`,
   `/calls/messages`, `/calls/sla`. `/calls/partial` is renamed `/calls/live` (live/in-flight
   enrichment, not literally ringing calls — the platform does not model real-time telephony
   state).
3. **Intelligence** (`/intelligence/*`) — the evidence and insight produced from calls: overview
   (was Analytics), trends, call reasons (extracted from the overview's intent chart, with
   drill-through to `/calls?intent=`), knowledge gaps, customer continuity, agent performance,
   provider performance, and costs.
4. **Reports** (`/reports/*`) — extracted from Intelligence as its own domain: scheduled reports
   and run history. Templates, deliveries and exports are not separate routes — no delivery-log
   or template-versioning table exists yet, and the definitions/runs already shown are the real
   evidence available today. Adding those routes without backing data would have been exactly the
   kind of placeholder this rework exists to remove.
5. **Settings** (`/settings/*`) — everything used to configure and govern the receptionist,
   grouped rather than flattened into the sidebar. `/settings` is a landing page of seven group
   cards; each group has its own vertical rail rather than a horizontal tab bar, because several
   groups (Calls' old sibling Administration, AI Routing) have eight or more areas that would
   wrap badly as tabs:
   - **Receptionist** — agents, voices, versions, releases (was the `/receptionist` domain).
   - **Simulation Lab** — was the `/quality` domain, renamed in both label and route segments:
     Test cases → Scenarios, Suites → Test collections, Runs → Interactive test (this is also
     where a collection is actually run — "Interactive test" names the action, not just the
     history), Gates → Release checks, Reviews unchanged.
   - **Knowledge Hub** — was `/knowledge`, routes unchanged in substance (`/settings/knowledge`
     is now the library index).
   - **AI Providers** — connections, credentials and health per provider: ElevenLabs setup (was
     `/administration/voice-runtime`), Intelligence providers (was AI Infrastructure's Providers
     area), Models, Provider health (the provider-health half of the old Monitoring view).
   - **AI Routing** — what performs each business capability and what it may cost: overview,
     capabilities, routes, prompts, schemas and taxonomies, budgets, execution history,
     monitoring (the run-monitoring half of the old Monitoring view). Prompts/schemas/budgets are
     three routes over the same `GovernanceView` component with a `section` prop, not three
     re-implementations — see Consequences.
   - **Integrations** — was `/administration/integrations`.
   - **Administration** — General, users and roles, security and privacy, audit, retention and
     legal holds, feature flags, production readiness, release administration. "General" and
     "Release administration" were not enumerated in the original five-domain request; they are
     placed here as the closest real fit for cross-cutting organisational and release-governance
     configuration that has no other home in the new structure.

Every old route redirects (permanent, 308) to its new location — see
`apps/admin-web/next.config.ts`. No route is duplicated between the old and new location; the old
path only ever redirects.

## Consequences

- **`AIIntelligenceConsole`'s dead code was removed, not migrated.** Its `active` prop was always
  called with the literal value `"overview"` — the `Providers`/`Capabilities`/`Execution`/
  `Governance`/`Monitoring` sub-views and the OpenAI-connect dialog inside it (hardcoded to
  `providerKey: 'OPENAI'`, the exact anti-pattern ADR 0008's provider neutrality rule exists to
  prevent) were unreachable from any route. Deleting them during the migration — rather than
  moving unreachable code to a new path — is a correctness fix this rework surfaced, not scope
  creep.
- **Two view components gained a `section` prop** (`GovernanceView`: `'budgets' | 'prompts' |
'schemas' | 'all'`; `MonitoringView`: `'runs' | 'health' | 'all'`) so that splitting one page
  into several routes reads from one implementation each, not three. This is the same "one grouped
  pass, several views" principle `AiosPlatformService.groupedUsage()` (see below) already applies
  on the backend.
- **`aggregate_facts` gained three new dimension keys** (`agentVersion`, `agentVersionOutcome`,
  `agentVersionTest`) so Agent performance is a real per-version rollup — which agent version
  actually handled a call, honouring the seeded release timeline, not every call attributed to
  whichever version is active today. `platform.service.ts` exposes this as
  `analyticsAgentPerformance()`, read the same way `analyticsSeries()` already reads the table.
- **`AiosPlatformService.groupedUsage()`** is a new private method: one pass over
  `ai_processing_runs`/`ai_usage_records`, grouped by provider, model and capability, computing
  execution count, latency percentiles, fallback/timeout/retry/failure counts and cost/token
  totals together. `performanceBreakdown()` and `costBreakdown()` are two read-only views over the
  same grouped pass — Provider performance and Costs are a different cut of the evidence
  `/settings/ai-routing/executions` and `/settings/ai-routing/monitoring` already show, not a
  second spend ledger.
- **Customer follow-up rate is stated as "Not yet instrumented", not zero or fabricated.** No
  caller or customer identity is recorded anywhere in the schema, so a call cannot be attributed
  to a specific repeat caller — only the platform-wide `REPEAT_CONTACT` trend exists. Building a
  believable per-version or per-park breakdown without that identity would have been invented
  evidence.
- **`/calls` gained `intent` and `agentVersion` filters** (and the columns to support them) so
  Intelligence → Call reasons and Intelligence → Agent performance have somewhere real to drill
  through to, rather than linking to a list that cannot actually filter on what sent it there.
