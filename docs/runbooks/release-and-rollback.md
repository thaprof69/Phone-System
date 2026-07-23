# Runbook: Agent release and rollback

Publication requires an approved immutable version, approved/effective knowledge, approved voice assignments, supported capabilities, passing mandatory tests, no drift, active queues/templates, and complete release evidence. Publish through the workflow, persist remote mappings, read back, compare checksums, activate only after synchronization.

Rollback selects a previously approved release, verifies current compatibility, reruns critical tests, republishes, reads back, and records operator/reason. Changing only a local pointer is not rollback.
