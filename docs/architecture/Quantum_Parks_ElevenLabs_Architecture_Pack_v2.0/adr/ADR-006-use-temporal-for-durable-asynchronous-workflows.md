# ADR-006: Use Temporal for durable asynchronous workflows

**Status:** Accepted  
**Date:** 2026-07-22  
**Decision owners:** Quantum Parks product, architecture, security, and operations

## Context

Publication, tests, post-call processing, messaging, reports, retention, and reconciliation require durable retries and visibility.

## Decision

Use Temporal workflows with task queues by domain. Keep authoritative business state in PostgreSQL.

## Consequences

Improves recovery and observability. Requires workflow versioning and careful PII minimization in histories.

## Guardrails

- Implementation must remain traceable to PRD v2.0.
- Provider capability claims must be verified against current official documentation.
- Security, privacy, payment exclusion, and sensitive-case requirements take precedence.
- Material deviation requires a superseding ADR and updated compliance matrix.
