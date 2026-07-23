# Quantum Parks ElevenLabs AI Receptionist Platform
## One-Shot Production Build Prompt for Codex

---

## Executive summary

Build the complete production-grade **Quantum Parks ElevenLabs AI Receptionist Control and Intelligence Platform** described in the supplied PRD v2.0.

This is a one-shot implementation assignment. It is **not an MVP, prototype, proof of concept, scaffold, architecture-only exercise, or phased scope proposal**. Do not respond with another plan. Inspect the repository, make sound engineering decisions, implement the entire buildable system, run it, test it, inspect it, fix it, document it, and leave it ready for staging and production onboarding.

The central product boundary is non-negotiable:

- **ElevenLabs is the managed live voice agent.** It receives and conducts telephone calls, performs live speech recognition and voice generation, manages conversational turns, executes the published agent configuration, uses assigned knowledge and tools, transfers calls where configured, and produces provider transcripts and call metadata.
- **The Quantum Parks application is the exclusive normal-user control plane and the authoritative business-intelligence system.** It owns agent configuration, versioning, approvals, company knowledge, voice selection, testing, publication, rollback, synchronization, drift detection, secure business tools, canonical call history, transcript normalization, summaries, classification, customer timelines, follow-up work, dashboards, trends, reports, QA, privacy, audit, retention, and operational governance.
- **Do not build a custom telephony carrier, media gateway, STT engine, TTS engine, turn-taking engine, or real-time voice runtime.** Those responsibilities belong to ElevenLabs.
- **Normal users must not need the ElevenLabs console.** All supported day-to-day configuration, knowledge, voice, testing, publishing, monitoring, reconciliation, call review, and reporting functions must be available inside the Quantum Parks application. Only vendor account creation, billing, commercial contracting, API-key bootstrap, or functions that are genuinely not exposed through supported APIs may remain restricted external onboarding tasks.

The completed platform must allow Quantum Parks staff to configure and operate its ElevenLabs receptionist entirely from a branded frontend; author and upload corporate knowledge such as SOPs, FAQs, policies, schedules, pricing, terms, safety procedures, and park information; approve and synchronize that knowledge into ElevenLabs; search, preview, approve, and assign voices; create and run ElevenLabs agent tests from inside the application; receive signed post-call transcript webhooks; build an immutable and searchable historical call database; produce Quantum Parks-owned summaries, topics, outcomes, follow-ups, trends, weekly operational reports, and monthly strategic reports; and continuously improve the receptionist through a governed human-review loop.

---

## Mission and operating mode

Act as the principal architect, staff engineer, product engineer, security engineer, SRE, data engineer, QA lead, accessibility specialist, DevOps engineer, UX engineer, and technical writer for this build.

Work autonomously until the repository satisfies the full Definition of Done in this prompt and the PRD. Do not stop for routine design questions. Inspect the repository first, preserve sound conventions, make reasonable decisions, and record material decisions in ADRs.

Do not merely describe code. Create and modify files, install and pin dependencies, implement migrations, run services, execute tests, inspect browser workflows, exercise provider simulators, fix failures, and produce release evidence.

Do not reduce scope because the assignment is large. Do not replace production functionality with placeholder routes, static mock pages, fake success responses, documentation-only controls, skipped tests, disabled tests, or TODO comments in critical paths.

Only stop when progress is genuinely blocked by an unavailable external secret, provider account, proprietary API contract, legal/privacy approval, real company content, native-speaker approval, telephone routing decision, or destructive production action. In that case:

1. Complete every buildable part.
2. Implement the production adapter boundary.
3. Provide deterministic simulators and fixtures.
4. Add contract tests and readiness gates.
5. Document the smallest exact unblock action.
6. Mark the capability as externally blocked rather than complete.

### One-shot rule

This prompt is the execution instruction. Do not return another planning-only response or divide delivery into an MVP and later phases. You may maintain a living engineering checklist and execution record inside the repository, but you must proceed directly through the complete implementation as one continuous build.

---

## Source-of-truth hierarchy

Apply requirements in this order:

1. Security, privacy, legal safety, payment-data exclusion, identity-verification, and explicit no-capacity/no-payment boundaries.
2. `Quantum_Parks_ElevenLabs_AI_Receptionist_PRD_v2.0` under `docs/product/`.
3. This one-shot production build prompt.
4. Healthy existing repository conventions and instructions.
5. Reasonable engineering assumptions recorded in ADRs.

PRD v2.0 supersedes earlier Quantum Parks documents wherever they describe:

- a custom real-time media gateway;
- a custom speech-to-text or text-to-speech orchestration layer;
- a provider-neutral voice runtime as the centre of the product;
- Quantum Parks controlling every live spoken turn; or
- ordinary users depending on the ElevenLabs console.

Preserve earlier business requirements that remain valid, including multilingual service, human escalation, customer and booking context, digital handoff, post-call summaries, call history, analytics, knowledge gaps, trend reporting, messaging, safe booking boundaries, and payment exclusion.

---

## Mandatory first actions

Before feature implementation:

1. Inspect the entire repository and determine whether it is greenfield or established.
2. Read all `README`, `AGENTS.md`, package manifests, environment examples, CI workflows, infrastructure files, schemas, tests, and architecture documents.
3. Preserve the PRD and all supplied source documents under `docs/product/source/` with a checksum manifest. Do not silently rewrite the source PRD.
4. Create or update a root `AGENTS.md` containing exact repository commands, architecture boundaries, security constraints, testing rules, naming conventions, and instructions for future coding agents.
5. Create `PLANS.md` describing the durable execution-record format, then maintain `docs/exec-plans/quantum-parks-elevenlabs-production-build.md` as a live record of work completed, decisions, failures, commands, and evidence. This is an execution record, not a substitute for implementation.
6. Create `docs/product/requirements-traceability.md` mapping **FR-01 through FR-82** and **NFR-01 through NFR-18** to code, APIs, events, database entities, UI, tests, metrics, alerts, documentation, and external dependencies.
7. Create `docs/architecture/compliance-matrix.md` comparing implementation to the PRD’s corrected responsibility boundary.
8. Create `docs/onboarding/external-dependencies.md` for provider accounts, telephone routing, legal/privacy approvals, company content, business APIs, messaging senders, native-language approval, DNS, certificates, and other external gates.
9. Run the existing repository’s formatting, linting, type checking, tests, builds, migration checks, and security scans. Record pre-existing failures honestly and do not conceal them.
10. Verify every time-sensitive ElevenLabs endpoint, SDK, field, account-tier capability, region, retention feature, authentication method, and deprecation against current official ElevenLabs documentation before using it. Pin verified dependencies and record deviations in an ADR.

