# ADR-001: Use ElevenLabs as the managed live voice runtime

**Status:** Accepted  
**Date:** 2026-07-22  
**Decision owners:** Quantum Parks product, architecture, security, and operations

## Context

Quantum Parks requires a high-quality AI receptionist but does not need to build carrier, media, STT, TTS, or turn-taking infrastructure.

## Decision

Use ElevenLabs to receive and conduct live calls and emit provider call data. Quantum Parks integrates by supported APIs, tools, personalization, webhooks, and telephony configuration.

## Consequences

Faster delivery and managed voice quality. Creates provider dependency and requires explicit capability, privacy, and cost governance. A custom media gateway is prohibited as the primary design.

## Guardrails

- Implementation must remain traceable to PRD v2.0.
- Provider capability claims must be verified against current official documentation.
- Security, privacy, payment exclusion, and sensitive-case requirements take precedence.
- Material deviation requires a superseding ADR and updated compliance matrix.
