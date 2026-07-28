# ADR 0017: Provider Call Observation and Recovery

## Status

Accepted - 2026-07-28.

## Context

ElevenLabs is the managed live voice runtime, including for telephone calls forwarded by Twilio.
Phone System previously learned about those calls only from post-call webhooks. That was
insufficient for two reasons:

- ElevenLabs sends post-call transcription webhooks only after the call and its analysis finish, so
  they cannot power a truthful in-progress indicator.
- A cloud provider cannot deliver a webhook to a developer's `localhost`, and temporary receiver
  failures can also delay or exhaust delivery. A completed provider call could therefore remain
  absent from the local control plane even though ElevenLabs had a transcript.

The provider documents list and detail conversation APIs with explicit `initiated`, `in-progress`,
`processing`, `done`, and `failed` states. It also documents post-call webhooks as terminal events.
Those are separate evidence channels and must not be conflated.

## Decision

The API process runs one provider conversation monitor for the saved production integration. Every
five seconds by default it:

1. Resolves the encrypted server-side credential and locally configured agent mappings.
2. Lists recent conversations through the official provider adapter.
3. Projects only provider-reported `initiated` and `in-progress` conversations into an in-memory
   live-call snapshot.
4. Retrieves `done` or `failed` conversation details after a short webhook grace period.
5. Defers to existing signed raw webhook evidence when it exists.
6. Otherwise persists the provider DTO, canonical conversation timing and transcript, claims a
   distributed recovery inbox event, and dispatches the existing post-call Temporal workflow.

The retrieval source is explicitly
`ELEVENLABS_CONVERSATION_RETRIEVAL`. It never creates a `rawWebhookEvent`, never claims to have a
provider signature, and never marks provider audio availability flags as locally stored audio.
When a signed webhook subsequently arrives, normal webhook ingestion updates the provider copy and
remains the immutable raw-evidence authority.

The global application shell polls a server-side proxy every three seconds. It renders an
always-visible banner only while the provider snapshot contains a live call, including the
receptionist name and elapsed time. The banner links to Live Activity. Provider or local monitor
failures clear the live projection and return `DEGRADED`; stale calls are not displayed as active.

## Operations

- `PROVIDER_CALL_MONITOR_ENABLED=false` disables the monitor.
- `PROVIDER_CALL_POLL_INTERVAL_MS` controls polling and is clamped to at least two seconds.
- `PROVIDER_CALL_LOOKBACK_SECONDS` controls terminal recovery lookback and is clamped to at least
  five minutes.
- `PROVIDER_WEBHOOK_GRACE_SECONDS` controls how long retrieval waits for the preferred signed
  webhook.
- The browser never receives the permanent ElevenLabs API key.
- The configured provider agent allowlist prevents unrelated workspace conversations from entering
  this Phone System.

## Consequences

- Operators can see live telephone and browser conversations throughout the application.
- Completed calls are recovered after webhook loss and use the same transcript, redaction,
  classification, summary, outcome, aggregate, manifest and follow-up pipeline.
- Polling provides bounded detection latency rather than realtime push; the default worst-case
  display delay is approximately eight seconds across provider and browser polling.
- The monitor is intentionally an API-process service. Its database inbox claim makes terminal
  recovery idempotent across replicas, while the live snapshot is provider-authoritative and may be
  independently refreshed by each replica.
- Official provider references:
  [list conversations](https://elevenlabs.io/docs/api-reference/conversations/list),
  [get conversation](https://elevenlabs.io/docs/api-reference/conversations/get), and
  [post-call webhooks](https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks).
