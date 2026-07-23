# ADR-008: Enforce tests and release gates server-side

**Status:** Accepted  
**Date:** 2026-07-22  
**Decision owners:** Quantum Parks product, architecture, security, and operations

## Context

UI-only gates can be bypassed and provider behaviour is non-deterministic.

## Decision

Release transitions are code-owned and require critical tests, approvals, dependency validity, and provider verification.

## Consequences

Improves trust and compliance. Adds release workflow complexity and human approval effort.

## Guardrails

- Implementation must remain traceable to PRD v2.0.
- Provider capability claims must be verified against current official documentation.
- Security, privacy, payment exclusion, and sensitive-case requirements take precedence.
- Material deviation requires a superseding ADR and updated compliance matrix.
