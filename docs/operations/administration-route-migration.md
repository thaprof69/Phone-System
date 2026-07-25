# Route map

Canonical routes as of the 2026-07-25 information-architecture rework (see
[ADR 0012](../adr/0012-five-domain-operator-information-architecture.md)). Every route listed
under "Old route" issues a permanent (308) redirect to its "New route" — see
`apps/admin-web/next.config.ts` for the exact list. No route is duplicated between the old and new
location.

## Mission Control

Unchanged: `/`, `/alerts`, `/readiness`.

## Calls

| New route               | Old route               |
| ----------------------- | ----------------------- |
| `/calls`                | —                       |
| `/calls/live`           | `/calls/partial`        |
| `/calls/failed`         | —                       |
| `/calls/corrections`    | —                       |
| `/calls/reconciliation` | —                       |
| `/calls/handoffs`       | `/operations/handoffs`  |
| `/calls/callbacks`      | `/operations/callbacks` |
| `/calls/tasks`          | `/operations/tasks`     |
| `/calls/messages`       | `/operations/messages`  |
| `/calls/sla`            | `/operations/sla`       |
| `/calls/:id`            | —                       |

## Intelligence

| New route                            | Old route                 | Note                                                  |
| ------------------------------------ | ------------------------- | ----------------------------------------------------- |
| `/intelligence`                      | `/intelligence/analytics` |                                                       |
| `/intelligence/trends`               | —                         |                                                       |
| `/intelligence/call-reasons`         | —                         | Extracted from the analytics intent chart             |
| `/intelligence/knowledge-gaps`       | `/intelligence/gaps`      |                                                       |
| `/intelligence/customer-continuity`  | —                         | Platform-wide `REPEAT_CONTACT` trend only             |
| `/intelligence/agent-performance`    | —                         | Real per-agent-version rollup                         |
| `/intelligence/provider-performance` | —                         | Real, reads the same runs as AI Routing → Execution   |
| `/intelligence/costs`                | —                         | Real, reads the same usage as AI Routing → Monitoring |

## Reports

| New route          | Old route               |
| ------------------ | ----------------------- |
| `/reports`         | `/intelligence/reports` |
| `/reports/history` | —                       |

## Settings

`/settings` is a landing page of seven group cards. Each group has its own vertical rail.

### Receptionist

| New route                                 | Old route                        |
| ----------------------------------------- | -------------------------------- |
| `/settings/receptionist`                  | `/receptionist/agents`           |
| `/settings/receptionist/:id`              | `/receptionist/agents/:id`       |
| `/settings/receptionist/voices`           | `/receptionist/voices`           |
| `/settings/receptionist/versions`         | `/receptionist/versions`         |
| `/settings/receptionist/versions/compare` | `/receptionist/versions/compare` |
| `/settings/receptionist/releases`         | `/receptionist/releases`         |

### Simulation Lab

Renamed from Quality — Test cases → Scenarios, Suites → Test collections, Runs → Interactive
test, Gates → Release checks.

| New route                             | Old route             |
| ------------------------------------- | --------------------- |
| `/settings/simulation/scenarios`      | `/quality/test-cases` |
| `/settings/simulation/collections`    | `/quality/suites`     |
| `/settings/simulation/results`        | `/quality/runs`       |
| `/settings/simulation/release-checks` | `/quality/gates`      |
| `/settings/simulation/reviews`        | `/quality/reviews`    |

### Knowledge Hub

| New route                      | Old route             |
| ------------------------------ | --------------------- |
| `/settings/knowledge`          | `/knowledge/library`  |
| `/settings/knowledge/:id`      | `/knowledge/:id`      |
| `/settings/knowledge/review`   | `/knowledge/review`   |
| `/settings/knowledge/releases` | `/knowledge/releases` |
| `/settings/knowledge/gaps`     | `/knowledge/gaps`     |

### AI Providers

Split from the old AI Infrastructure page's Providers/Models/Monitoring areas, plus ElevenLabs
(previously its own Administration area).

| New route                             | Old route                                                   |
| ------------------------------------- | ----------------------------------------------------------- |
| `/settings/ai-providers`              | — (redirects to `elevenlabs`)                               |
| `/settings/ai-providers/elevenlabs`   | `/administration/voice-runtime`                             |
| `/settings/ai-providers/intelligence` | `/administration/ai?area=providers`                         |
| `/settings/ai-providers/models`       | `/administration/ai?area=models`                            |
| `/settings/ai-providers/health`       | `/administration/ai?area=monitoring` (provider-health half) |

### AI Routing

Split from the old AI Infrastructure page's Overview/Capabilities/Routes/Governance/
Execution/Monitoring areas. Prompts, schemas and budgets are three routes over the same
`GovernanceView` component (a `section` prop selects which panel renders); execution and
monitoring likewise reuse `ExecutionView`/`MonitoringView` unchanged.

| New route                           | Old route                                                        |
| ----------------------------------- | ---------------------------------------------------------------- |
| `/settings/ai-routing`              | `/administration/ai`                                             |
| `/settings/ai-routing/capabilities` | `/administration/ai?area=capabilities`                           |
| `/settings/ai-routing/routes`       | `/administration/ai?area=routes`                                 |
| `/settings/ai-routing/prompts`      | `/administration/ai?area=governance` (prompts panel)             |
| `/settings/ai-routing/schemas`      | `/administration/ai?area=governance` (schemas/taxonomies panels) |
| `/settings/ai-routing/budgets`      | `/administration/ai?area=governance` (budgets panel)             |
| `/settings/ai-routing/executions`   | `/administration/ai?area=execution`                              |
| `/settings/ai-routing/monitoring`   | `/administration/ai?area=monitoring` (run-monitoring half)       |

### Integrations

| New route                | Old route                      |
| ------------------------ | ------------------------------ |
| `/settings/integrations` | `/administration/integrations` |

### Administration

| New route                                | Old route                       |
| ---------------------------------------- | ------------------------------- |
| `/settings/administration`               | `/administration`               |
| `/settings/administration/general`       | `/administration/general`       |
| `/settings/administration/users`         | `/administration/users`         |
| `/settings/administration/security`      | `/administration/security`      |
| `/settings/administration/audit`         | `/administration/audit`         |
| `/settings/administration/retention`     | `/administration/retention`     |
| `/settings/administration/feature-flags` | `/administration/feature-flags` |
| `/settings/administration/readiness`     | `/administration/readiness`     |
| `/settings/administration/release`       | `/administration/release`       |

ElevenLabs is configured only at Settings → AI Providers → ElevenLabs setup. AI model providers
for post-call enrichment are configured only at Settings → AI Providers → Intelligence providers.
These remain two distinct connections — one voice runtime, one AI enrichment provider — never
merged into one settings screen.
