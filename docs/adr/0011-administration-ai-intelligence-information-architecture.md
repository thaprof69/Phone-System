# ADR 0011: Administration and AI Intelligence information architecture

## Status

Accepted — 2026-07-23

## Context

The first AIOS console exposed services, context, providers, models, routes, pipelines, prompts,
schemas, taxonomies, evaluations, usage, health, and audit as peer navigation items. That mirrored
the platform architecture but required operational administrators to understand implementation
details before answering basic configuration and readiness questions.

## Decision

The global application has one **Administration** entry. Administration contains Settings,
Readiness, Security, Integrations, Audit, and Release. Voice Runtime and AI Intelligence are
canonical configuration areas under Settings.

AI Intelligence exposes six primary operator sections:

- Overview
- Providers
- Capabilities
- Execution
- Governance
- Monitoring

Capabilities are the stable business-facing abstraction. Models belong to their provider
connections. Services, routes, pipelines, context, memory, and dependencies are progressively
disclosed under Execution. Prompts, schemas, taxonomies, policies, approvals, and evaluations are
under Governance. Usage, cost, health, runs, incidents, and AI activity are under Monitoring.

The simulator is presented as a deterministic non-production adapter and is excluded from
production-provider counts. Unsupported adapters are labelled `Adapter not installed` and have no
fake connection action.

## Consequences

- AIOS packages, registries, provider neutrality, versioning, RBAC, audit, and readiness ownership
  remain unchanged.
- The backend exposes an Administration-oriented AI workspace read model; the browser does not
  derive readiness from unrelated records or use static dashboard counts.
- `/administration/ai-intelligence` redirects to
  `/administration/settings/ai-intelligence`.
- A verified provider connection still does not enable production routing.
