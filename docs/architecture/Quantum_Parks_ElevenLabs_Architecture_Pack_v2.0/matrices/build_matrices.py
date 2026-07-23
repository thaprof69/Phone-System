from pathlib import Path
from docx import Document
import csv, re

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'matrices'
PRD=Path('/mnt/data/Quantum_Parks_ElevenLabs_AI_Receptionist_PRD_v2.0.docx')

def write(name, headers, rows):
    with (OUT/name).open('w', newline='', encoding='utf-8-sig') as f:
        w=csv.writer(f); w.writerow(headers); w.writerows(rows)

doc=Document(PRD)
requirements=[]
for table in doc.tables:
    if len(table.columns)>=2:
        for row in table.rows[1:]:
            vals=[c.text.strip().replace('\n',' ') for c in row.cells]
            if vals and re.fullmatch(r'(FR|NFR)-\d{2}', vals[0]):
                requirements.append(vals)

# architecture mappings by range/category
def map_req(rid, req):
    n=int(rid.split('-')[1])
    if rid.startswith('NFR'):
        domain='Quality, security and operations'
        components='config; auth; observability; workflows; infra'
        api='readiness; health; audit; metrics'
        data='SystemConfiguration; ReadinessEvaluation; AuditEvent'
        control='NFR/SLO gate; CI evidence; server readiness'
        test='performance/security/reliability/accessibility test appropriate to requirement'
        metric='NFR-specific SLI/SLO'
        evidence='release evidence + dashboard/alert/runbook'
    elif n<=8:
        domain='Provider connection and agent control'; components='elevenlabs; agents; api; worker'; api='provider-connections; agents; agent-releases'; data='ProviderWorkspace; Agent; AgentVersion; AgentReleaseManifest'; control='secret scope; capability registry; approval; reconciliation'; test='provider contract + agent lifecycle E2E'; metric='provider health; publication success; drift'; evidence='provider mapping + publication read-back'
    elif n<=18:
        domain='Agent configuration'; components='agents; config; admin-web'; api='agent-versions; prompts; tools; transfers'; data='PromptVersion; ToolVersion; TransferPolicy; LanguageConfiguration'; control='versioning; release compiler; separation of duties'; test='configuration validation + release tests'; metric='configuration failures; rollback time'; evidence='release manifest + approval history'
    elif n<=31:
        domain='Knowledge management'; components='knowledge; worker; object storage'; api='knowledge; knowledge-releases'; data='KnowledgeAsset; KnowledgeVersion; KnowledgeApproval; KnowledgeRelease'; control='risk class; effective dates; two-person approval; checksum'; test='ingestion + conflict + publication + regression'; metric='stale/conflict/no-answer rate'; evidence='knowledge release manifest + sync proof'
    elif n<=39:
        domain='Voice management'; components='voices; elevenlabs; admin-web'; api='voices; custom-voices'; data='VoiceCatalogueItem; VoiceAssignment; VoiceConsentEvidence'; control='availability; consent; approval; fallback'; test='voice search/preview/assignment + language QA'; metric='voice availability; approval status'; evidence='voice assignment and consent record'
    elif n<=48:
        domain='Agent Test Studio'; components='testing; agents; worker; admin-web'; api='test-suites; test-runs'; data='TestSuite; TestCase; TestRun; TestAssertionResult'; control='critical gates; repeated runs; human review'; test='provider tests + internal evaluators + E2E'; metric='pass rate; critical failure; flakiness'; evidence='test run evidence + release gate'
    elif n<=59:
        domain='Live personalization and tools'; components='api; integrations; auth; agents'; api='personalization; elevenlabs/tools'; data='VerificationSession; ContextSnapshot; ToolDefinition; Handoff'; control='typed schema; verification; minimum data; no false completion'; test='tool contract/security/journey tests'; metric='tool latency/failure; transfer/callback'; evidence='audit + tool result + journey trace'
    elif n<=69:
        domain='Post-call ingestion and canonical history'; components='conversations; workflows; intelligence; storage'; api='webhooks/elevenlabs/post-call; calls; transcripts'; data='ProviderEvent; CanonicalTranscript; TranscriptSegment; CallSummary'; control='signature; replay; idempotency; redaction; provenance'; test='webhook duplicate/out-of-order + canonical pipeline'; metric='webhook lag; artifact completion; redaction'; evidence='raw checksum + canonical versions + summary evidence'
    elif n<=77:
        domain='Intelligence and reporting'; components='intelligence; worker; admin-web'; api='analytics; reports'; data='CallFactDaily; IntentAggregate; ReportRun; Recommendation'; control='lineage; restricted views; human-reviewed recommendations'; test='aggregate/report/export tests'; metric='report health; query budget; trend coverage'; evidence='report artifact + lineage'
    else:
        domain='Operations and governance'; components='admin-web; auth; audit; config; workflows'; api='audit; retention; readiness; reconciliation'; data='AuditEvent; RetentionPolicy; DeletionJob; ReadinessEvaluation'; control='RBAC; masking; retention; server readiness'; test='browser/RBAC/retention/readiness tests'; metric='access denials; deletion success; readiness blockers'; evidence='audit + workflow + release evidence'
    return [domain, components, api, data, control, test, metric, evidence]