---

## Corrected system responsibility boundary

### ElevenLabs owns the live voice runtime

Treat ElevenLabs as responsible for:

- receiving and answering the telephone call through the approved route;
- live speech recognition;
- live voice generation;
- turn-taking, interruption handling, silence handling, and conversational pacing;
- executing the published agent prompt, workflow, language, voice, knowledge, and tool configuration;
- invoking approved Quantum Parks webhook tools;
- executing configured human-transfer behaviour;
- producing the provider conversation identifier, transcript, metadata, analysis, and optional audio availability;
- sending post-call webhooks and exposing supported conversation-retrieval APIs.

### Quantum Parks owns the control plane and intelligence platform

Implement Quantum Parks as the system of record for:

- ElevenLabs workspace connection and service credentials;
- local agent identity and all configuration versions;
- prompts, greetings, disclosures, languages, workflows, tools, transfer rules, dynamic variables, and release approvals;
- the master company knowledge base and its metadata, versions, approvals, publication, withdrawal, and rollback;
- voice catalogue use, previews, assignments, approvals, fallback policies, and custom-voice governance;
- agent test definitions, expected outcomes, repeated runs, internal evaluation, release thresholds, and evidence;
- inbound-call personalization policy and secure business tool APIs;
- raw provider webhook evidence;
- canonical transcripts and transcript corrections;
- Quantum Parks summaries, classifications, outcomes, quality assessments, and correction history;
- customer, booking, and support linkage and immutable call-time snapshots;
- handoffs, callbacks, tasks, messages, and next steps;
- call history, trends, analytics, reports, exports, cost, QA, audit, retention, deletion, and legal hold;
- provider synchronization, drift detection, reconciliation, and readiness.

### Prohibited architecture drift

Do not implement the following as the primary architecture:

- a custom telephony carrier or PBX replacement;
- a custom media-stream gateway for live voice processing;
- custom live STT/TTS orchestration;
- a custom real-time turn engine;
- direct browser use of permanent ElevenLabs credentials;
- direct editing in ElevenLabs as the normal operational workflow;
- automatic learning from unreviewed transcripts or model-generated recommendations;
- silent synchronization where remote data overwrites the approved local master.

---

## Default implementation architecture

Preserve a sound existing stack. If the repository is greenfield or lacks a coherent production stack, use the following default.

### Technology stack

- Monorepo: `pnpm` workspaces with Turborepo.
- Language: strict TypeScript with no implicit `any`, schema-validated external payloads, and explicit domain types.
- Backend API: NestJS with Fastify.
- Admin and operations frontend: Next.js App Router with server-enforced authorization.
- Public customer frontend: separate Next.js application for secure registration, consent, and digital handoffs.
- Background processing: Temporal workflows and workers for provider synchronization, test execution, transcript enrichment, messaging, callbacks, reports, reconciliation, retention, deletion, export, and recovery.
- Authoritative database: PostgreSQL using Drizzle ORM plus explicit SQL for reporting and high-volume queries.
- Cache, distributed locks, and short-lived state: Redis.
- Object storage: S3-compatible storage for approved source documents, restricted raw webhook payloads, exports, and optional audio.
- Authentication: OIDC abstraction with a local development provider and production configuration compatible with the selected managed identity provider.
- Authorization: backend-enforced RBAC and purpose-based access for sensitive records.
- API contracts: versioned REST APIs with OpenAPI; signed provider webhooks; typed tool APIs.
- Event consistency: transactional outbox/inbox and idempotent consumers.
- Observability: OpenTelemetry traces, structured JSON logs, Prometheus-compatible metrics, dependency health, and error tracking.
- Local environment: Docker Compose with deterministic synthetic data, fake ElevenLabs server, fake customer/booking/Zendesk adapters, mail/message simulator, and observability stack.
- Production reference deployment: AWS in a configurable EU region using Terraform, ECS Fargate, RDS PostgreSQL, ElastiCache Redis, S3, KMS, Secrets Manager, ALB, WAF, managed observability integrations, backups, and least-privilege IAM.
- CI/CD: GitHub Actions unless an established repository pipeline exists.

### Required deployables

Use an equivalent structure:

```text
apps/
  admin-web/                  # Quantum Parks control, operations and intelligence UI
  customer-web/               # Public registration and secure digital handoff UI
  api/                        # Internal/public REST APIs, ElevenLabs webhooks and tools
  worker/                     # Temporal workers and asynchronous processing
  provider-simulator/         # Deterministic ElevenLabs API/webhook simulator
packages/
  domain/                     # Entities, value objects, policies, lifecycle rules
  db/                         # Schema, migrations, repositories, seeds, aggregates
  config/                     # Typed configuration and readiness validation
  auth/                       # OIDC, RBAC, purpose checks and field masking
  elevenlabs/                 # Official API adapter, webhook schemas, reconciliation
  agents/                     # Agent configuration, versions, approvals and deployment
  knowledge/                  # Knowledge assets, versions, sync and governance
  voices/                     # Voice catalogue, preview, assignment and consent controls
  testing/                    # Test Studio, provider tests and internal evaluation
  conversations/             # Raw events, canonical transcripts and call lifecycle
  intelligence/              # Summary, taxonomy, trends, knowledge gaps and reports
  integrations/              # Customer, booking, Zendesk, messaging and storage ports
  workflows/                  # Temporal workflow definitions and activities
  observability/              # Logging, tracing, metrics, health and cost
  ui/                         # Shared accessible UI primitives
infra/
  terraform/
  docker/
  monitoring/
docs/
  product/
  architecture/
  adr/
  security/
  privacy/
  runbooks/
  qa/
  api/
  onboarding/
```

Do not add a `media-gateway` as a core service.

---

