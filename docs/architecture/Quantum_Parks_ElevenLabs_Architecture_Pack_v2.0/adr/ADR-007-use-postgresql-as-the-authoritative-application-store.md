# ADR-007: Use PostgreSQL as the authoritative application store

**Status:** Accepted  
**Date:** 2026-07-22  
**Decision owners:** Quantum Parks product, architecture, security, and operations

## Context

The platform needs transactional versions, approvals, mappings, calls, audit, and aggregates.

## Decision

Use PostgreSQL with Drizzle and explicit SQL for high-volume reporting; object storage for large assets.

## Consequences

Strong consistency and portability. Requires partitioning, archival, indexing, and zero-downtime migration discipline.

## Guardrails

- Implementation must remain traceable to PRD v2.0.
- Provider capability claims must be verified against current official documentation.
- Security, privacy, payment exclusion, and sensitive-case requirements take precedence.
- Material deviation requires a superseding ADR and updated compliance matrix.
