# ADR 0009: AIOS Orchestration, Capabilities, and Routing

Status: Accepted

Applications invoke stable capability keys. AIOS alone resolves capability dependencies, service and pipeline versions, governed context, immutable routes, model, fallback, prompt, schema, taxonomy, policy, budget, and evaluation requirements.

Capability graphs are acyclic, depth-bounded, and topologically planned. Fallback is limited to retryable provider/model failures and cannot bypass governance rejection.