## Required product modules

Build every module below as complete production functionality.

### 1. Provider Connection and Health

Implement an ElevenLabs administration layer that:

- connects a workspace using backend-held service credentials;
- verifies workspace identity, scopes, quota, environment, and connectivity;
- stores only a secret-manager reference, never the raw key in application records;
- supports separate development, staging, and production workspaces or configurations;
- exposes provider health, API errors, rate limits, usage, quota, sync backlog, webhook health, and last verification;
- supports safe credential rotation;
- fails clearly when the account tier does not expose a required capability;
- records API request IDs, correlation IDs, latency, cost/usage where available, and normalized error states.

No permanent ElevenLabs credential may reach browser JavaScript, logs, traces, exports, screenshots, or test fixtures.

### 2. Agent Studio

Implement a complete in-app agent lifecycle:

- create, retrieve, update, clone, archive, and compare managed agents;
- maintain local agent identity separately from remote ElevenLabs IDs;
- maintain immutable configuration versions with states such as `DRAFT`, `IN_REVIEW`, `STAGING`, `APPROVED`, `ACTIVE`, `SUPERSEDED`, and `ROLLED_BACK`;
- manage system prompt, policy fragments, first message, disclosure, closure wording, after-hours behaviour, supported languages, default language, voice assignments, model/provider settings exposed by ElevenLabs, turn-taking settings, interruptions, timeouts, workflow, dynamic variables, tools, transfer rules, phone assignments where supported, and platform settings;
- separate immutable safety and business-policy fragments from ordinary editable conversation text;
- show structured diffs between versions;
- require change reason, author, reviewer, approver, tests, and release evidence;
- publish through current supported ElevenLabs APIs;
- verify the remote result before marking local deployment successful;
- support audited rollback to a previously approved version;
- block production activation when knowledge, voice, tools, routes, tests, approvals, or provider synchronization are incomplete;
- detect and surface direct remote edits as configuration drift.

Unsupported provider settings must be rejected explicitly rather than silently ignored.

### 3. Knowledge Hub

The Quantum Parks application is the authoritative corporate knowledge system.

Implement support for:

- text authored directly in the application;
- document upload;
- approved URL registration;
- structured FAQ sets;
- SOPs and operating procedures;
- policies, terms and conditions;
- schedules and opening hours;
- pricing and package information;
- safety and escalation procedures;
- park-specific information;
- multilingual versions and translations;
- categories, tags, owner, park, language, source, risk, effective date, expiry date, review date, and approval requirements.

Implement the complete lifecycle:

1. Draft.
2. Validation, malware scanning, sanitization, checksum, and duplicate detection.
3. Review.
4. Enhanced approval for safety, insurance, legal, pricing, safeguarding, and other high-risk content.
5. Publication to ElevenLabs through supported text, file, URL, folder, update, and assignment APIs.
6. Storage of remote IDs, checksums, folder paths, provider state, last attempt, last success, and error.
7. Attachment to the correct agent, version, language, park, or environment.
8. Linked regression tests before activation.
9. Supersession, withdrawal, rollback, archive, and remote removal or reassignment.
10. Scheduled reconciliation and conflict, staleness, expiry, missing-assignment, and orphan detection.

Never treat a successful local approval as successful remote publication. Never treat a remote object as approved merely because it exists. Never silently replace the local master with a remote edit.

Add a knowledge-gap backlog generated from call intelligence, but require human review before creating or publishing knowledge.

### 4. Voice Library

Implement a secure in-app ElevenLabs voice management experience:

- retrieve, paginate, search, and filter the permitted voice catalogue;
- display provider-supported metadata without exposing raw credentials;
- proxy and play previews safely;
- support side-by-side comparison;
- assign approved voices by agent, language, and environment;
- validate voice availability and permissions during publication and readiness checks;
- define approved fallback voices;
- detect deleted, unavailable, or permission-changed voices;
- record voice review and QA evidence.

Implement custom or cloned voice workflows behind activation and permission gates:

- speaker identity and authorization;
- explicit documented consent;
- source-audio security and retention;
- permitted-use statement;
- internal approval;
- provider verification/eligibility state;
- review/expiry date;
- rapid disablement when consent or permission is withdrawn.

Do not claim that every custom-voice operation is API-accessible. Verify current provider coverage and document genuine vendor-console exceptions.

### 5. Agent Test Studio

Build all agent testing into the Quantum Parks application.

Support current ElevenLabs test types exposed by the API, including:

- next-reply/scenario tests;
- tool-call tests;
- multi-turn simulation tests;
- repeated probabilistic runs and pass-rate bucketing where supported.

A test definition must be able to specify:

- name, owner, tags, risk level, language, park, and scenario;
- initial conversation state and dynamic variables;
- expected facts and approved sources;
- tone and disclosure expectations;
- required or prohibited tool calls;
- expected tool parameters;
- expected transfer, refusal, handoff, or digital-next-step behaviour;
- prohibited claims and actions;
- maximum duration/latency where measurable;
- Quantum Parks-owned machine-readable pass criteria;
- number of repeated runs and minimum pass rate.

Implement:

- local and remote test IDs;
- create, update, list, archive, run, poll, retrieve, and compare;
- runs against an agent, branch, version, or configuration override where the API supports it;
- raw provider evidence plus Quantum Parks internal evaluation;
- version-to-version regression comparison;
- failure grouping and direct links to affected prompts, tools, voices, or knowledge;
- server-enforced release gates;
- immutable test evidence attached to every released agent and knowledge version.

A provider test result must never override a failed Quantum Parks safety, factual, permission, or business-rule evaluation.

### 6. Inbound Call Personalization

Implement the inbound personalization endpoint used by ElevenLabs during call initiation.

The endpoint must:

- authenticate and validate the provider request using the current supported mechanism;
- enforce strict latency and timeout budgets;
- resolve caller-ID states as `UNIQUE_MATCH`, `NO_MATCH`, `AMBIGUOUS_MATCH`, `UNAUTHORIZED`, or `UNAVAILABLE`;
- return only minimum approved initiation variables such as preferred language, likely park, and non-sensitive customer status;
- never return protected booking, support, or customer detail before the configured verification policy is satisfied;
- log purpose, fields disclosed, match method, latency, result, and provider identifiers;
- degrade safely when business systems are unavailable.

