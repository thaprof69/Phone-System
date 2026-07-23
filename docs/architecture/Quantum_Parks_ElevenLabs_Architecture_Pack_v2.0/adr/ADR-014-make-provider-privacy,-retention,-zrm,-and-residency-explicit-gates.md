# ADR-014: Make provider privacy, retention, ZRM, and residency explicit gates

**Status:** Accepted  
**Date:** 2026-07-22  
**Decision owners:** Quantum Parks product, architecture, security, and operations

## Context

ElevenLabs receives live audio and provider settings vary by account and contract.

## Decision

Record approved provider data posture and fail readiness when retention, redaction, residency, ZRM, DPA, or webhook dependencies are unresolved.

## Consequences

Avoids false local-only claims. May require enterprise features and commercial/legal onboarding.

## Guardrails

- Implementation must remain traceable to PRD v2.0.
- Provider capability claims must be verified against current official documentation.
- Security, privacy, payment exclusion, and sensitive-case requirements take precedence.
- Material deviation requires a superseding ADR and updated compliance matrix.
