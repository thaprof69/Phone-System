# Runbook: Post-call webhook failure

1. Confirm `/health`, object-store health, database health, inbox backlog, oldest pending age, and Temporal task queue.
2. Check signature failures separately from storage/database failures; never bypass HMAC or timestamp validation.
3. If provider delivery is auto-disabled, restore the receiver first, then re-enable through a verified supported provider operation or restricted onboarding procedure.
4. Reconcile provider conversation IDs against canonical mappings. Replay only immutable stored evidence using the same idempotency key.
5. Resolve dead letters after correcting the cause; do not fabricate a call record from partial model output.
6. Record incident window, missed conversations, replay evidence, duplicates suppressed, and final counts.

## Provider conversation monitor

The API also polls the official ElevenLabs conversation list. This is expected production behavior,
not a simulator:

- `initiated` and `in-progress` provider states power the global live-call banner.
- `processing` is terminal work in progress and is not shown as an active call.
- `done` and `failed` conversations enter recovery after the webhook grace period.
- Existing signed `raw_webhook_events` always take precedence.
- A retrieved conversation is labelled `ELEVENLABS_CONVERSATION_RETRIEVAL`; do not relabel it as
  signed evidence.
- Provider `has_audio`, `has_user_audio`, and `has_response_audio` flags describe remote
  availability. They do not mean Phone System stored audio.

If a Twilio-forwarded call reached the agent but is absent from Phone System:

1. Check `GET /v1/live-calls`. `DEGRADED` includes a safe monitor diagnosis.
2. Verify the saved production integration and local deployment map the provider agent ID.
3. Check `ELEVENLABS_CONVERSATION_RETRIEVAL` inbox records for `PENDING`, `DISPATCHED`, or
   `PROCESSED`.
4. Confirm the API can list and retrieve conversations from the official production endpoint.
5. Confirm the Temporal worker is healthy. A recovery event remains retryable when dispatch is
   unavailable.
6. Do not bypass signature validation or manufacture a raw webhook while investigating.

Defaults are a five-second poll, 24-hour recovery lookback and ten-second webhook grace period.
Tune with `PROVIDER_CALL_POLL_INTERVAL_MS`, `PROVIDER_CALL_LOOKBACK_SECONDS`, and
`PROVIDER_WEBHOOK_GRACE_SECONDS`. Set `PROVIDER_CALL_MONITOR_ENABLED=false` only for an intentional
operational disablement.
