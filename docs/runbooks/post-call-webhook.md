# Runbook: Post-call webhook failure

1. Confirm `/health`, object-store health, database health, inbox backlog, oldest pending age, and Temporal task queue.
2. Check signature failures separately from storage/database failures; never bypass HMAC or timestamp validation.
3. If provider delivery is auto-disabled, restore the receiver first, then re-enable through a verified supported provider operation or restricted onboarding procedure.
4. Reconcile provider conversation IDs against canonical mappings. Replay only immutable stored evidence using the same idempotency key.
5. Resolve dead letters after correcting the cause; do not fabricate a call record from partial model output.
6. Record incident window, missed conversations, replay evidence, duplicates suppressed, and final counts.
