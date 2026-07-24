# Quantum Parks AIOS Architecture & Intelligence Operating System

AIOS is the internal platform service through which every governed AI capability executes. It is not an ElevenLabs feature and is not limited to call processing.

```text
Application Service
  → AIOS Service Gateway
  → AI Capability Registry
  → AIOS Service Registry
  → AIOS Orchestrator
  → Context Builder and Evidence Resolver
  → Policy and Route Resolution
  → Pipeline / Prompt / Schema / Taxonomy
  → Provider-neutral Adapter
  → Provider
```

The initial deployment is hybrid: orchestration is hosted in the API, workers use authenticated internal HTTP, and API callers may use the same service contract in process. The contract and persisted provenance are extraction-ready.

## Bounded contexts

- `packages/aios-contracts`: stable gateway, execution, context, provider, event, and provenance contracts.
- `packages/aios`: dependency planning, orchestration, context minimization, evidence and policy validation.
- `packages/aios-adapters`: the only legal location for provider HTTP/SDK types.
- `packages/intelligence`: business artifacts and deterministic validation.

OpenAI is the first production reference adapter, not an architectural dependency. The deterministic simulator is non-production only.

## Reproducibility

Each artifact retains capability, service, pipeline, route, context policy/manifest, prompt, schema, taxonomy, provider/model, source revision, evidence, usage, latency, fallback, and processing-run provenance. Existing business intelligence tables are projections with an optional AIOS artifact link.

## Safety

Context is retrieved through typed sources, minimized, classified, verified, freshness-checked, token-budgeted, and assigned stable evidence IDs. Output must satisfy the code-owned schema and may cite only the approved manifest. The deterministic false-completion policy rejects model claims that verification, transfers, deliveries, callbacks, tasks, accounts, bookings, capacity, or payments completed.

## Events and readiness

AIOS writes versioned outbox events atomically with successful or failed authoritative records. Consumers use source event IDs idempotently. Voice Runtime Readiness, AIOS Readiness, Platform Readiness, and the final production-routing decision remain distinct.