trace=[]
for vals in requirements:
    rid=vals[0]; req=vals[1] if len(vals)>1 else ''; acceptance=vals[2] if len(vals)>2 else ''; cls=vals[3] if len(vals)>3 else ''
    trace.append([rid,req,acceptance,cls]+map_req(rid,req))
write('requirements-architecture-traceability.csv', ['ID','Requirement','PRD acceptance evidence','Class','Architecture domain','Components','APIs/events','Data entities','Controls','Test architecture','Metrics','Architecture evidence'], trace)

write('component-catalog.csv', ['Component','Type','Responsibility','Authoritative data','Dependencies','Scale/availability','Security notes'], [
 ['admin-web','Deployable','Authenticated control, knowledge, testing, operations and intelligence UI','None','api, OIDC','Horizontal; stateless','No provider secret; server authorization'],
 ['customer-web','Deployable','Public registration and digital handoff','None','api','Horizontal; isolated public surface','Signed short-lived sessions; CSRF/abuse controls'],
 ['api','Deployable','REST APIs, provider webhooks, personalization and typed tools','Transactional commands','PostgreSQL, Redis, Temporal, integrations','Horizontal; stateless','OIDC/RBAC, signatures, rate limits, schema validation'],
 ['worker','Deployable','Durable publication, testing, enrichment, reports, retention and reconciliation','Workflow outcomes','Temporal, PostgreSQL, S3, providers','Scale by task queue','Least privilege activities; idempotent operations'],
 ['provider-simulator','Dev/CI','Deterministic ElevenLabs-compatible APIs and webhooks','Synthetic fixtures','api/worker','Local/CI only','Forbidden in production readiness'],
 ['PostgreSQL','Data','Authoritative application records, versions, events and aggregates','All domain records','RDS','HA/PITR','Encryption, access boundaries, partitioning'],
 ['Redis','Data','Ephemeral cache, locks and rate state','None','ElastiCache','HA where required','No durable PII authority'],
 ['S3','Data','Source assets, raw webhook evidence, exports and optional audio','Large/restricted objects','KMS','Versioning/lifecycle','Signed access, classification and retention'],
 ['Temporal','Platform','Durable workflows and retries','Workflow history','worker/api','Managed/HA','No secret or unnecessary PII payloads'],
 ['ElevenLabs adapter','Package','Provider API mapping, capability detection, signatures, reconciliation','Provider mapping only','ElevenLabs','Circuit breakers/retries','No provider DTO leakage; redacted logs'],
 ['Knowledge service','Package','Authoritative content lifecycle and release manifests','Knowledge records','S3, provider adapter','Worker-scaled','Two-person approval for high risk'],
 ['Intelligence service','Package','Canonical transcript enrichment, trends and reports','Derived intelligence','PostgreSQL, workflow','Async scalable','Evidence-linked output, restricted cases'],
])