### 7. ElevenLabs Webhook Tool APIs

Expose typed, authenticated, purpose-limited tools for the live ElevenLabs agent.

Include production contracts for:

- `get_park_information`;
- `get_opening_hours`;
- `get_rules_and_age_requirements`;
- `get_packages_and_pricing`;
- `lookup_customer`;
- `verify_customer`;
- `get_upcoming_bookings`;
- `get_recent_support_context`;
- `check_read_only_availability`;
- `create_registration_link`;
- `create_booking_link`;
- `create_staff_task`;
- `request_callback`;
- `record_preferred_language` where approved;
- `prepare_handoff_context`;
- other explicitly approved functions derived from the PRD.

Every tool must have:

- a code-owned name and schema;
- an allowlisted path and method;
- authentication independent of post-call webhooks;
- input validation;
- purpose and owner;
- rate limits and abuse controls;
- identity-verification policy;
- explicit feature flags;
- idempotency for write-like actions;
- typed result states;
- audit events;
- timeouts and safe fallback wording;
- contract tests.

The agent may select only tools explicitly published in the approved configuration. Reject arbitrary URLs, methods, parameters, or tool names derived from model output.

### 8. Human Transfer, Callback, and Staff Tasks

Implement:

- transfer routes by park, language, intent, operating hours, and sensitivity;
- warm-transfer context containing only approved language, park, intent, verification state, concise factual summary, and permitted customer/booking references;
- transfer attempt, acceptance, completion, failure, and duration tracking;
- callback fallback when no human route is available;
- structured callback requests with owner, priority, SLA, source call, customer link, reason, and lifecycle;
- deduplicated staff tasks for unsupported or follow-up actions;
- sensitive senior queues and restricted visibility;
- alerting on failed transfers or breached callback SLAs.

Sensitive calls must suppress commercial prompts and broad analytics detail.

### 9. Post-Call Webhook Ingestion

Implement a hardened ElevenLabs post-call ingestion service.

The endpoint must:

- support current documented post-call transcription payloads and tolerate additive compatible fields;
- verify HMAC/signature, timestamp, and replay window using the official mechanism;
- optionally apply network allowlisting as defence in depth;
- acknowledge quickly without performing enrichment synchronously;
- store the immutable raw payload before transformation;
- use provider event and conversation identifiers for idempotency;
- handle retries, duplicates, and out-of-order delivery;
- preserve provider conversation, agent, branch/version, environment, transcript, metadata, analysis, dynamic variables, tool events, phone details, cost, and audio-availability fields where supplied;
- route processing to a durable workflow;
- expose dead-letter, retry, replay, and reconciliation controls;
- alert before provider webhook delivery becomes disabled because of repeated failures.

Implement optional post-call audio ingestion only behind approved retention, disclosure, access, and cost controls. Transcript processing must work without storing audio.

### 10. Canonical Transcript and Call History

For each eligible completed conversation:

1. Store the immutable raw provider evidence.
2. Create a canonical conversation record.
3. Normalize transcript turns, speakers, sequence, timestamps, tool calls, provider IDs, and quality indicators.
4. Preserve the raw provider transcript separately.
5. Apply redaction and data classification before broad use.
6. Allow authorized transcript correction without rewriting the provider evidence.
7. Record correction reason, actor, timestamp, and previous/new content.
8. Retain the ElevenLabs agent, branch/version, knowledge, voice, environment, and processing-version provenance where available.
9. Support missing-event reconciliation through supported conversation APIs.
10. Make the call searchable and linkable to customer history.

Create explicit processing states such as `RECEIVED`, `RAW_STORED`, `NORMALIZING`, `REDACTED`, `SUMMARIZING`, `CLASSIFYING`, `LINKING`, `FOLLOW_UP`, `AGGREGATED`, `COMPLETED`, `PARTIAL`, `FAILED_RETRYABLE`, and `FAILED_FINAL`.

### 11. Quantum Parks Intelligence Pipeline

Use a configurable, schema-constrained LLM enrichment adapter, with a production reference implementation using a currently supported model verified from official documentation at implementation time. Do not couple core domain records to one model vendor.

Generate and store:

- factual internal call summary;
- call purpose;
- primary intent;
- secondary topics;
- entities such as park, activity, date, time, package, and requested action;
- detected language;
- outcome;
- unresolved items;
- commitments and what remains unconfirmed;
- follow-up need;
- human-transfer and callback state;
- customer/booking/support linkage suggestion and confidence;
- knowledge-gap candidates;
- quality and transcript-completeness indicators;
- sentiment or frustration indicators only as probabilistic signals with methodology and confidence.

Every generated artifact must retain:

- model/provider identifier;
- model version where available;
- prompt version;
- taxonomy version;
- schema version;
- source transcript revision;
- generation timestamp;
- confidence and quality flags;
- human correction history.

Do not invent completed actions. Clearly distinguish what was answered, requested, attempted, transferred, sent, or actually confirmed.

### 12. Customer, Booking, Zendesk, and Cross-Channel Context

Define provider-neutral adapter contracts with explicit result states for customer, booking, and support systems.

Implement contract-complete sandbox adapters and fixtures when live APIs are unavailable.

Support:

- caller matching and ambiguity;
- risk-based verification;
- minimum read-only customer context;
- upcoming-booking context;
- recent/open Zendesk context;
- immutable call-time snapshots;
- verified and inferred links stored separately;
- reviewer correction;
- repeat-contact metrics;
- cross-channel ping-pong indicators;
- read-only availability with an explicit no-hold warning.

Do not scrape proprietary systems as a substitute for an approved API.

### 13. Messaging and Digital Handoff

Implement WhatsApp and SMS adapter interfaces with at least one production reference adapter and a deterministic local fake.

Support:

- approved registration links;
- booking links;
- official information links;
- post-call summaries;
- consent policy;
- templates by language, park, and purpose;
- sender identity;
- delivery receipts;
- opt-out;
- bounded retry;
- channel fallback;
- deduplication;
- safe tracking parameters;
- audit and cost.

A post-call summary must state:

