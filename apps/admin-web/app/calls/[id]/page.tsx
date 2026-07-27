import Link from 'next/link';
import {
  Banner,
  Breadcrumbs,
  DefinitionList,
  EmptyState,
  ErrorState,
  JsonInspector,
  PageHeading,
  Panel,
  StatusPill,
  SyntheticBadge,
  Tabs,
  TechnicalDetails,
  formatDateTime,
  formatDuration,
  formatPercent,
  humaniseState,
  toneForState,
} from '@quantum-parks/ui';
import { AppShell } from '../../shell';
import { apiGet } from '../../../lib/api';
import { ProposeCorrectionForm, type CorrectionTarget } from '../call-actions';

export const dynamic = 'force-dynamic';

type CallDetail = {
  id: string;
  processingState: string;
  language: string | null;
  park: string | null;
  sensitive: boolean;
  synthetic: boolean;
  providerConversationId: string;
  providerAgentId: string;
  providerBranchId: string | null;
  providerVersionId: string | null;
  providerMetadata: Record<string, unknown> | null;
  providerAnalysisMetadata: Record<string, unknown> | null;
  transcriptRevision: {
    id: string;
    revision: number;
    revisionType: string;
    reason: string;
    createdAt: string;
  } | null;
  transcriptTurns: Array<{
    id: string;
    sequence: number;
    speaker: string;
    content: string;
    startedAtMs: number | null;
    classification: string;
  }>;
  summaries: Array<{
    id: string;
    summary: Record<string, unknown>;
    provider: string;
    model: string;
    promptVersion: string;
    schemaVersion: string;
    evidenceCoverage: string;
    createdAt: string;
  }>;
  classifications: Array<{
    id: string;
    primaryIntent: string;
    secondaryIntents: string[];
    taxonomyVersion: string;
    provider: string;
    model: string;
    confidence: string;
    evidenceIds: string[];
  }>;
  deterministicOutcomes: Array<{
    id: string;
    outcome: string;
    evidenceIds: string[];
    policyVersion: string;
    createdAt: string;
  }>;
  toolInvocations: Array<{
    id: string;
    registryKey: string;
    resultStatus: string;
    verificationState: string;
    requestedAt: string;
    completedAt: string | null;
  }>;
  evidenceArtifacts: Array<{
    id: string;
    providerKey: string;
    modelId: string;
    promptVersionId: string;
    schemaVersionId: string;
    resultState: string;
    intelligenceState: string;
    confidence: string | null;
    fallbackUsed: boolean;
    generatedAt: string;
  }>;
  entities: Array<{
    id: string;
    classificationId: string;
    entityType: string;
    value: string;
    confidence: string;
    evidenceIds: string[];
  }>;
  manifest: {
    id: string;
    status: string;
    expectedArtifactCount: number;
    presentArtifactCount: number;
    completenessRatio: string;
    processingProfileVersion: number;
    warnings: string[];
    processingCompletedAt: string;
  } | null;
};

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = await apiGet<CallDetail>(`/calls/${encodeURIComponent(id)}`, {
    purpose: 'QUALITY_REVIEW',
  });

  if (!response.ok) {
    return (
      <AppShell>
        <Breadcrumbs trail={[{ label: 'Calls', href: '/calls' }, { label: 'Call' }]} />
        <PageHeading eyebrow="Call" title="Call record" />
        <ErrorState detail={response.reason} />
      </AppShell>
    );
  }

  const call = response.data;
  const summary = call.summaries[0];
  const classification = call.classifications[0];
  const outcome = call.deterministicOutcomes[0];

  // A correction targets whichever artefacts this specific call actually has. Offering
  // a target that does not exist here would be refused server-side anyway, but naming
  // only the real ones is what the operator actually needs to choose between.
  const correctionTargets: CorrectionTarget[] = [
    ...(call.transcriptRevision
      ? [
          {
            value: `${call.transcriptRevision.revisionType === 'REDACTED' ? 'REDACTED_TRANSCRIPT' : 'CANONICAL_TRANSCRIPT'}:${call.transcriptRevision.id}`,
            label: `Transcript (${humaniseState(call.transcriptRevision.revisionType)})`,
            recordId: call.transcriptRevision.id,
          },
        ]
      : []),
    ...(summary
      ? [{ value: `SUMMARY:${summary.id}`, label: 'Summary', recordId: summary.id }]
      : []),
    ...(classification
      ? [
          {
            value: `CLASSIFICATION:${classification.id}`,
            label: 'Classification',
            recordId: classification.id,
          },
        ]
      : []),
  ];

  const durationSeconds =
    typeof call.providerMetadata?.call_duration_secs === 'number'
      ? call.providerMetadata.call_duration_secs
      : null;

  type Claim = { text: string; evidence_ids: string[] };
  const summaryBody = summary?.summary as
    | {
        purpose?: Claim;
        caller_requests?: Claim[];
        unresolved_items?: Claim[];
        unconfirmed_requests?: Claim[];
        evidence_coverage?: number;
      }
    | undefined;

  return (
    <AppShell>
      <Breadcrumbs
        trail={[{ label: 'Calls', href: '/calls' }, { label: `Call ${call.id.slice(0, 8)}` }]}
      />
      <PageHeading
        eyebrow="Canonical call record"
        title={summaryBody?.purpose?.text ?? `Call ${call.id.slice(0, 8)}`}
        description={`${titleCase(call.park)} · ${(call.language ?? '—').toUpperCase()} · ${formatDuration(durationSeconds)}`}
        meta={
          <>
            <StatusPill tone={toneForState(call.processingState)}>
              {humaniseState(call.processingState)}
            </StatusPill>
            {outcome ? (
              <StatusPill tone={toneForState(outcome.outcome)}>
                {humaniseState(outcome.outcome)}
              </StatusPill>
            ) : null}
            {call.sensitive ? <StatusPill tone="warning">Sensitive</StatusPill> : null}
            {call.synthetic ? <SyntheticBadge /> : null}
          </>
        }
        actions={
          <Link className="button secondary" href="/calls">
            Back to calls
          </Link>
        }
      />

      {call.processingState !== 'COMPLETED' ? (
        <Banner
          tone={call.processingState.startsWith('FAILED') ? 'danger' : 'warning'}
          title={
            call.processingState.startsWith('FAILED')
              ? 'This call did not finish processing'
              : 'This call is only partly processed'
          }
          action={
            <Link className="button ghost small" href="/calls/reconciliation">
              Reconciliation
            </Link>
          }
        >
          Summary, classification or outcome may be missing. The transcript below is still
          authoritative for what was said.
        </Banner>
      ) : null}

      <div className="call-layout">
        <div>
          <Panel
            title="Transcript"
            eyebrow={
              call.transcriptRevision
                ? `Revision ${call.transcriptRevision.revision} · ${humaniseState(call.transcriptRevision.revisionType)}`
                : 'No revision'
            }
            {...(call.transcriptRevision?.revisionType === 'REDACTED'
              ? {
                  description:
                    'This is the redacted revision. The canonical revision is retained separately and is not shown by default.',
                }
              : {})}
          >
            {call.transcriptTurns.length === 0 ? (
              <EmptyState
                title="No transcript available"
                detail="The redacted revision appears once the post-call workflow completes normalisation."
              />
            ) : (
              <ol className="transcript">
                {call.transcriptTurns.map((turn) => (
                  <li key={turn.id} className={`turn turn-${turn.speaker}`}>
                    <div className="turn-meta">
                      <strong>{turn.speaker === 'agent' ? 'Receptionist' : 'Caller'}</strong>
                      {turn.startedAtMs !== null ? (
                        <span>{formatDuration(Math.round(turn.startedAtMs / 1000))}</span>
                      ) : null}
                    </div>
                    <p>{turn.content}</p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="Intelligence" eyebrow="Evidence-linked, never asserted">
            <Tabs
              label="Call intelligence"
              panels={[
                {
                  value: 'summary',
                  label: 'Summary',
                  content: summaryBody ? (
                    <div className="summary-body">
                      <p className="summary-purpose">{summaryBody.purpose?.text}</p>
                      <SummaryList
                        title="Caller asked for"
                        items={summaryBody.caller_requests?.map((claim) => claim.text)}
                      />
                      <SummaryList
                        title="Left unresolved"
                        items={summaryBody.unresolved_items?.map((claim) => claim.text)}
                      />
                      <SummaryList
                        title="Commitments made"
                        items={summaryBody.unconfirmed_requests?.map((claim) => claim.text)}
                      />
                      {summary ? (
                        <p className="evidence-note">
                          Evidence coverage {formatPercent(Number(summary.evidenceCoverage))} ·
                          generated by {summary.provider} {summary.model}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <EmptyState
                      title="No summary"
                      detail="A summary is produced only when enrichment completes and the output satisfies its schema."
                    />
                  ),
                },
                {
                  value: 'classification',
                  label: 'Classification',
                  content: classification ? (
                    <DefinitionList
                      items={[
                        {
                          term: 'Primary reason',
                          value: humaniseState(classification.primaryIntent),
                        },
                        {
                          term: 'Also mentioned',
                          value:
                            classification.secondaryIntents.length > 0
                              ? classification.secondaryIntents.map(humaniseState).join(', ')
                              : 'None',
                        },
                        {
                          term: 'Confidence',
                          value: formatPercent(Number(classification.confidence)),
                        },
                        { term: 'Taxonomy', value: classification.taxonomyVersion },
                        {
                          term: 'Evidence',
                          value: `${classification.evidenceIds.length} linked transcript spans`,
                        },
                      ]}
                    />
                  ) : (
                    <EmptyState title="Not classified" detail="No classification was produced." />
                  ),
                },
                {
                  value: 'outcome',
                  label: 'Outcome',
                  content: outcome ? (
                    <>
                      <DefinitionList
                        items={[
                          { term: 'Outcome', value: humaniseState(outcome.outcome) },
                          { term: 'Policy version', value: outcome.policyVersion },
                          { term: 'Determined at', value: formatDateTime(outcome.createdAt) },
                        ]}
                      />
                      <p className="evidence-note">
                        Outcomes are derived from persisted tool results, transfers and delivery
                        receipts. They are never asserted by a model.
                      </p>
                    </>
                  ) : (
                    <EmptyState
                      title="No outcome recorded"
                      detail="Processing did not reach the outcome stage."
                    />
                  ),
                },
                {
                  value: 'tools',
                  label: 'Tool calls',
                  badge: call.toolInvocations.length,
                  content:
                    call.toolInvocations.length === 0 ? (
                      <EmptyState
                        title="No tools were called"
                        detail="This call was answered from approved knowledge alone."
                      />
                    ) : (
                      <ul className="tool-list">
                        {call.toolInvocations.map((tool) => (
                          <li key={tool.id}>
                            <div>
                              <strong>{humaniseState(tool.registryKey)}</strong>
                              <span>{formatDateTime(tool.requestedAt)}</span>
                            </div>
                            <StatusPill tone={toneForState(tool.resultStatus)}>
                              {humaniseState(tool.resultStatus)}
                            </StatusPill>
                          </li>
                        ))}
                      </ul>
                    ),
                },
                {
                  value: 'evidence',
                  label: 'Evidence',
                  badge: call.evidenceArtifacts.length,
                  content:
                    call.evidenceArtifacts.length === 0 ? (
                      <EmptyState
                        title="No governed artefacts"
                        detail="Evidence appears once a summary or classification has been produced by a governed AI capability."
                      />
                    ) : (
                      <div className="evidence-list">
                        {call.evidenceArtifacts.map((artifact) => (
                          <DefinitionList
                            key={artifact.id}
                            items={[
                              {
                                term: 'Intelligence state',
                                value: humaniseState(artifact.intelligenceState),
                              },
                              { term: 'Result', value: humaniseState(artifact.resultState) },
                              { term: 'Provider', value: artifact.providerKey },
                              { term: 'Model', value: artifact.modelId },
                              { term: 'Prompt version', value: artifact.promptVersionId },
                              { term: 'Schema version', value: artifact.schemaVersionId },
                              {
                                term: 'Confidence',
                                value:
                                  artifact.confidence !== null
                                    ? formatPercent(Number(artifact.confidence))
                                    : '—',
                              },
                              {
                                term: 'Fallback used',
                                value: artifact.fallbackUsed ? 'Yes' : 'No',
                              },
                              { term: 'Generated', value: formatDateTime(artifact.generatedAt) },
                            ]}
                          />
                        ))}
                        {call.entities.length > 0 ? (
                          <div className="summary-section">
                            <p className="eyebrow">Extracted entities</p>
                            <ul>
                              {call.entities.map((entity) => (
                                <li key={entity.id}>
                                  {humaniseState(entity.entityType)}: {entity.value} (
                                  {formatPercent(Number(entity.confidence))})
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ),
                },
              ]}
            />
          </Panel>
        </div>

        <aside className="call-rail" aria-label="Call context">
          <Panel title="Call details" eyebrow="Context">
            <DefinitionList
              columns={1}
              items={[
                { term: 'Park', value: titleCase(call.park) },
                { term: 'Language', value: (call.language ?? '—').toUpperCase() },
                { term: 'Duration', value: formatDuration(durationSeconds) },
                { term: 'Processing', value: humaniseState(call.processingState) },
                { term: 'Handling', value: call.sensitive ? 'Sensitive' : 'Standard' },
              ]}
            />
          </Panel>

          <Panel title="Conversation intelligence" eyebrow="Canonical completeness index">
            {call.manifest ? (
              <>
                <DefinitionList
                  columns={1}
                  items={[
                    { term: 'Status', value: humaniseState(call.manifest.status) },
                    {
                      term: 'Completeness',
                      value: `${formatPercent(Number(call.manifest.completenessRatio))} (${call.manifest.presentArtifactCount} of ${call.manifest.expectedArtifactCount} required outputs)`,
                    },
                    {
                      term: 'Processing profile',
                      value: `Version ${call.manifest.processingProfileVersion}`,
                    },
                    {
                      term: 'Finalised',
                      value: formatDateTime(call.manifest.processingCompletedAt),
                    },
                  ]}
                />
                {call.manifest.warnings.length > 0 ? (
                  <ul className="tool-list">
                    {call.manifest.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <EmptyState
                title="No manifest yet"
                detail="A canonical intelligence manifest is built once the finalisation pipeline completes."
              />
            )}
          </Panel>

          <Panel title="Provider evidence" eyebrow="Kept distinct from canonical records">
            <p className="rail-note">
              The provider transcript and analysis are stored verbatim and are never edited. The
              revisions shown here are Quantum Parks records derived from them.
            </p>
            <TechnicalDetails summary="Provider metadata">
              <JsonInspector label="Provider metadata" value={call.providerMetadata} />
              <JsonInspector label="Provider analysis" value={call.providerAnalysisMetadata} />
              <dl className="technical-grid">
                <div>
                  <dt>Provider conversation</dt>
                  <dd>{call.providerConversationId}</dd>
                </div>
                <div>
                  <dt>Provider agent</dt>
                  <dd>{call.providerAgentId}</dd>
                </div>
                <div>
                  <dt>Provider version</dt>
                  <dd>{call.providerVersionId ?? '—'}</dd>
                </div>
              </dl>
            </TechnicalDetails>
          </Panel>

          <Panel
            title="Propose a correction"
            description="Reviewed independently before it changes anything. Approving records the decision permanently; it does not itself rewrite the transcript, summary or classification."
          >
            <ProposeCorrectionForm conversationId={call.id} targets={correctionTargets} />
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}

function SummaryList({ title, items }: { title: string; items: string[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="summary-section">
      <p className="eyebrow">{title}</p>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function titleCase(value: string | null): string {
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1);
}
