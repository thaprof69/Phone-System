# ADR 0007: Encrypted Provider Credential Vault

## Status

Accepted — 2026-07-23.

## Decision

Permanent ElevenLabs credentials are accepted only by authenticated administration endpoints. The API validates the credential directly against server-controlled ElevenLabs endpoints before it can be saved. A five-minute HMAC proof binds the successful test to the exact credential, connection label, and environment.

Saved credentials use AES-256-GCM with provider/reference/version additional authenticated data. PostgreSQL stores ciphertext, IV, authentication tag, key version, and an opaque secret reference. The encryption master key is not stored in PostgreSQL: local Compose creates it once in a dedicated persistent volume; production must inject it from the approved secret manager or mounted secret file.

The browser receives only a safe `EL-XXXXXXXX` credential reference. Rotation creates a new encrypted record and revokes the old reference. Disconnect revokes the local reference without deleting provider objects or authoritative Quantum Parks data.

## Consequences

- Database backups do not contain the decryption key.
- Provider credentials are never returned by API responses or put in browser storage.
- A lost encryption master key makes saved credentials unrecoverable and requires deliberate rotation.
- Production secret-manager provisioning remains an external activation dependency.
- Provider connection status remains independent from production readiness and routing.
