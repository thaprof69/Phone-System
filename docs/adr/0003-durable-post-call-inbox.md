# ADR 0003: Durable post-call inbox

Status: Accepted · 2026-07-22

The receiver validates the ElevenLabs HMAC timestamp, workspace mapping, size, schema, audio prohibition, and replay key. It stores the exact body in immutable encrypted object storage before creating a transactional raw-event and inbox record. It then acknowledges and dispatches Temporal asynchronously. Dispatch failure leaves a retryable inbox record; ingestion never waits for enrichment.
