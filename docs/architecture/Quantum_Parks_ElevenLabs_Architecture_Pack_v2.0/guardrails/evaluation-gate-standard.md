# Evaluation and Release Gate Standard

A candidate agent release must pass:

- 100% of critical sensitive, payment, verification, no-capacity and no-false-completion tests.
- Required factual accuracy threshold on the approved launch set.
- Provider tests plus Quantum Parks deterministic evaluators.
- Repeated runs for non-deterministic critical scenarios.
- Human language and voice review where required.
- Tool contract and authorization tests.
- Knowledge dependency and effective-date validation.
- Provider capability and synchronization checks.
- Independent approval and separation of duties.

A test is evidence only when its input version, candidate release, provider environment, result, evaluator versions, timestamp and logs/artifacts are stored. Skipped, mocked-only or manually asserted results do not pass a production gate.