write('integration-matrix.csv', ['Integration','Direction','Purpose','Authentication','Data classification','Timeout/retry','Fallback','Owner'], [
 ['ElevenLabs agent/knowledge/voice/test APIs','QP -> ElevenLabs','Configure, test, publish and reconcile runtime artifacts','Scoped API key in secret manager','Internal/Confidential','Bounded retry, rate aware','Queue/reconcile; never fake success','Platform owner'],
 ['ElevenLabs post-call webhook','ElevenLabs -> QP','Deliver provider transcript and metadata','HMAC/signature + replay validation','Confidential/Restricted','Fast ACK; durable inbox','Replay/reconciliation','Platform owner'],
 ['Inbound personalization','ElevenLabs -> QP','Provide minimum call-start context','Provider verification','Confidential','Strict low latency; no unbounded retry','No context / general greeting','Customer systems owner'],
 ['Typed webhook tools','ElevenLabs <-> QP','Authoritative facts and approved actions','Signed/authenticated endpoint','Public to Restricted by tool','Tool-specific timeout/circuit breaker','Safe unavailable result/handoff','Domain owner'],
 ['Customer system','QP <-> Customer','Lookup and create/update allowed customer records','Approved service auth','Confidential','Bounded retry','No match/unavailable','CRM owner'],
 ['Booking system','QP -> Booking','Read booking/availability; approved writes gated','Approved service auth','Confidential','Short timeout; read-only default','Digital link/human','Booking owner'],
 ['Zendesk','QP <-> Zendesk','Read cross-channel context and optional tasks/tickets','OAuth/service auth','Confidential','Bounded retry','Continue without context / task backlog','Support owner'],
 ['WhatsApp/SMS','QP <-> Provider','Links, summaries, receipts and fallback','Provider API auth + signed status webhook','Confidential','Bounded retry + SMS fallback','Staff task','Operations owner'],
 ['OIDC','Browser/API <-> IdP','Authentication, MFA and identity claims','OIDC/OAuth2','Confidential','Fail closed','No access','Security owner'],
])

write('rbac-roles.csv', ['Role','Key permissions','Restricted from','Separation-of-duties notes'], [
 ['Platform Owner','Provider connection, system configuration, readiness, emergency rollback','Routine transcript access unless separately granted','Cannot self-approve high-risk content by default'],
 ['Agent Administrator','Draft agent/prompt/tool/transfer/voice configuration; run tests','Raw provider secrets; sensitive call details','Publisher/approver separate for production'],
 ['Knowledge Editor','Create and edit knowledge drafts, link tests','Publish high-risk content','Cannot approve own high-risk version'],
 ['Knowledge Approver','Review and approve scoped knowledge','Provider credentials','Must be independent of author for high risk'],
 ['QA Reviewer','Create suites, review runs and sampled calls','Provider secret management','Critical language tests require human evidence'],
 ['Operations Manager','Calls, tasks, callbacks, queues, reports','Agent publication unless granted','Sensitive clearance separate'],
 ['Customer Service Operator','Assigned calls/tasks/callbacks and permitted context','Bulk export, configuration, sensitive calls by default','Purpose-based access'],
 ['Analyst / Executive','Aggregates, reports and masked drill-down','Raw sensitive transcript/audio','Export separately audited'],
 ['Privacy / Security Auditor','Audit, retention, deletion, incident and access review','Business configuration mutation','Read-only independent oversight'],
 ['Restricted Vendor Administrator','External account/billing/bootstrap exceptions','Normal operations unless separately granted','Use only when API does not support function'],
])

write('data-classification.csv', ['Class','Examples','Access','Encryption/masking','Default retention posture'], [
 ['PUBLIC','Published park facts, public links','All callers/users as relevant','Integrity controls','Until superseded/archived'],
 ['INTERNAL','Agent configuration metadata, operational metrics','Authorized staff','At rest/in transit','Business policy'],
 ['CONFIDENTIAL','Phone, email, booking context, transcript, support history','Purpose-based roles','Encryption + field masking','Minimum approved period'],
 ['RESTRICTED','Sensitive calls, safeguarding, payment incidents, custom voice consent, raw webhooks','Special clearance','Separate/restricted storage, audited access','Shortest lawful period or legal hold'],
])

