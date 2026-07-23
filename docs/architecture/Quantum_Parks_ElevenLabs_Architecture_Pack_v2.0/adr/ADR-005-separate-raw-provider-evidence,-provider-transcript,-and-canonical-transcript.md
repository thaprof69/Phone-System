# ADR-005: Separate raw provider evidence, provider transcript, and canonical transcript

**Status:** Accepted  
**Date:** 2026-07-22  
**Decision owners:** Quantum Parks product, architecture, security, and operations

## Context

Provider records and corrected business records have different evidential roles.

## Decision

Preserve raw events immutably; normalize the provider transcript; create versioned canonical transcript and corrections with provenance.

## Consequences

Prevents silent rewriting and enables QA. Increases storage and model complexity.

## Guardrails

- Implementation must remain traceable to PRD v2.0.
- Provider capability claims must be verified against current official documentation.
- Security, privacy, payment exclusion, and sensitive-case requirements take precedence.
- Material deviation requires a superseding ADR and updated compliance matrix.
