# ADR-002: Make the Quantum Parks application the exclusive normal-user control plane

**Status:** Accepted  
**Date:** 2026-07-22  
**Decision owners:** Quantum Parks product, architecture, security, and operations

## Context

Normal users should not need the ElevenLabs console for day-to-day work.

## Decision

Provide agent, prompt, workflow, tool, transfer, voice, knowledge, test, release, monitoring, and reconciliation workflows in the Quantum Parks application.

## Consequences

Requires broader provider API integration and drift detection. Console exceptions are limited to vendor onboarding/billing/API-inaccessible capabilities.

## Guardrails

- Implementation must remain traceable to PRD v2.0.
- Provider capability claims must be verified against current official documentation.
- Security, privacy, payment exclusion, and sensitive-case requirements take precedence.
- Material deviation requires a superseding ADR and updated compliance matrix.
