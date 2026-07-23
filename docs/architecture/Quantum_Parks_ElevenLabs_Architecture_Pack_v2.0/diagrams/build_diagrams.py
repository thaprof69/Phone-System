from pathlib import Path
import subprocess

OUT=Path(__file__).parent

def render(name, body):
    dot=f'''digraph G {{
      graph [rankdir=LR, bgcolor="white", pad="0.3", nodesep="0.45", ranksep="0.65", fontname="Arial"];
      node [shape=box, style="rounded,filled", fillcolor="#F5F8FC", color="#345B7E", fontname="Arial", fontsize=10, margin="0.16,0.10"];
      edge [color="#61788C", fontname="Arial", fontsize=9, arrowsize=0.75];
      {body}
    }}'''
    dot_path=OUT/f'{name}.dot'
    png_path=OUT/f'{name}.png'
    dot_path.write_text(dot, encoding='utf-8')
    subprocess.run(['dot','-Tpng','-Gdpi=180',str(dot_path),'-o',str(png_path)],check=True)

render('01-architecture-at-a-glance', r'''
  caller [label="Caller", fillcolor="#FFF4DE"];
  route [label="Telephone route\nVodafone / Twilio / SIP", fillcolor="#FFF4DE"];
  el [label="ElevenLabs managed runtime\nLive voice agent\nSpeech + turn management\nKnowledge + tools + transfer", fillcolor="#E8F3FF"];
  qp [label="Quantum Parks platform\nControl + knowledge + testing\nCanonical history + intelligence", fillcolor="#EAF7EE"];
  systems [label="Customer / Booking / Zendesk\nMessaging / OIDC", fillcolor="#F2EDFF"];
  caller -> route -> el;
  el -> qp [label="APIs, tools, signed webhooks"];
  qp -> el [label="approved agent, knowledge, tests, voices"];
  qp -> systems [dir=both, label="controlled integrations"];
''')

render('02-system-context', r'''
  users [label="Quantum Parks users\nAdmins, editors, QA, operators, analysts", fillcolor="#FFF4DE"];
  app [label="Quantum Parks application\nExclusive normal-user interface", fillcolor="#EAF7EE"];
  el [label="ElevenLabs", fillcolor="#E8F3FF"];
  caller [label="Caller", fillcolor="#FFF4DE"];
  tel [label="Telephone route", fillcolor="#F2EDFF"];
  cust [label="Customer system"];
  book [label="Booking system"];
  zen [label="Zendesk / support"];
  msg [label="WhatsApp / SMS"];
  idp [label="OIDC identity provider"];
  users -> app;
  app -> el [dir=both, label="control APIs / webhooks"];
  caller -> tel -> el;
  app -> cust [dir=both]; app -> book [dir=both]; app -> zen [dir=both]; app -> msg [dir=both]; app -> idp [dir=both];
''')

render('03-container-architecture', r'''
  subgraph cluster_qp { label="Quantum Parks platform"; color="#8DB3D3"; style="rounded";
    admin [label="admin-web\nControl + intelligence UI", fillcolor="#EAF7EE"];
    customer [label="customer-web\nRegistration + digital handoff", fillcolor="#EAF7EE"];
    api [label="api\nREST + webhooks + tools", fillcolor="#EAF7EE"];
    worker [label="worker\nTemporal workflows", fillcolor="#EAF7EE"];
    sim [label="provider-simulator\nLocal + CI", fillcolor="#F8F8F8"];
    db [label="PostgreSQL\nAuthoritative data", shape=cylinder, fillcolor="#FFF4DE"];
    redis [label="Redis\nEphemeral state", shape=cylinder, fillcolor="#FFF4DE"];
    s3 [label="S3\nDocuments + evidence", shape=cylinder, fillcolor="#FFF4DE"];
    temporal [label="Temporal\nDurable orchestration", fillcolor="#F2EDFF"];
    admin -> api; customer -> api; api -> db; api -> redis; api -> s3; api -> temporal; worker -> temporal; worker -> db; worker -> s3; sim -> api [style=dashed];
  }
  el [label="ElevenLabs", fillcolor="#E8F3FF"];
  ext [label="Customer / Booking / Zendesk / Messaging", fillcolor="#F2EDFF"];
  api -> el [dir=both]; worker -> el [dir=both]; api -> ext [dir=both]; worker -> ext [dir=both];
''')

