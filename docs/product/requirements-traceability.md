# Requirements Traceability

The machine-readable authority is `docs/architecture/Quantum_Parks_ElevenLabs_Architecture_Pack_v2.0/matrices/requirements-architecture-traceability.csv`. CI verifies that FR-01 through FR-82 and NFR-01 through NFR-18 remain present and receive implementation and test evidence.

| Range         | Implementation domains                                                             | Primary evidence                                                 |
| ------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| FR-01–FR-16   | Provider connection, agents, releases, prompts, tools, transfers, personalization  | Provider contracts, release compiler, API and browser journeys   |
| FR-17–FR-29   | Knowledge lifecycle and provider synchronization                                   | Ingestion, approval, manifest, regression, rollback, drift tests |
| FR-30–FR-35   | Voice catalogue, assignment, approval, consent                                     | Voice adapter and availability/readiness tests                   |
| FR-36–FR-43   | Test Studio and release gates                                                      | Provider/internal evaluator and regression evidence              |
| FR-44–FR-53   | Personalization, typed tools, verification, handoff                                | Contract, authorization, no-payment/no-capacity journeys         |
| FR-54–FR-64   | Webhooks, evidence, canonical transcripts, enrichment, reconciliation              | Signature, replay, ordering, redaction, provenance tests         |
| FR-65–FR-73   | Calls, analytics, reports, controlled exports                                      | Browser, aggregate, lineage, masking, and export tests           |
| FR-74–FR-82   | Operations, messaging, QA, RBAC, audit, retention                                  | Workflow, RBAC, audit, deletion/legal-hold, readiness tests      |
| NFR-01–NFR-18 | Reliability, security, privacy, accessibility, quality, cost, DR, vendor isolation | SLO, load, security, accessibility, restore, adapter evidence    |

Implementation-specific rows are enriched continuously during the build; completion requires every row to reference a module, API/event, entity, control, test, metric, and release artifact.

## AIOS architecture extension

| Requirement                       | Implementation                                                                                    | Evidence                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Provider-independent enrichment   | `aios-contracts`, `aios`, `aios-adapters`; gateway-only worker                                    | Architecture fitness and type checks                                  |
| Evidence-linked call intelligence | Context Builder, manifest, schema validation, evidence resolver                                   | AIOS unit tests and artifact tables                                   |
| Non-blocking enrichment           | Temporal workflow returns `PARTIAL`; ingestion/outcomes continue                                  | Workflow and gateway failure paths                                    |
| Provenance and correction         | Immutable AIOS runs/artifacts plus projection artifact links                                      | Migration `0006`                                                      |
| Cost and readiness controls       | Usage, price, budget, evaluation, AI readiness entities                                           | Admin AI Intelligence and readiness API                               |
| AI Providers/Routing UX/IA        | Capability-first Settings → AI Providers/AI Routing hierarchy and grouped AI workspace view model | Admin browser navigation, redirect, simulator and accessibility tests |
