# ADR-015: Exclude payment processing and restrict sensitive cases

**Status:** Accepted  
**Date:** 2026-07-22  
**Decision owners:** Quantum Parks product, architecture, security, and operations

## Context

Voice calls may contain card or sensitive information, but the system is not a payment, medical, legal, or insurance decision platform.

## Decision

Never request card data; interrupt and redirect; post-call redact; restrict sensitive cases; suppress offers; route to approved human queues.

## Consequences

Reduces risk but cannot prevent provider from hearing unsolicited live audio. Provider controls and incident processes remain essential.

## Guardrails

- Implementation must remain traceable to PRD v2.0.
- Provider capability claims must be verified against current official documentation.
- Security, privacy, payment exclusion, and sensitive-case requirements take precedence.
- Material deviation requires a superseding ADR and updated compliance matrix.
