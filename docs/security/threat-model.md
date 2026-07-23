# Threat Model

## Trust boundaries

Internet callers and public handoff users are untrusted. ElevenLabs is a signed external provider, not an authority for local configuration or intelligence. Admin browsers authenticate through OIDC; service credentials stay server-side. Business adapters, Temporal, PostgreSQL, Redis, and object storage use service identities and minimum-purpose data.

## Material threats and controls

- Spoofed/replayed/oversized webhooks: raw-body HMAC with timestamp tolerance, mapped workspace, 1 MiB limit, durable idempotency key, immutable evidence.
- Prompt injection in speech or documents: transcript is data, structured schemas reject privileged fields, tools are allowlisted/typed/authenticated, knowledge requires review and sanitization evidence.
- False completion: only committed system/provider/delivery records feed deterministic outcomes; tool errors return no completion claim.
- IDOR and privilege escalation: OIDC issuer/audience verification, server-side role/purpose checks, UUID lookup within controlled endpoints, redacted default views.
- Secret leakage: only secret references are stored; no provider keys in browser bundles; errors are safe messages; containers run non-root/read-only.
- SSRF/uploads: URL and file knowledge remain gated until fetch allowlists, malware scanning, and sanitization are enabled.
- Data exfiltration: classification, masking, restricted raw evidence, audit, retention/legal hold, encryption in transit/at rest.
- Denial of service: API rate limiting, payload limits, worker retries/backoff, inbox/dead letters, provider timeout/rate translation.

Production requires independent SAST, dependency, container, IaC, DAST, penetration, and privacy review evidence.
