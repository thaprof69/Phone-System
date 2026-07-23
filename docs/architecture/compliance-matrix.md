# Architecture Compliance Matrix

| Authority                              | Implementation evidence                                   | Test/evidence                                                  | State                                        |
| -------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------- |
| ElevenLabs is managed live runtime     | Forbidden-component architecture fitness rules            | `scripts/architecture-check.ts` passed                         | Implemented                                  |
| Quantum Parks local master             | Versioned local records and explicit provider mappings    | Publication read-back, test mapping, reconciliation evidence   | Implemented; live externally blocked         |
| Provider adapter boundary              | `packages/elevenlabs`, simulator                          | Adapter/signature tests                                        | Implemented; live externally blocked         |
| Backend-held provider credentials      | AES-256-GCM vault, separate master-key volume, RBAC API   | Vault binding/encryption tests and browser integration journey | Implemented; production key external         |
| Signed durable post-call ingestion     | HMAC/timestamp/workspace guard, immutable S3 write, inbox | Signature, stale signature, idempotency and simulator probes   | Implemented; live webhook externally blocked |
| Raw/provider/canonical separation      | 73 migration-created tables and worker                    | Redaction, correction and deterministic-outcome tests          | Implemented                                  |
| Typed tools and deterministic outcomes | Persist-before-success tool registry and outcome policy   | Domain/model-boundary tests                                    | Implemented                                  |
| Human-reviewed improvement             | Versioned corrections, approvals, knowledge gaps          | Independent high-risk approval and release gates               | Implemented                                  |
| OIDC/RBAC/purpose/audit                | Cognito ALB auth, JWT guard, RBAC, chained audit          | Compilation, architecture and Terraform checks                 | Implemented; live IdP validation blocked     |
| PostgreSQL authority                   | Drizzle schema and six migrations                         | Migration and live Compose validation                          | Implemented                                  |
| Temporal durability                    | Workflow package, worker and durable inbox                | Live Compose worker validation                                 | Implemented, validation partial              |
| AWS ECS reference                      | Private ECS/RDS/Redis/S3/KMS, Cognito ALB, scoped roles   | Terraform fmt and validate passed                              | Implemented; deployment externally blocked   |
| Privacy/ZRM/residency gates            | Readiness evaluator and explicit capability states        | Production blocker tests                                       | Implemented; approvals externally blocked    |
| Payment exclusion/sensitive handling   | Audio rejection, redaction and deterministic policy       | English/Portuguese digit tests                                 | Implemented; native review blocked           |