- what the caller asked;
- what answer or next step was provided;
- what remains unconfirmed;
- any official link;
- callback or staff follow-up status.

Do not include unnecessary sensitive detail.

### 14. Analytics, Trends, and Reports

Build an optimized reporting layer using incremental facts and aggregates rather than scanning raw transcripts for every dashboard request.

Provide views for:

- call volume and duration;
- successfully processed, partial, failed, and missing calls;
- park, language, agent version, knowledge version, voice, call reason, and outcome;
- transfers, callbacks, unresolved calls, human requests, and failures;
- recurring questions and fastest-growing topics;
- knowledge gaps, stale answers, repeated clarification, and conflict;
- repeat contact and cross-channel ping-pong;
- digital link delivery, click, registration, booking-page arrival, and attributable conversion where data exists;
- package, price, extra, and unmet-demand signals;
- provider errors, webhook delay, synchronization drift, usage, quota, and cost;
- QA accuracy and correction rate by version.

Generate and store:

- weekly operational report;
- monthly strategic report;
- restricted sensitive-case process report;
- content-improvement backlog;
- agent-release quality report.

Support controlled HTML, CSV, and PDF output with lineage, permissions, masking, watermarking where appropriate, and audited access.

Label model-generated recommendations as recommendations, cite supporting aggregates, and require human review before any knowledge or agent update.

### 15. Operations, QA, and Governance

Implement:

- callback and task queues;
- ownership, priority, SLA, notes, completion, and escalation;
- QA sampling and reviewer assignment;
- configurable review rubrics for factual accuracy, language quality, policy adherence, routing, transcript quality, and provider quality;
- corrections to transcript, summary, classification, outcome, and customer link with immutable history;
- provider drift queue;
- failed synchronization queue;
- failed webhook/reconciliation queue;
- readiness dashboard;
- audit search;
- retention, export, deletion, and legal hold;
- cost and quota alerts;
- incident banners and operational notices.

---

## Required frontend application areas

Build a polished, accessible, responsive production application, not a generic admin scaffold.

### Overview

Show provider health, active agent, recent call volume, post-call processing health, failed syncs, test status, unresolved drift, tasks, callbacks, quota/cost, and readiness blockers.

### Agent Studio

Support all agent configuration, version diff, review, approval, test evidence, publication, rollback, and remote-state verification.

### Knowledge Hub

Support authoring, upload, URL registration, metadata, versions, approvals, sync, assignments, conflicts, expiry, withdrawal, rollback, linked tests, and knowledge gaps.

### Voice Library

Support search, filters, previews, comparison, assignments, approvals, fallback, availability, and restricted custom-voice workflow.

### Test Studio

Support test authoring, provider mapping, selected/full runs, repeated runs, progress, result evidence, internal evaluation, regression comparison, and release gates.

### Calls

Support completed calls, provider processing state where available, filters, failed ingestion, partial processing, reconciliation status, and customer linkage.

### Call Detail

Display canonical and provider transcript views, summary, classification, outcome, timeline, provider metadata, tools, sources, dynamic variables, customer/booking/support snapshots, handoff, messages, tasks, QA, redactions, corrections, and audit.

### Operations

Display handoffs, callbacks, staff tasks, owners, SLA timers, failures, alerts, and completion.

### Analytics

Display trends, knowledge gaps, repeat contact, park/language/intent mix, agent/knowledge version comparison, digital follow-up, provider performance, and cost.

### Reports

Display scheduled reports, run state, lineage, delivery, access, and exports.

### Administration

Manage users, roles, permissions, provider connection, secret references, webhooks, integrations, retention, legal holds, audit, feature flags, environment settings, and readiness.

### UX requirements

- Target WCAG 2.2 AA.
- Full keyboard operation, visible focus, correct labels, semantic headings, accessible dialogs, and screen-reader status messages.
- Use Europe/Lisbon display time and store authoritative UTC timestamps.
- Mask phone numbers, email, booking data, transcripts, and sensitive fields by role and purpose.
- Provide loading, empty, partial, degraded, forbidden, and failure states on every data-driven page.
- Translate provider errors into clear operational language while retaining advanced raw details for authorized users.
- Show explicit impact summaries before dangerous publish, rollback, withdrawal, export, deletion, or retention actions.
- Never expose the ElevenLabs API key or unrestricted signed provider URLs to the browser.

---

## Data model requirements

Implement normalized entities, relationships, constraints, indexes, and migrations for at least:

- `ProviderWorkspace`
- `ProviderCredentialReference`
- `ProviderCapabilitySnapshot`
- `ProviderRequestLog`
- `VoiceAgent`
- `AgentConfigVersion`
- `AgentApproval`
- `AgentDeployment`
- `AgentDriftFinding`
- `VoiceProfile`
- `VoicePreview`
- `VoiceAssignment`
- `VoiceConsentRecord`
- `KnowledgeAsset`
- `KnowledgeVersion`
- `KnowledgeSourceFile`
- `KnowledgeApproval`
- `KnowledgeSync`
- `KnowledgeAssignment`
- `KnowledgeConflict`
- `KnowledgeGap`
- `AgentTest`
- `AgentTestVersion`
- `ProviderTestMapping`
- `TestRun`
- `TestEvidence`
- `ReleaseGateEvaluation`
- `RawWebhookEvent`
- `ProviderConversation`
- `Conversation`
- `ConversationProcessingRun`
- `TranscriptTurn`
- `TranscriptRevision`
- `Redaction`
- `ToolInvocation`
- `CallSummary`
- `CallClassification`
- `CallEntity`
- `CallOutcome`
- `QualityEvaluation`
- `CustomerLink`
- `CustomerSnapshot`
- `BookingSnapshot`
- `SupportSnapshot`
- `VerificationSession`
- `Handoff`
- `CallbackRequest`
- `StaffTask`
- `MessageDelivery`
- `DigitalLink`
- `Trend`
- `AggregateFact`
- `ReportDefinition`
- `ReportRun`
- `AuditEvent`
- `RetentionPolicy`
- `DeletionJob`
- `LegalHold`
- `AdminUser`
- `Role`
- `Permission`
- `FeatureFlag`
- `SystemConfiguration`
- `ReadinessEvaluation`
- `OutboxEvent`
- `InboxEvent`

