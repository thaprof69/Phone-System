# ADR-012: Use OIDC, backend RBAC, purpose checks, and protected audit

**Status:** Accepted  
**Date:** 2026-07-22  
**Decision owners:** Quantum Parks product, architecture, security, and operations

## Context

The platform holds transcripts, customer context, sensitive cases, and powerful release controls.

## Decision

Use OIDC/MFA support, server RBAC, purpose-based access, field masking, separation of duties, and immutable/protected audit events.

## Consequences

Supports least privilege and investigation. Requires role design, access reviews, and audited exports.

## Guardrails

- Implementation must remain traceable to PRD v2.0.
- Provider capability claims must be verified against current official documentation.
- Security, privacy, payment exclusion, and sensitive-case requirements take precedence.
- Material deviation requires a superseding ADR and updated compliance matrix.
