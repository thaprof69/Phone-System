# Admin user guide

The primary navigation has five domains, ordered by how often an operator actually visits each
one. See [ADR 0012](../adr/0012-five-domain-operator-information-architecture.md) for why, and
[the route map](administration-route-migration.md) for the old→new path for every moved route.

- **Mission Control** (`/`): live receptionist state, today's activity, the attention queue,
  alerts and readiness.
- **Calls** (`/calls`): every call, plus the work a call creates — live/in-flight processing,
  failed ingestion, corrections, reconciliation, handoffs, callbacks, staff tasks, outbound
  messages, and SLA breaches. What was a separate "Operations" domain is now here, because it is
  work a call creates, not a peer domain to calls.
- **Intelligence** (`/intelligence`): what calls say in aggregate — overview, trends, call
  reasons (drills through to the calls behind each reason), knowledge gaps, customer continuity,
  agent performance (by receptionist version, drills through to the calls that version handled),
  provider performance and costs (both trace back to the AI execution runs under Settings → AI
  Routing).
- **Reports** (`/reports`): scheduled reports and their run history, each run's data lineage.
- **Settings** (`/settings`): everything used to configure and govern the receptionist, grouped
  rather than flattened into the sidebar:
  - **Receptionist** — agent configuration, conversation editing, voices, versions, releases.
  - **Simulation Lab** — scenarios, test collections, interactive test runs, release checks,
    reviews. (Named Quality internally in some technical detail; the operator-facing name is
    Simulation Lab.)
  - **Knowledge Hub** — author/version content, review, release to the voice runtime, resolve
    knowledge gaps.
  - **AI Providers** — the ElevenLabs voice-runtime connection, AI intelligence providers used for
    post-call enrichment, discovered models, provider health.
  - **AI Routing** — which provider/model serves each business capability, prompts, schemas and
    taxonomies, budgets in GBP, execution history, monitoring.
  - **Integrations** — support, customer, booking and messaging systems.
  - **Administration** — organisation defaults, users and roles, security and privacy, audit,
    retention and legal holds, feature flags, production readiness, release administration.

Never use the ElevenLabs console for routine work. Restricted console activity must be recorded as
a capability exception.

## Live calls and automatic capture

When ElevenLabs reports an active telephone or browser conversation, a blue **Live call in
progress** banner appears above every page. It shows the receptionist and elapsed time and opens
**Calls → Live activity**.

Completed provider calls are captured automatically. Phone System first accepts the signed
post-call webhook; if that delivery is missing or cannot reach the local environment, the provider
conversation monitor retrieves the transcript and submits it to the same post-call processing
pipeline. The Calls register then shows the call as **Live** origin rather than synthetic. The
transcript, summary, reason, sentiment, outcome and follow-up remain governed local records.

If the banner does not appear during a known call or a completed call is missing, treat it as a
provider-capture incident and follow the post-call webhook runbook. Operators should not create a
replacement call record by hand.

## Connecting ElevenLabs

Open **Settings → AI Providers → ElevenLabs setup**. Choose **Connect**, enter a restricted API
key, label the connection, and select Sandbox or Production. Test the connection first; Save
remains unavailable until the server verifies provider identity plus agent and voice discovery.

The key is sent only to the Quantum Parks server, encrypted with the provider credential vault,
and replaced in the UI by a safe reference. It is not recoverable from the UI. Use Manage to
re-test, update defaults, rotate the key, or disconnect. Disconnect preserves all agents,
releases, transcripts, intelligence, audit events, and provider mappings and performs no
destructive provider API call.

Connecting ElevenLabs does not approve production, enable telephone routing, or clear any
readiness blocker.

## Connecting an AI intelligence provider

Open **Settings → AI Providers → Intelligence providers**. This is a separate connection from
ElevenLabs: ElevenLabs runs the live call, an intelligence provider enriches it afterwards
(summaries, classification, knowledge-gap detection). A provider is offered a connection form only
when this platform has an adapter installed for it — an uninstalled provider is listed as
`Adapter not installed` with no fake connect action.