write('api-inventory.csv', ['API group','Representative endpoints','Caller','Authorization','Idempotency','Primary controls'], [
 ['Provider administration','/v1/provider-connections; /capabilities','Admin UI','Platform Owner','Mutation key','Secret reference, scope, capability check'],
 ['Agent control','/v1/agents; /agent-versions; /agent-releases','Admin UI/worker','Agent Admin/Approver','Required for publish/rollback','Release compiler and gates'],
 ['Knowledge','/v1/knowledge; /knowledge-releases','Admin UI/worker','Editor/Approver','Required for publish','Risk approval, checksums, effective dates'],
 ['Voices','/v1/voices; /custom-voices','Admin UI/worker','Agent Admin/Voice Approver','Required for custom operation','Consent, ownership, fallback'],
 ['Testing','/v1/test-suites; /test-runs','Admin UI/worker','QA/Admin','Run command key','Versioned tests, repeated runs, evidence'],
 ['Provider webhooks','/v1/webhooks/elevenlabs/post-call','ElevenLabs','Signature','Provider event/conversation','Replay, size, schema, inbox'],
 ['Personalization','/v1/elevenlabs/personalization/inbound-call','ElevenLabs','Provider verification','Call identifier','Minimum data, match states'],
 ['Business tools','/v1/elevenlabs/tools/{toolKey}','ElevenLabs','Provider/tool auth','Tool-specific','Schema, purpose, verification, allowlist'],
 ['Calls/intelligence','/v1/calls; /transcripts; /summaries; /analytics','Admin UI','RBAC/purpose','Corrections/export keys','Masking, provenance, query budgets'],
 ['Governance','/v1/audit; /retention; /readiness; /reconciliation','Admin UI/worker','Special roles','Command key','Immutable audit, server-computed gates'],
])

write('domain-event-inventory.csv', ['Event','Aggregate','Purpose','Classification','Primary consumers'], [
 ['ProviderConnected','ProviderWorkspace','Record verified connection and capabilities','INTERNAL','Readiness, audit'],
 ['AgentPublicationRequested','AgentReleaseManifest','Start durable publication','INTERNAL','Agent publish workflow'],
 ['AgentPublished','AgentReleaseManifest','Record remote verification and activation','INTERNAL','UI, readiness, monitoring'],
 ['AgentDriftDetected','ProviderObjectMapping','Record remote/local mismatch','INTERNAL','Alert, reconciliation'],
 ['KnowledgePublished','KnowledgeRelease','Record verified provider knowledge release','INTERNAL','Agent compiler, audit'],
 ['TestRunCompleted','TestRun','Store results and release evidence','INTERNAL','Release gate, QA'],
 ['PostCallWebhookReceived','CallSession','Record verified provider event','CONFIDENTIAL','Post-call workflow'],
 ['CanonicalTranscriptCreated','CanonicalTranscript','Complete normalized call record','CONFIDENTIAL','Summary, classification, UI'],
 ['CallSummaryCreated','CallSummary','Store evidence-linked summary','CONFIDENTIAL','History, tasks, reporting'],
 ['SensitiveCallDetected','CallSession','Apply restricted handling','RESTRICTED','Restricted workflow, alert'],
 ['KnowledgeGapDetected','KnowledgeGap','Create human-reviewed improvement candidate','INTERNAL','Knowledge backlog'],
 ['ReportGenerated','ReportRun','Publish report artifact and lineage','INTERNAL/RESTRICTED','Recipients, audit'],
 ['DeletionCompleted','DeletionJob','Record deletion evidence','RESTRICTED','Privacy audit'],
 ['ReadinessChanged','ReadinessEvaluation','Record computed lifecycle transition','INTERNAL','Dashboard, deployment gate'],
])

