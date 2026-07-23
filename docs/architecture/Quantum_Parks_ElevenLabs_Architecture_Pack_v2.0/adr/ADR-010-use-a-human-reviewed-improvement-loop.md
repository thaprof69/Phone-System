# ADR-010: Use a human-reviewed improvement loop

**Status:** Accepted  
**Date:** 2026-07-22  
**Decision owners:** Quantum Parks product, architecture, security, and operations

## Context

Call trends are valuable but contain errors, anecdotes, and untrusted speech.

## Decision

Calls create gaps and recommendations; humans draft, approve, test, and publish changes. No automatic production learning.

## Consequences

Reduces poisoning and accidental policy drift. Improvement is slower but controlled and measurable.

## Guardrails

- Implementation must remain traceable to PRD v2.0.
- Provider capability claims must be verified against current official documentation.
- Security, privacy, payment exclusion, and sensitive-case requirements take precedence.
- Material deviation requires a superseding ADR and updated compliance matrix.
