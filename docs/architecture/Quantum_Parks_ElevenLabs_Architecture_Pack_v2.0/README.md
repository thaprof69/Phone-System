# Quantum Parks ElevenLabs Architecture Pack v2.0

This pack is the architecture and guardrail baseline for implementing the Quantum Parks ElevenLabs AI Receptionist Control and Intelligence Platform.

## Core product boundary

- ElevenLabs is the managed live voice agent and telephone receptionist.
- Quantum Parks is the exclusive normal-user control plane, authoritative company knowledge store, testing and release system, canonical call-history system, and operational intelligence platform.
- The build must not create a custom live media, STT, TTS, PBX, or turn-taking platform.

## Start here

1. Read `ARCHITECTURE.md`.
2. Read all ADRs under `adr/`.
3. Copy `guardrails/AGENTS.md.template` to the repository root and tailor commands without weakening architecture rules.
4. Import the machine-readable matrices and contracts into implementation traceability.
5. Preserve the governing PRD and build prompt under `docs/product/source/`.
6. Verify current ElevenLabs APIs and capabilities against the official reference register before coding integrations.

## Pack contents

- Formatted DOCX and PDF architecture document.
- Machine-readable Markdown.
- Fourteen architecture diagrams with editable DOT sources.
- Thirteen CSV matrices, including all FR-01 to FR-82 and NFR-01 to NFR-18 mappings.
- Fifteen ADRs.
- Runtime and coding-agent guardrail standards.
- Draft JSON schemas for events, provider results, summaries, classifications, and readiness.
- Official provider reference register.

## Authority

Security, privacy, payment exclusion, identity verification, and sensitive-case controls take precedence. PRD v2.0 is the product authority. Material architectural deviations require a new ADR and updated compliance and traceability records.