write('guardrail-control-matrix.csv', ['Risk','Preventive control','Detective control','Corrective control','Blocking test'], [
 ['Stable fact hallucination','Approved effective knowledge only','Source/version and confidence audit','Safe fallback + knowledge gap','Factual launch set'],
 ['Dynamic fact hallucination','Typed authoritative tool required','Tool/result provenance','Correct record and retrain test, not model','Tool contract scenarios'],
 ['False action completion','Success claim allowed only after SUCCESS result','Claim/result consistency evaluator','Correction + task/incident','No-false-completion corpus'],
 ['Prompt injection','Policy hierarchy; retrieved text treated as data','Injection classifier and audit','Quarantine source; revise parser/policy','Caller/document injection suite'],
 ['Arbitrary tool or URL','Code-owned registry and link allowlist','Rejected invocation metric','Disable release/tool','Tool abuse tests'],
 ['Summary hallucination','Evidence-linked atomic facts and schema','Claim coverage evaluator','Human correction/version','Summary evidence suite'],
 ['Unreviewed learning','No automatic knowledge/prompt publication','Release provenance audit','Withdraw/rollback','Release gate tests'],
 ['Provider drift','Read-back checksums and reconciliation','Scheduled drift scan','Re-publish or incident','Drift injection tests'],
 ['Payment data retention','Agent interruption + post-call DLP/redaction','Restricted incident metric','Redact/delete/provider incident','Payment adversarial corpus'],
 ['Sensitive mishandling','Sensitive scripts, offer suppression, restricted route','QA sampling and SLA alerts','Escalation/incident','Sensitive routing corpus'],
])

write('nfr-slo-matrix.csv', ['Quality attribute','Proposed SLI/SLO','Measurement','Alert/response'], [
 ['Webhook availability','99.9% successful verified acknowledgement during service periods','Synthetic webhook + server metrics','Page on sustained failure'],
 ['Webhook processing lag','P95 under 60 seconds to canonical workflow start','Inbox/Temporal timestamps','Warn/page by threshold'],
 ['Provider publication reliability','At least 99% successful after safe retries in staging','Workflow result','Create reconciliation work'],
 ['Call artifact completion','At least 95% eligible calls have transcript, summary, class and outcome','Daily aggregate','Backlog alert'],
 ['Grounded answer quality','At least 90% approved launch set, zero critical policy errors','Test Studio','Block release'],
 ['Sensitive routing','100% critical corpus pass','Regression suite','Block release'],
 ['Payment exclusion','100% adversarial corpus pass; zero retained test PAN','Security suite','Block release/incident'],
 ['Dashboard performance','P95 common views under 2 seconds on target data set','APM/browser timings','Query review/autoscale'],
 ['Accessibility','WCAG 2.2 AA automated checks and manual critical-flow review','axe/Playwright/manual','Block release for critical defects'],
 ['Recovery','RPO/RTO approved and restore demonstrated','DR exercise','Readiness block'],
])

write('risk-register.csv', ['ID','Risk','Impact','Likelihood','Mitigation','Indicator','Owner'], [
 ['R-01','Required ElevenLabs API capability unavailable at account tier','Control-plane gap','Medium','Capability registry; external boundary; no fake success','CAPABILITY_UNSUPPORTED','Platform owner'],
 ['R-02','Remote edits create drift','Unsafe/unreviewed runtime','Medium','Restrict console; scheduled reconciliation; block release','Drift findings','Agent admin'],
 ['R-03','Post-call webhook delayed or missing','Incomplete history/intelligence','Medium','Inbox, replay, conversation reconciliation, alerts','Artifact lag/completion','SRE'],
 ['R-04','Provider transcript inaccurate','Bad summaries/trends','Medium','Quality flags, corrections, selective QA/retranscription option','Correction/low-quality rate','QA lead'],
 ['R-05','Stale/conflicting knowledge published','Incorrect caller answers','Medium','Effective dates, conflicts, owners, tests, rollback','Stale/conflict metric','Knowledge owner'],
 ['R-06','Summary or classification hallucinates','False history/reporting','Medium','Evidence-linked schema, deterministic outcomes, review','Unsupported claim rate','Data/QA lead'],
 ['R-07','Sensitive or payment data retained','Privacy/security incident','Low/High impact','Provider settings, DLP, redaction, restricted access, tests','Incident count','Privacy/Security'],
 ['R-08','Vendor dependency/cost change','Operational or budget risk','Medium','Adapter, exportable local master, cost alerts, contract review','Cost/capability trend','Executive owner'],
 ['R-09','Customer/booking API unavailable','Reduced personalization','High','Typed unavailable states, safe general service, digital/human path','Integration error rate','System owner'],
 ['R-10','Custom voice lacks valid consent','Legal/reputation risk','Low','Restricted workflow, evidence, two-person approval, revocation','Missing consent check','Legal/Platform'],
])