Use immutable snapshots for call-time customer, booking, and support context. Store raw evidence separately from redacted canonical views. Use appropriate encryption, field-level classification, partitioning, archival, and retention for high-volume call and webhook data.

Protect audit records against ordinary modification; use hash chaining or an equivalent tamper-evident mechanism where practical.

---

## API, webhook, and event requirements

### Application APIs

- Version all APIs.
- Publish OpenAPI documentation.
- Validate every request and response at boundaries.
- Use consistent RFC 7807-style problem responses or equivalent.
- Require idempotency keys on externally triggered write-like operations.
- Paginate list endpoints and apply query budgets.
- Propagate request, correlation, provider request, conversation, test-run, and workflow IDs.

### ElevenLabs adapter

Build a dedicated adapter layer that isolates provider schemas and SDK changes.

It must cover, subject to current official API verification:

- agent create, read, update, clone/branch/version, archive, publish, and rollback-equivalent operations;
- knowledge creation from text, file, and URL; update, folders, retrieve, delete/withdraw, and assignment;
- voice listing/search, metadata, preview, and approved custom-voice operations;
- test create, update, list, retrieve, run, repeat, poll, and result retrieval;
- conversation retrieval and reconciliation;
- post-call webhook parsing and HMAC verification;
- inbound personalization;
- webhook tool definitions and authentication;
- workspace, usage, quota, health, security, and retention capabilities available to the contracted account.

Use schema-tolerant webhook parsing that accepts additive fields while rejecting malformed required content.

### Integration result model

Use explicit result states such as:

- `SUCCESS`
- `NO_MATCH`
- `AMBIGUOUS`
- `VERIFICATION_REQUIRED`
- `UNAUTHORIZED`
- `VALIDATION_FAILED`
- `NOT_SUPPORTED`
- `NOT_CONFIGURED`
- `RATE_LIMITED`
- `TIMEOUT`
- `UNAVAILABLE`
- `CONFLICT`
- `PARTIAL`
- `UNKNOWN_FAILURE`

### Domain events

Implement typed, versioned domain events including:

- provider connected or failed;
- agent draft created;
- agent version submitted, approved, published, activated, rolled back, or drifted;
- knowledge created, approved, synchronized, assigned, withdrawn, expired, conflicted, or drifted;
- voice assigned, unavailable, or consent withdrawn;
- test created, run, passed, failed, regressed, or release-blocking;
- personalization requested and returned;
- tool invocation requested, authorized, rejected, completed, or failed;
- post-call webhook received, verified, duplicated, rejected, or archived;
- transcript normalized, redacted, corrected, or failed;
- summary/classification/outcome completed or failed;
- customer linked or corrected;
- handoff requested/completed/failed;
- callback/task/message created, delivered, failed, or completed;
- trend or knowledge gap detected;
- report generated;
- retention due;
- deletion completed;
- readiness evaluated.

Every event must include immutable event ID, schema version, aggregate ID, correlation and causation IDs, occurred and recorded timestamps, actor/purpose, classification, and minimum safe payload.

Use transactional outbox/inbox patterns so state and events remain consistent.

---

## Security, privacy, and trust controls

Implement controls in code and infrastructure, not only documentation.

### Authentication and authorization

- OIDC authentication.
- Short-lived sessions/tokens.
- MFA support through the identity provider.
- Backend-enforced RBAC.
- Separation of knowledge authoring and approval.
- Explicit production-release authority.
- Purpose-based access for sensitive transcripts, raw payloads, customer context, audio, exports, deletion, and legal hold.
- Field masking and role-scoped record access.

### Provider security

- Service-account credential where available.
- Least-privilege scopes.
- Quota and IP restrictions where supported.
- Secret-manager storage.
- No client-side keys.
- Safe rotation.
- Signed webhook verification.
- Replay protection.
- Separate authentication for live webhook tools.
- Rate limiting and abuse detection.

### Application security

- TLS and encryption at rest.
- Secure headers and CSP.
- CORS policy.
- CSRF protection where applicable.
- SSRF prevention for knowledge URLs and webhook configuration.
- XSS and output encoding.
- SQL injection prevention.
- File scanning and sanitization.
- No arbitrary provider or model-provided URLs or methods.
- Audit of privileged reads and exports.
- Environment isolation.
- No production PII in development fixtures.

### Payment-data exclusion

- The ElevenLabs agent must never request card data.
- Agent prompts and tests must instruct the agent to interrupt a caller who begins providing card data and redirect to an approved secure payment link.
- Quantum Parks must not intentionally store card numbers in canonical transcripts, summaries, messages, analytics, tools, logs, traces, QA exports, or reports.
- Implement transcript-side detection and redaction for card-like digit sequences, number words, spacing, corrections, and Luhn-valid patterns.
- Store only restricted detection metadata, not the card number.
- Add adversarial multilingual test fixtures.
- Do not claim that Quantum Parks prevents audio from reaching ElevenLabs; ElevenLabs is the live voice provider. Provider retention, redaction, no-training, data-residency, and zero-retention settings must be treated as contractual/configuration gates.

### Sensitive calls

- Restrict injury, accident, insurance, safeguarding, and urgent-case data.
- Use minimum necessary summaries.
- Suppress offers and broad analytics detail.
- Route to approved senior queues.
- Do not diagnose, determine liability, or promise insurance coverage.

### Retention and data rights

- Configurable retention for raw webhooks, transcripts, summaries, audio, snapshots, messages, reports, and audit data.
- Export, deletion, legal hold, and completion evidence.
- Provider deletion/reconciliation where supported.
- Default no training on customer calls unless a separate governance approval exists.
- Production readiness must fail when provider retention, region, disclosure, or deletion settings remain unapproved.

---

## Reliability, reconciliation, and readiness

Implement:

- idempotent webhooks and provider operations;
- bounded retries with backoff;
- circuit breakers and timeouts;
- dead-letter queues;
- manual replay with authorization and audit;
- scheduled provider reconciliation;
- local/remote checksum and version comparison;
- webhook gap detection;
- provider conversation import;
- degraded states that never imply false success;
- health, readiness, and dependency endpoints;
- provider quota and cost alerts;
- backup, point-in-time recovery, object versioning, and restore tests;
- zero-downtime-compatible migrations.

