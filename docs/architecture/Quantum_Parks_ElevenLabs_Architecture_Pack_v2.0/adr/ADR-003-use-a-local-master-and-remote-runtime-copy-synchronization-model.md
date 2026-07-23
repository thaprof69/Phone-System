# ADR-003: Use a local-master and remote-runtime-copy synchronization model

**Status:** Accepted  
**Date:** 2026-07-22  
**Decision owners:** Quantum Parks product, architecture, security, and operations

## Context

Provider objects are required at runtime but must not become the business source of truth.

## Decision

Store immutable approved local versions and map them to provider object IDs/hashes. Publish through durable workflows and verify by read-back.

## Consequences

Supports audit and rollback. Requires reconciliation, checksums, capability mapping, and drift incidents.

## Guardrails

- Implementation must remain traceable to PRD v2.0.
- Provider capability claims must be verified against current official documentation.
- Security, privacy, payment exclusion, and sensitive-case requirements take precedence.
- Material deviation requires a superseding ADR and updated compliance matrix.