render('04-agent-control-sync', r'''
  draft [label="Draft local agent version"];
  review [label="Review + approval"];
  compile [label="Release compiler\nResolve prompt, knowledge, voice, tools"];
  test [label="Required test suites"];
  publish [label="Durable publish workflow"];
  provider [label="ElevenLabs runtime copy", fillcolor="#E8F3FF"];
  verify [label="Read-back + checksum verification"];
  active [label="Active release", fillcolor="#EAF7EE"];
  drift [label="Reconciliation + drift detection", fillcolor="#FFF4DE"];
  draft -> review -> compile -> test -> publish -> provider -> verify -> active;
  active -> drift -> provider [style=dashed];
  drift -> review [label="drift / correction", style=dashed];
''')

render('05-knowledge-lifecycle', r'''
  source [label="Author / upload / URL / structured source"];
  scan [label="Scan + extract + sanitize"];
  metadata [label="Scope + owner + risk + effective dates"];
  review [label="Review + approval\n2-person for high risk"];
  release [label="Immutable knowledge release manifest"];
  publish [label="Publish to ElevenLabs"];
  verify [label="Read-back + dependency verification"];
  tests [label="Knowledge regression tests"];
  active [label="Active runtime copy", fillcolor="#EAF7EE"];
  source -> scan -> metadata -> review -> release -> publish -> verify -> tests -> active;
  gap [label="Knowledge gap candidates\nfrom calls + corrections", fillcolor="#FFF4DE"];
  gap -> source [label="human-authored draft", style=dashed];
''')

render('06-test-release-lifecycle', r'''
  case [label="Versioned test cases"];
  candidate [label="Candidate agent release"];
  provider [label="ElevenLabs tests / simulation", fillcolor="#E8F3FF"];
  internal [label="Quantum Parks evaluators\nPolicy + facts + tool + evidence"];
  human [label="Human language / high-risk review"];
  gate [label="Server-enforced release gate"];
  publish [label="Publish + verify", fillcolor="#EAF7EE"];
  fail [label="Fail + defect + revise", fillcolor="#FFEAEA"];
  case -> provider; candidate -> provider; provider -> internal -> human -> gate;
  gate -> publish [label="pass"];
  gate -> fail [label="fail"];
  fail -> candidate [style=dashed];
''')

render('07-live-call-runtime-integration', r'''
  caller [label="Caller", fillcolor="#FFF4DE"];
  el [label="ElevenLabs voice agent\nLive conversation", fillcolor="#E8F3FF"];
  pers [label="QP inbound personalization\nMinimum permitted context", fillcolor="#EAF7EE"];
  tools [label="QP typed business tools\nVerification + authorization", fillcolor="#EAF7EE"];
  systems [label="Customer / Booking / Zendesk", fillcolor="#F2EDFF"];
  human [label="Human queue / callback"];
  caller -> el;
  el -> pers [dir=both, label="call start"];
  el -> tools [dir=both, label="authoritative facts/actions"];
  tools -> systems [dir=both];
  el -> human [label="configured transfer"];
''')

render('08-post-call-intelligence', r'''
  el [label="ElevenLabs signed post-call webhook", fillcolor="#E8F3FF"];
  ingest [label="Verify + deduplicate + archive raw evidence"];
  canon [label="Normalize + redact + canonical transcript"];
  facts [label="Evidence-linked facts\nTrusted events + transcript segments"];
  enrich [label="Summary + taxonomy + outcome + quality"];
  link [label="Customer / booking / support linkage"];
  ops [label="Tasks + callbacks + messages"];
  agg [label="Incremental facts + aggregates"];
  ui [label="History + dashboards + reports", fillcolor="#EAF7EE"];
  el -> ingest -> canon -> facts -> enrich;
  enrich -> link; enrich -> ops; enrich -> agg; link -> ui; ops -> ui; agg -> ui;
''')

render('09-data-domains', r'''
  provider [label="Provider + mappings"];
  agent [label="Agents + releases"];
  knowledge [label="Knowledge + approvals"];
  voice [label="Voices + consent"];
  tests [label="Tests + evidence"];
  calls [label="Calls + canonical transcripts"];
  context [label="Customer / booking / support snapshots"];
  ops [label="Tasks + callbacks + messages"];
  intel [label="Facts + aggregates + reports"];
  gov [label="Audit + retention + readiness"];
  provider -> agent; agent -> knowledge; agent -> voice; agent -> tests; agent -> calls;
  calls -> context; calls -> ops; calls -> intel; provider -> gov; knowledge -> gov; tests -> gov; calls -> gov;
''')