### Readiness states

Expose server-computed readiness states such as:

- `ENGINEERING_COMPLETE`
- `STAGING_VALIDATED`
- `PRODUCTION_DEPLOYMENT_READY`
- `EXTERNALLY_BLOCKED`
- `PRODUCTION_APPROVED`
- `PRODUCTION_ACTIVE`

Production readiness must reject:

- synthetic or test-fixture data in an active dependency;
- development or sandbox ElevenLabs configuration;
- draft, inactive, expired, or unsynchronized agents or knowledge;
- unavailable or unapproved voices;
- failed required tests;
- unresolved critical drift;
- unapproved telephone routing, disclosures, retention, queues, languages, content owners, messaging templates, or provider settings;
- local fake adapters in a production path;
- missing native-speaker approval for an active language;
- unresolved critical/high security findings.

---

## Non-functional requirements

Implement and trace all NFR-01 through NFR-18 from the PRD, including:

- clear degradation during provider failure;
- fast, signed, replay-safe webhook acknowledgement;
- at least 95% of eligible calls producing canonical transcript, summary, classification, and outcome within five minutes under normal controlled load, subject to validation;
- responsive admin pages with asynchronous long-running provider work;
- synchronization integrity and no silent partial publication;
- concurrent ingestion and background processing;
- encryption, RBAC, validation, audit, and secrets controls;
- privacy and minimum data sent to ElevenLabs;
- configurable provider region, retention, zero-retention, deletion, and no-training settings;
- WCAG 2.2 AA;
- complete change attribution and release evidence;
- end-to-end observability;
- bounded recovery, dead letters, reconciliation, and manual replay;
- maintainable categories, languages, tools, reports, and provider fields;
- provenance, confidence, source version, and correction history;
- usage and cost metering;
- tested backup, restore, RPO, and RTO;
- provider evolution isolated behind adapters and schema-tolerant webhook handling.

---

## Testing and release evidence

Testing is a production requirement. Build deterministic tools and run them.

### Required automated test layers

- Unit tests for domain policies, lifecycle transitions, permissions, release gates, synchronization, redaction, summaries, taxonomy, retention, and readiness.
- Property-based tests for idempotency, version-state invariants, event ordering, webhook replay, transcript correction, and redaction.
- ElevenLabs adapter contract tests against recorded/synthetic fixtures and a deterministic fake server.
- Integration tests using real local PostgreSQL, Redis, Temporal, and object storage containers.
- API tests for auth, RBAC, validation, rate limits, idempotency, webhooks, and tool calls.
- End-to-end provider simulations from agent publication through post-call intelligence.
- Browser end-to-end tests for all normal user workflows.
- Accessibility automation plus keyboard-flow tests.
- Load and soak tests for webhook bursts, transcript processing, test runs, sync, reports, and dashboard queries.
- Chaos/failure tests for ElevenLabs timeout, rate limit, malformed/additive payloads, duplicate/out-of-order webhooks, failed knowledge sync, missing voice, partial publish, business-system outage, messaging outage, and workflow failure.
- Security tests for webhook spoofing, IDOR, privilege escalation, SSRF, XSS, CSRF, SQL injection, file abuse, tool abuse, secret leakage, and export bypass.
- Migration tests from empty database and previous schema revision.
- Backup and restore test.

### Required scenario corpus

Include at least:

- Portuguese and English opening-hours questions by park/date.
- Minimum age, rules, directions, parking, waivers, and facilities.
- Party, activity, and group package comparisons.
- Budget-sensitive party planning.
- Explicit request for a human.
- Known caller with upcoming booking.
- Unknown and ambiguous callers.
- Failed verification.
- Registration link creation.
- Read-only availability with no-hold wording.
- Request to add children to a party that must not be executed.
- Lost and found.
- Complaint and high frustration.
- Accident, injury, insurance, safeguarding, and urgent routing.
- Unsupported language and code-switching.
- WhatsApp failure with SMS fallback.
- Human-transfer failure with callback.
- Caller begins providing card details.
- Prompt injection contained in caller speech or uploaded knowledge.
- Direct remote agent edit causing drift.
- Failed knowledge synchronization.
- Deleted or unavailable voice.
- Test regression blocking publication.
- Missing post-call webhook recovered by reconciliation.
- Duplicate and out-of-order provider events.
- Provider outage and quota/rate-limit degradation.

### Mandatory evidence thresholds

- 100% pass for required sensitive-routing, prohibited-action, and payment-handling scenarios.
- 100% of active agents, knowledge, voices, and required tests have valid approval and synchronization evidence.
- At least 90% correct and complete responses on the approved Portuguese/English launch set, with zero critical policy errors, unless stakeholders formally change the threshold.
- At least 95% of eligible controlled calls complete canonical transcript, summary, classification, and outcome within five minutes.
- No unresolved critical or high security findings.
- No production dependency uses synthetic, sandbox, draft, inactive, fake, or unapproved data.

Store commands, versions, logs, traces, screenshots, test outputs, security reports, load reports, and limitations in `docs/qa/release-evidence.md`.

---

## Local development, CI/CD, and infrastructure

### Local environment

A new engineer must be able to start the full platform from a clean checkout with documented commands.

Provide:

- safe `.env.example` files;
- one-command dependency startup;
- PostgreSQL, Redis, Temporal, object storage emulator, local OIDC, observability, fake ElevenLabs server, fake business systems, and message simulator;
- deterministic synthetic seed data clearly marked `synthetic=true`;
- sample agents, knowledge, voices, tests, calls, reports, users, and roles;
- one command for formatting, linting, type checking, tests, builds, migration checks, and browser tests.

### CI/CD

Create pipelines for:

- lockfile-enforced install;
- formatting, linting, and strict type checking;
- unit, property, integration, contract, API, and browser tests;
- accessibility tests;
- migration validation;
- OpenAPI and event-schema drift;
- secret scanning;
- SAST;
- dependency and license audit;
- SBOM generation;
- container and Terraform scanning;
- minimal non-root container builds;
- staging deployment;
- smoke tests using the provider simulator;
- manual approval before production;
- migration safety and rollback;
- release provenance and notes.