write('open-decisions.csv', ['ID','Decision','Options/considerations','Required owner','Blocking stage'], [
 ['D-01','Telephone routing and transfer model','Native provider route, Twilio, SIP, Vodafone forwarding; transfer capability tradeoffs','Telecom/Operations','Production approval'],
 ['D-02','ElevenLabs workspace tier and capabilities','Agent/KB/test/voice/webhook/privacy features','Platform owner','Staging integration'],
 ['D-03','EU residency, ZRM, retention and audio','Processing/storage/contractual posture','Privacy/Legal','Production approval'],
 ['D-04','Optional audio ingestion','None, sampled QA, sensitive exclusion, broader retention','Privacy/QA','Production approval'],
 ['D-05','Verification policy by intent','Light/strong/operator-only factors','Operations/Privacy','Tool activation'],
 ['D-06','Human queues and SLAs','Locations, hours, languages, callback timing','Operations','Production approval'],
 ['D-07','Active languages','Portuguese/English baseline and additional packs','Business/QA','Language activation'],
 ['D-08','Custom voice policy','Ownership, consent, revocation, permitted users','Legal/Brand','Custom voice activation'],
 ['D-09','Retention values','Per data class and jurisdiction','Privacy/Legal','Production approval'],
 ['D-10','Customer/booking/Zendesk field mappings','Minimum required fields and write permissions','System owners','Live integration'],
])

write('release-gates.csv', ['Gate','Required evidence','Blocking conditions'], [
 ['Architecture conformance','Dependency checks, ADRs, no media gateway, local-master mappings','Provider DTO leakage, custom live runtime, browser secrets'],
 ['Agent release','Critical tests, approvals, release manifest, provider read-back','Failed critical test, draft/expired dependency, drift'],
 ['Knowledge release','Approvals, checksums, effective dates, conflict scan, regression tests','High-risk single approval, stale/conflicting content'],
 ['Voice activation','Availability, preview, language QA, fallback; consent for custom','Unavailable voice, missing approval/consent'],
 ['Tool activation','Schema, auth, verification, contract/security tests','Unknown fields, excessive data, false success'],
 ['Post-call pipeline','Signed/idempotent webhook, canonical transcript, evidence summary','Signature/replay failure, unsupported summary claim'],
 ['Production deployment','Security, migrations, backup/restore, monitoring, readiness','Critical/high issue, synthetic/local dependency'],
 ['Production activation','Live provider/telephony/message validation, approvals, rollback','External onboarding or legal/privacy gaps'],
])

write('provider-capability-matrix.csv', ['Capability','Required use','Local owner','Runtime copy','Readiness treatment'], [
 ['Agent configuration/versioning','Create/update/publish/rollback receptionist','AgentVersion/ReleaseManifest','ElevenLabs agent/version','Must be verified; alternative mapping documented'],
 ['Knowledge text/file/URL','Publish approved company knowledge','KnowledgeVersion/Release','ElevenLabs KB documents','Must be verified and reconciled'],
 ['Voice catalogue/preview','Select and assign voices in-app','VoiceCatalogue/Assignment','ElevenLabs voice IDs','Unavailable voice blocks release'],
 ['Custom voice','Approved company voice workflow','Consent/Approval records','ElevenLabs custom voice','Activation gated and restricted'],
 ['Agent tests/simulation','In-app regression testing','TestSuite/TestRun','Provider tests/runs','Provider + internal evaluation required'],
 ['Inbound personalization','Call-start context','Personalization policy/snapshot','Dynamic variables/overrides','Minimum data; route dependent'],
 ['Webhook tools','Authoritative business lookups/actions','ToolDefinition/Version','Provider tool IDs','Typed, authorized, tested'],
 ['Post-call transcript webhook','Call history input','Raw ProviderEvent','Provider webhook payload','Signed, replay safe, reconciled'],
 ['Privacy/retention/ZRM/residency','Provider data governance','SystemConfiguration/Approval','Provider settings/contract','Explicit production gate'],
 ['Telephony transfer','Human handoff','TransferPolicy/Handoff','Provider telephony configuration','Validate selected route capability'],
])

print(f'wrote {len(requirements)} requirements and matrices')
