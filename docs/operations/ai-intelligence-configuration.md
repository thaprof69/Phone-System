# Administration: AI Intelligence

Open `/administration/settings/ai-intelligence`.

- Overview separates Voice Runtime, AI Intelligence, Platform, and production-routing status.
- Capabilities are the business-facing centre of the workspace.
- Providers contain their governed models; there is no separate Models area.
- Execution groups services, routing, pipelines, context, evidence, memory, retries, and dependencies.
- Governance groups prompts, schemas, taxonomies, policies, approvals, and evaluations.
- Monitoring groups usage, cost, health, runs, failures, incidents, and AI activity.
- Simulator is visibly synthetic, never counts as a connected production provider, and never
  satisfies production readiness.
- Providers validates credentials before encrypted save and exposes only safe references.
- Models uses provider discovery and local governance; unverified or unavailable models cannot enter approved production routes.
- Capabilities, Services, Context & Memory, Routes, Pipelines, Prompts, Schemas, Taxonomies, Evaluation, Usage & Cost, Health, and Audit expose AIOS read models.

Connecting a provider does not approve a model, route, capability, evaluation, AIOS readiness, platform readiness, or production routing.