### Terraform/reference deployment

Create reusable environment modules for:

- network and private subnets;
- controlled egress;
- ALB and WAF;
- ECS services for API, worker, admin web, and customer web;
- RDS PostgreSQL;
- Redis;
- S3 and lifecycle policies;
- KMS;
- Secrets Manager;
- IAM;
- telemetry, logs, traces, metrics, alarms, and dashboards;
- backups and restore configuration;
- autoscaling;
- budgets;
- DNS and certificate placeholders.

Do not apply destructive cloud changes without explicit authorization. Format, validate, and produce non-destructive plans where possible.

---

## Documentation deliverables

Create documentation that exactly matches the implementation:

- root `README.md`;
- `AGENTS.md`;
- `PLANS.md` and completed execution record;
- FR/NFR traceability matrix;
- architecture compliance matrix;
- C4 context, container, and component diagrams;
- data-flow and sequence diagrams for agent publication, knowledge publication, testing, personalization, tool calls, post-call ingestion, intelligence, and reconciliation;
- ERD;
- OpenAPI and webhook docs;
- ElevenLabs adapter and capability matrix;
- provider-console exception register;
- ADRs for stack, provider adapter, local/remote source of truth, workflow engine, enrichment model, auth, deployment, retention, and audit;
- security architecture and threat model;
- privacy/data inventory and retention map;
- custom-voice governance guide;
- knowledge governance guide;
- agent release and testing guide;
- operations handbook;
- admin user guide;
- QA guide and language-approval process;
- deployment, rollback, backup/restore, DR, credential rotation, and incident-response guides;
- runbooks for provider outage, webhook failure, drift, bad agent release, bad knowledge release, unavailable voice, test regression, business-system outage, messaging outage, data incident, retention failure, high cost/quota, and failed reconciliation;
- external production onboarding checklist.

Remove stale documentation describing a custom Quantum Parks voice runtime.

---

## Acceptance demonstrations

Before declaring the build complete, demonstrate and record at least these end-to-end journeys:

1. Connect a simulated or sandbox ElevenLabs workspace without exposing credentials.
2. Create an agent in Quantum Parks, configure it, approve it, publish it, verify the remote state, and display the deployment record.
3. Author an FAQ in Knowledge Hub, approve it, synchronize it to ElevenLabs, assign it, run linked tests, and activate it.
4. Upload an SOP document, sanitize it, version it, approve it, synchronize it, and roll it back.
5. Search voices, preview candidates, assign an approved voice, and block an unavailable voice.
6. Create next-reply, tool-call, and multi-turn tests; run repeated tests; compare versions; and block a failing release.
7. Process an inbound personalization request without disclosing protected context.
8. Execute a typed read-only tool call with verification and audit.
9. Reject a capacity/payment-affecting booking modification and return the secure approved next step.
10. Receive a signed post-call webhook, store raw evidence, normalize the transcript, redact sensitive data, summarize, classify, link, create follow-up, aggregate, and display the call.
11. Correct the canonical transcript and summary without changing the raw provider evidence.
12. Recover a missing call through reconciliation without creating duplicates.
13. Detect direct remote drift and block readiness until resolved.
14. Generate weekly and monthly reports from aggregates.
15. Fail WhatsApp and use approved SMS fallback once.
16. Fail a human transfer and create a callback with SLA and alert.
17. Process card-data speech in a transcript fixture, redact it, suppress it from summaries and analytics, and record only restricted metadata.
18. Enforce RBAC, field masking, audit, deletion, legal hold, and controlled export.
19. Start the entire platform from a clean checkout and run the full automated suite.
20. Validate Terraform, start non-root containers, and demonstrate backup/restore in a non-production environment.

---

## Definition of Done

The task is complete only when all of the following are true:

- The full platform is implemented end to end, not merely designed.
- ElevenLabs is used as the managed live voice runtime; no unnecessary custom live voice stack has been built.
- Normal users can perform every supported day-to-day ElevenLabs operation through the Quantum Parks application.
- The Quantum Parks application is the authoritative source for agent configuration, company knowledge, tests, approvals, canonical calls, summaries, reports, and audit.
- FR-01 through FR-82 and NFR-01 through NFR-18 are traced to code and evidence.
- Agent configuration, knowledge, voices, and tests synchronize with explicit local/remote state, errors, drift, and reconciliation.
- Signed post-call transcript ingestion is idempotent, replay-safe, schema-tolerant, and recoverable.
- Raw provider evidence and canonical transcript/intelligence layers are separate.
- Summaries and classifications are factual, versioned, correctable, and provenance-aware.
- Customer continuity, tasks, callbacks, messaging, dashboards, trends, reports, QA, retention, deletion, and audit work.
- Payment-card data is not intentionally retained and prohibited actions are rejected.
- Sensitive calls receive restricted handling and no commercial prompts.
- The UI is polished, responsive, accessible, and protected by server-side authorization.
- The local platform starts from a clean checkout.
- CI/CD and infrastructure-as-code validate successfully.
- Security, load, accessibility, failure, migration, and backup/restore evidence is recorded.
- There are no fake production successes, critical TODOs, hard-coded secrets, disabled critical tests, or undocumented critical manual steps.
- Remaining gaps are limited to explicit external onboarding items and are isolated behind readiness gates.

Do not call the live service production active unless provider onboarding, real telephone routing, approved company content, legal/privacy settings, voices, languages, queues, messaging, native-speaker review, DNS/certificates, and authorized deployment are complete.

---

## Final Codex response format

When the build is actually complete, return a concise engineering handoff containing:

1. What was built.
2. Corrected architecture and major ADRs.
3. Repository paths for major components.
4. Commands to run locally and execute the complete test suite.
5. How to connect and configure the ElevenLabs workspace.
6. How to publish an agent, knowledge, voice, and test release.
7. Staging and production deployment path.
8. Test, accessibility, load, security, and recovery evidence.
9. Current readiness state.
10. Remaining external onboarding items only.
11. Any unmet requirement, exact reason, evidence, and smallest unblock action.

Do not claim production readiness or production activation when only simulators or sandbox providers have been validated.

**Begin implementation now. Do not return another plan.**
