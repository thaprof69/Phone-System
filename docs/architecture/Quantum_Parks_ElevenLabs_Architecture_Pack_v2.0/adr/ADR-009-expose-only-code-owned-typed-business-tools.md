# ADR-009: Expose only code-owned typed business tools

**Status:** Accepted  
**Date:** 2026-07-22  
**Decision owners:** Quantum Parks product, architecture, security, and operations

## Context

A voice agent must not invoke arbitrary actions or URLs.

## Decision

Tools use a registry, JSON schemas, purpose, verification level, field allowlists, explicit result states, idempotency, and audit.

## Consequences

Prevents tool hallucination and false completion. Every new tool requires engineering and security review.

## Guardrails

- Implementation must remain traceable to PRD v2.0.
- Provider capability claims must be verified against current official documentation.
- Security, privacy, payment exclusion, and sensitive-case requirements take precedence.
- Material deviation requires a superseding ADR and updated compliance matrix.