render('10-guardrail-stack', r'''
  safety [label="1. Immutable safety / privacy / payment / verification", fillcolor="#FFEAEA"];
  business [label="2. Approved business policy"];
  role [label="3. Agent role / tone / language"];
  kb [label="4. Approved knowledge release"];
  tools [label="5. Typed tool registry + explicit results"];
  vars [label="6. Minimum dynamic variables"];
  untrusted [label="7. Caller speech / tickets / documents\nUNTRUSTED DATA", fillcolor="#FFF4DE"];
  validate [label="Schema validation + deterministic post-policy", fillcolor="#EAF7EE"];
  safety -> business -> role -> kb -> tools -> vars -> untrusted -> validate;
''')

render('11-security-boundaries', r'''
  browser [label="Browser\nNo provider secrets", fillcolor="#FFF4DE"];
  api [label="QP API\nOIDC + RBAC + purpose + validation", fillcolor="#EAF7EE"];
  secrets [label="Secrets Manager", fillcolor="#F2EDFF"];
  el [label="ElevenLabs API / webhooks", fillcolor="#E8F3FF"];
  tools [label="Typed tool endpoints\nSignature + rate + field allowlists"];
  data [label="Encrypted data stores\nClassification + retention", shape=cylinder];
  audit [label="Protected audit + evidence"];
  browser -> api;
  api -> secrets;
  api -> el [dir=both];
  el -> tools [dir=both];
  tools -> data; api -> data; api -> audit; tools -> audit;
''')

render('12-aws-deployment', r'''
  internet [label="Users / ElevenLabs / messaging", fillcolor="#FFF4DE"];
  waf [label="WAF + ALB"];
  admin [label="ECS admin-web"];
  customer [label="ECS customer-web"];
  api [label="ECS api"];
  worker [label="ECS worker"];
  rds [label="RDS PostgreSQL", shape=cylinder];
  redis [label="ElastiCache Redis", shape=cylinder];
  s3 [label="S3 + KMS", shape=cylinder];
  secrets [label="Secrets Manager"];
  temporal [label="Temporal Cloud / approved cluster", fillcolor="#F2EDFF"];
  obs [label="OTel + logs + metrics + alarms"];
  internet -> waf; waf -> admin; waf -> customer; waf -> api;
  admin -> api; customer -> api; api -> rds; api -> redis; api -> s3; api -> secrets; api -> temporal;
  worker -> rds; worker -> s3; worker -> temporal; api -> obs; worker -> obs;
''')

render('13-ci-cd-release', r'''
  commit [label="Commit / pull request"];
  quality [label="Format + lint + type + architecture rules"];
  tests [label="Unit + integration + provider contracts + E2E"];
  security [label="SAST + secrets + dependencies + SBOM + IaC"];
  build [label="Build + non-root containers"];
  stage [label="Staging deployment"];
  synthetic [label="Synthetic ElevenLabs + webhook + report tests"];
  approve [label="Manual production approval"];
  deploy [label="Progressive application rollout", fillcolor="#EAF7EE"];
  agent [label="Separate governed agent release", fillcolor="#E8F3FF"];
  commit -> quality -> tests -> security -> build -> stage -> synthetic -> approve -> deploy;
  approve -> agent [label="when agent artifacts change"];
''')

render('14-reconciliation-state', r'''
  draft [label="LOCAL_DRAFT"];
  approved [label="LOCAL_APPROVED"];
  pending [label="PUBLISH_PENDING"];
  sync [label="IN_SYNC", fillcolor="#EAF7EE"];
  drift [label="DRIFTED", fillcolor="#FFF4DE"];
  missing [label="REMOTE_MISSING", fillcolor="#FFEAEA"];
  failed [label="PUBLISH_FAILED", fillcolor="#FFEAEA"];
  rollback [label="ROLLBACK_PENDING"];
  blocked [label="EXTERNALLY_BLOCKED", fillcolor="#F2EDFF"];
  draft -> approved -> pending -> sync;
  pending -> failed; pending -> blocked;
  sync -> drift; sync -> missing;
  drift -> pending [label="reconcile"];
  missing -> pending [label="recreate"];
  failed -> pending [label="retry"];
  sync -> rollback -> pending;
''')
print('diagrams built')
