# ADR-004: Use signed, fast, idempotent post-call ingestion

**Status:** Accepted  
**Date:** 2026-07-22  
**Decision owners:** Quantum Parks product, architecture, security, and operations

## Context

Provider post-call events must not be lost or block on enrichment.

## Decision

Verify signature/replay, persist raw evidence and inbox record, acknowledge quickly, and process asynchronously.

## Consequences

Supports replay and duplicate safety. Requires restricted raw storage and reconciliation for missing events.

## Guardrails

- Implementation must remain traceable to PRD v2.0.
- Provider capability claims must be verified against current official documentation.
- Security, privacy, payment exclusion, and sensitive-case requirements take precedence.
- Material deviation requires a superseding ADR and updated compliance matrix.
