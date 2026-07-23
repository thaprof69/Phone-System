# ADR-011: Isolate provider integration behind an adapter and reconciliation service

**Status:** Accepted  
**Date:** 2026-07-22  
**Decision owners:** Quantum Parks product, architecture, security, and operations

## Context

Provider APIs, fields, deprecations, and account capabilities may change.

## Decision

Map provider DTOs at a boundary, return domain result unions, maintain a capability registry, and reconcile remote state.

## Consequences

Reduces vendor leakage and supports simulation. Does not promise easy provider replacement of live runtime.

## Guardrails

- Implementation must remain traceable to PRD v2.0.
- Provider capability claims must be verified against current official documentation.
- Security, privacy, payment exclusion, and sensitive-case requirements take precedence.
- Material deviation requires a superseding ADR and updated compliance matrix.
