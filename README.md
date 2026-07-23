# Quantum Parks ElevenLabs Platform

Quantum Parks' authoritative control, knowledge, testing, governance, call-history, operations, and intelligence platform for an ElevenLabs-managed live receptionist.

ElevenLabs conducts calls. This repository does not contain a PBX, media gateway, STT/TTS service, or live turn engine.

## Quick start

```bash
pnpm install --frozen-lockfile
pnpm compose:up
```

Compose applies migrations, seeds deterministic local records, and starts all five deployables plus PostgreSQL, Redis, Temporal, and object storage. To run application processes outside containers, start the dependencies and use `pnpm dev`.

Admin Web: `http://localhost:3000`  
Customer Web: `http://localhost:3001`  
API/OpenAPI: `http://localhost:4000/docs`  
Provider simulator: `http://localhost:4100`

Run the complete local verification with `pnpm check` and browser workflows with `pnpm test:e2e`.

## Readiness

Local and CI execution use deterministic synthetic adapters. Production readiness is therefore `EXTERNALLY_BLOCKED` until every dependency in `docs/onboarding/external-dependencies.md` is supplied and approved.
