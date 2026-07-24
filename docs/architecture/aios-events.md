# AIOS Versioned Event Inventory

All events use schema version 1, immutable event/aggregate IDs, correlation and causation, actor, purpose, classification, timestamps, and credential/transcript-safe payloads.

| Family           | Events                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| Execution        | `AIOSExecutionStarted`, `AIOSExecutionCompleted`, `AIOSExecutionCompletedWithFallback`, `AIOSExecutionFailed` |
| Dependencies     | `AIOSDependencyResolved`, `AIOSDependencyFailed`                                                              |
| Routing          | `AIOSFallbackUsed`, route/pipeline activation and rollback                                                    |
| Governance       | capability/service/prompt/schema/taxonomy lifecycle                                                           |
| Evaluation       | evaluation started/completed/failed and baseline changed                                                      |
| Operations       | replayed, corrected, budget threshold/exceeded                                                                |
| Health/readiness | provider/model health transition and AIOS readiness transition                                                |

Initial transport is the PostgreSQL transactional outbox/inbox. Completion/failure events are committed with authoritative execution state. Consumers persist the source event ID for idempotency.
