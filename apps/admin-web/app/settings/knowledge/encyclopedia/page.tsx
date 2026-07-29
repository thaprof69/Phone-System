import Link from 'next/link';
import {
  Banner,
  DefinitionList,
  EmptyState,
  MetricCard,
  MetricGrid,
  Panel,
  StatusPill,
  formatNumber,
  humaniseState,
  toneForState,
  type Tone,
} from '@quantum-parks/ui';
import { SettingsPage, LoadFailure } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import { ENCYCLOPEDIA_AUDIT_MARKER } from './agent-audit-config';
import { EncyclopediaAgentAudit } from './encyclopedia-agent-audit';

export const dynamic = 'force-dynamic';

type KnowledgeRow = {
  id: string;
  title: string;
  category: string;
  park: string | null;
  language: string;
  riskClass: string;
  synthetic: boolean;
  versionId: string | null;
  version: number | null;
  state: string | null;
  effectiveAt: string | null;
  expiresAt: string | null;
};

type KnowledgeVersion = {
  id: string;
  version: number;
  state: string;
  content: string;
  contentChecksum: string;
  effectiveAt: string | null;
  expiresAt: string | null;
  sync: {
    syncState: string;
    providerDocumentId: string | null;
    remoteChecksum: string | null;
    localChecksum: string;
    lastSuccessAt: string | null;
  } | null;
  assignments: Array<{
    id: string;
    active: boolean;
    language: string;
    agentVersionLabel: number | null;
  }>;
};

type KnowledgeDetail =
  | {
      status: 'FOUND';
      asset: {
        id: string;
        title: string;
        category: string;
        park: string | null;
        language: string;
        riskClass: string;
        synthetic: boolean;
      };
      liveVersionId: string | null;
      versions: KnowledgeVersion[];
    }
  | { status: 'NOT_FOUND' };

type GapRow = {
  id: string;
  title: string;
  question: string;
  frequency: number;
  language: string;
  status: string;
};

type ProviderReadinessSummary = {
  connected: boolean;
  agentVerified: boolean;
  agentVersionId: string | null;
  latestDiagnosticsStatus: 'PASS' | 'WARNING' | 'FAIL' | 'NOT_CONFIGURED' | null;
  latestDiagnosticsAt: string | null;
};

type ReceptionistSessionRow = {
  id: string;
  mode: 'VOICE' | 'TEXT';
  status: string;
  source: string;
  createdAt: string;
  endedAt: string | null;
};

type ReceptionistSessionDetail = {
  session: ReceptionistSessionRow;
  turns: Array<{ id: string; sequence: number; speaker: string; content: string }>;
};

type EncyclopediaSource = {
  id: string;
  title: string;
  category: string;
  park: string | null;
  language: string;
  riskClass: string;
  synthetic: boolean;
  state: string;
  content: string;
  syncState: string | null;
  assigned: boolean;
};

type EncyclopediaSection = {
  key: string;
  title: string;
  description: string;
  keywords: string[];
};

const sections: EncyclopediaSection[] = [
  {
    key: 'company',
    title: 'Company profile',
    description:
      'Identity, locations, offer, service model and the facts an operator expects the agent to know first.',
    keywords: [
      'company',
      'quantum parks',
      'park',
      'location',
      'services',
      'tickets',
      'membership',
      'guest',
    ],
  },
  {
    key: 'procedures',
    title: 'Procedures and operating model',
    description:
      'Approved steps, policies, escalation routes and repeatable procedures callers can ask about.',
    keywords: [
      'procedure',
      'policy',
      'sop',
      'booking',
      'refund',
      'reschedule',
      'lost property',
      'accessibility',
      'safety',
      'hours',
    ],
  },
  {
    key: 'voice',
    title: 'Voice, culture and behaviour',
    description:
      'How the receptionist should sound, what it should avoid, and the cultural cues that shape answers.',
    keywords: [
      'voice',
      'tone',
      'helpful',
      'calm',
      'culture',
      'brand',
      'concise',
      'honest',
      'language',
      'example',
    ],
  },
  {
    key: 'boundaries',
    title: 'Boundaries and protected decisions',
    description:
      'Things the agent must refuse, hand off, verify, or phrase carefully before speaking to a caller.',
    keywords: [
      'never',
      'do not',
      'no card',
      'payment',
      'capacity',
      'protected',
      'verification',
      'handoff',
      'escalation',
      'approved',
    ],
  },
  {
    key: 'journeys',
    title: 'Caller journeys',
    description:
      'Common caller intents grouped into the receptionist journeys operators need to inspect.',
    keywords: [
      'caller',
      'ticket',
      'party',
      'school',
      'group',
      'accessibility',
      'lost',
      'membership',
      'pricing',
      'weather',
    ],
  },
];

function selectVersion(detail: Extract<KnowledgeDetail, { status: 'FOUND' }>) {
  return (
    detail.versions.find((version) => version.id === detail.liveVersionId) ??
    detail.versions.find((version) =>
      ['ACTIVE', 'PUBLISHED', 'APPROVED'].includes(version.state),
    ) ??
    detail.versions[0] ??
    null
  );
}

function sentenceCandidates(content: string) {
  return content
    .replace(/\r/g, '')
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.replace(/^[-*]\s+/, '').trim())
    .filter((part) => part.length >= 28 && part.length <= 420);
}

function findStatements(sources: EncyclopediaSource[], keywords: string[], limit = 8) {
  const seen = new Set<string>();
  return sources
    .flatMap((source) =>
      sentenceCandidates(source.content)
        .map((text) => ({
          source,
          text,
          score: keywords.reduce(
            (total, keyword) => total + (text.toLowerCase().includes(keyword) ? 1 : 0),
            0,
          ),
        }))
        .filter((entry) => entry.score > 0),
    )
    .sort((left, right) => right.score - left.score)
    .filter((entry) => {
      const key = entry.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function stateTone(state: string | null): Tone {
  return toneForState(state ?? 'DRAFT');
}

function sectionCoverageTone(count: number): Tone {
  if (count >= 5) return 'good';
  if (count >= 2) return 'warning';
  return 'danger';
}

function categorySummary(sources: EncyclopediaSource[]) {
  const counts = new Map<string, number>();
  sources.forEach((source) => counts.set(source.category, (counts.get(source.category) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function latestAgentAudit(details: ReceptionistSessionDetail[]) {
  for (const detail of [...details].sort((left, right) =>
    right.session.createdAt.localeCompare(left.session.createdAt),
  )) {
    const promptIndex = detail.turns.findLastIndex(
      (turn) =>
        turn.speaker === 'USER' && turn.content.trimStart().startsWith(ENCYCLOPEDIA_AUDIT_MARKER),
    );
    if (promptIndex < 0) continue;
    const response = detail.turns
      .slice(promptIndex + 1)
      .findLast((turn) => turn.speaker !== 'USER' && turn.content.trim());
    if (response) {
      return {
        summary: response.content,
        suppliedAt: detail.session.endedAt ?? detail.session.createdAt,
      };
    }
  }
  return null;
}

export default async function CompanyEncyclopediaPage() {
  const [knowledgeResponse, gapsResponse, readinessResponse, sessionsResponse] = await Promise.all([
    apiGet<{ items: KnowledgeRow[] }>('/knowledge', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<{ items: GapRow[] }>('/knowledge-gaps', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<ProviderReadinessSummary>('/admin/integrations/elevenlabs/readiness-summary', {
      purpose: 'QUALITY_REVIEW',
    }),
    apiGet<ReceptionistSessionRow[]>('/receptionist-sessions', {
      purpose: 'QUALITY_REVIEW',
    }),
  ]);

  if (!knowledgeResponse.ok) {
    return (
      <SettingsPage
        eyebrow="Knowledge"
        title="Company encyclopedia"
        description="A structured operator-readable view of what the AI understands about the company."
      >
        <LoadFailure subject="Company encyclopedia" reason={knowledgeResponse.reason} />
      </SettingsPage>
    );
  }

  const details = await Promise.all(
    knowledgeResponse.data.items
      .filter((item) => item.versionId)
      .slice(0, 40)
      .map((item) =>
        apiGet<KnowledgeDetail>(`/knowledge/${item.id}`, { purpose: 'RELEASE_MANAGEMENT' }),
      ),
  );

  const sources = details.flatMap((detailResponse): EncyclopediaSource[] => {
    if (!detailResponse.ok || detailResponse.data.status !== 'FOUND') return [];
    const version = selectVersion(detailResponse.data);
    if (!version) return [];
    return [
      {
        id: detailResponse.data.asset.id,
        title: detailResponse.data.asset.title,
        category: detailResponse.data.asset.category,
        park: detailResponse.data.asset.park,
        language: detailResponse.data.asset.language,
        riskClass: detailResponse.data.asset.riskClass,
        synthetic: detailResponse.data.asset.synthetic,
        state: version.state,
        content: version.content,
        syncState: version.sync?.syncState ?? null,
        assigned: version.assignments.some((assignment) => assignment.active),
      },
    ];
  });

  const auditSessionDetails = sessionsResponse.ok
    ? await Promise.all(
        sessionsResponse.data
          .filter((session) => session.mode === 'TEXT')
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .slice(0, 30)
          .map((session) =>
            apiGet<ReceptionistSessionDetail | null>(`/receptionist-sessions/${session.id}`, {
              purpose: 'QUALITY_REVIEW',
            }),
          ),
      )
    : [];
  const latestAudit = latestAgentAudit(
    auditSessionDetails.flatMap((response) =>
      response.ok && response.data ? [response.data] : [],
    ),
  );
  const approvedSources = sources.filter((source) =>
    ['APPROVED', 'PUBLISHED', 'ACTIVE'].includes(source.state),
  );
  const runtimeReady = sources.filter(
    (source) =>
      ['PUBLISHED', 'ACTIVE'].includes(source.state) &&
      source.assigned &&
      ['SYNCED', 'READBACK_MATCHED'].includes(source.syncState ?? ''),
  );
  const gaps = gapsResponse.ok ? gapsResponse.data.items : [];
  const totalStatements = sections.reduce(
    (total, section) => total + findStatements(sources, section.keywords, 20).length,
    0,
  );
  const cultureSection = sections.find((section) => section.key === 'voice');
  const procedureSection = sections.find((section) => section.key === 'procedures');
  const cultureSignals = cultureSection
    ? findStatements(sources, cultureSection.keywords, 20).length
    : 0;
  const procedureSignals = procedureSection
    ? findStatements(sources, procedureSection.keywords, 20).length
    : 0;

  return (
    <SettingsPage
      eyebrow="Knowledge"
      title="Company encyclopedia"
      description="A structured view of the company, procedures, voice, culture and runtime knowledge readiness derived from ingested Knowledge Hub records."
      meta={
        <StatusPill tone={approvedSources.length > 0 ? 'info' : 'warning'}>
          {formatNumber(sources.length)} source records
        </StatusPill>
      }
    >
      <div className="encyclopedia-page">
        <EncyclopediaAgentAudit
          agentVersionId={readinessResponse.ok ? readinessResponse.data.agentVersionId : null}
          readiness={readinessResponse.ok ? readinessResponse.data : null}
          loadError={readinessResponse.ok ? null : readinessResponse.reason}
          initialSummary={latestAudit?.summary ?? null}
          initialSummaryAt={latestAudit?.suppliedAt ?? null}
          sourceCount={sources.length}
          runtimeReadyCount={runtimeReady.length}
          cultureSignals={cultureSignals}
          procedureSignals={procedureSignals}
        />

        <Banner tone="warning" title="Authoritative source boundary">
          This page is derived from local Knowledge Hub records. ElevenLabs receives runtime copies
          only after approval, assignment, publication and read-back; provider-side edits are drift.
        </Banner>

        <MetricGrid>
          <MetricCard
            label="Company source records"
            value={formatNumber(sources.length)}
            detail={`${formatNumber(approvedSources.length)} approved or live`}
            tone={sources.length > 0 ? 'info' : 'warning'}
          />
          <MetricCard
            label="Runtime feed ready"
            value={formatNumber(runtimeReady.length)}
            detail="Published, assigned and synced copies"
            tone={runtimeReady.length > 0 ? 'good' : 'warning'}
            href="/settings/knowledge/releases"
          />
          <MetricCard
            label="Understanding evidence"
            value={formatNumber(totalStatements)}
            detail="Matched statements across encyclopedia sections"
            tone={totalStatements > 12 ? 'good' : 'warning'}
          />
          <MetricCard
            label="Open knowledge gaps"
            value={formatNumber(gaps.length)}
            detail="Caller questions still needing review"
            tone={gaps.length > 0 ? 'warning' : 'good'}
            href="/settings/knowledge/gaps"
          />
        </MetricGrid>

        {sources.length === 0 ? (
          <EmptyState
            title="No encyclopedia source material yet"
            detail="Ingest documents, URLs or business facts, then approve at least one knowledge version before this page can form a company-level picture."
            action={
              <Link className="button primary" href="/settings/knowledge">
                Ingest company intelligence
              </Link>
            }
          />
        ) : (
          <>
            <section className="encyclopedia-hero-band" aria-label="Company understanding summary">
              <div>
                <p className="eyebrow">Local evidence overview</p>
                <h2>What governed source records can currently prove</h2>
                <p>
                  This evidence view is strongest when every section below has multiple approved
                  statements, clear ownership, no unresolved gaps and a synced runtime copy. The
                  ElevenLabs read-back above is kept distinct from this local evidence.
                </p>
              </div>
              <DefinitionList
                columns={1}
                items={[
                  {
                    term: 'Languages represented',
                    value: [
                      ...new Set(sources.map((source) => source.language.toUpperCase())),
                    ].join(', '),
                  },
                  {
                    term: 'Parks represented',
                    value:
                      [...new Set(sources.map((source) => source.park ?? 'All parks'))].join(
                        ', ',
                      ) || 'All parks',
                  },
                  {
                    term: 'Highest risk knowledge',
                    value: sources.some((source) => source.riskClass === 'HIGH')
                      ? 'High-risk material present'
                      : 'No high-risk material selected',
                  },
                ]}
              />
            </section>

            <div className="encyclopedia-layout">
              <main className="encyclopedia-main">
                {sections.map((section) => {
                  const statements = findStatements(sources, section.keywords);
                  return (
                    <Panel
                      key={section.key}
                      title={section.title}
                      description={section.description}
                      action={
                        <StatusPill tone={sectionCoverageTone(statements.length)}>
                          {formatNumber(statements.length)} signals
                        </StatusPill>
                      }
                    >
                      {statements.length > 0 ? (
                        <div className="encyclopedia-statement-list">
                          {statements.map((statement) => (
                            <article key={`${statement.source.id}-${statement.text}`}>
                              <p>{statement.text}</p>
                              <footer>
                                <Link href={`/settings/knowledge/${statement.source.id}`}>
                                  {statement.source.title}
                                </Link>
                                <StatusPill tone={stateTone(statement.source.state)}>
                                  {humaniseState(statement.source.state)}
                                </StatusPill>
                              </footer>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <EmptyState
                          title="No strong evidence in this section"
                          detail="The ingested records do not yet give the AI enough explicit source material here."
                        />
                      )}
                    </Panel>
                  );
                })}
              </main>

              <aside className="encyclopedia-aside" aria-label="Company encyclopedia coverage">
                <Panel
                  title="Coverage map"
                  description="How the ingested records distribute across company knowledge areas."
                >
                  <div className="encyclopedia-chip-list">
                    {categorySummary(sources).map(([category, count]) => (
                      <span key={category}>
                        {humaniseState(category)} <strong>{formatNumber(count)}</strong>
                      </span>
                    ))}
                  </div>
                </Panel>

                <Panel
                  title="ElevenLabs memory and knowledge feed"
                  description="Only governed local records become runtime copies for the voice agent."
                >
                  <ol className="runtime-feed-list">
                    <li className={approvedSources.length > 0 ? 'complete' : ''}>
                      Approved local knowledge
                    </li>
                    <li className={sources.some((source) => source.assigned) ? 'complete' : ''}>
                      Assigned to an agent version
                    </li>
                    <li className={runtimeReady.length > 0 ? 'complete' : ''}>
                      Published and read back from ElevenLabs
                    </li>
                    <li className={gaps.length === 0 ? 'complete' : ''}>Knowledge gaps reviewed</li>
                  </ol>
                  <Link className="button secondary small" href="/settings/knowledge/releases">
                    Inspect runtime copies
                  </Link>
                </Panel>

                <Panel
                  title="Operator checks"
                  description="Places where the encyclopedia is asking for human judgement."
                >
                  <ul className="encyclopedia-check-list">
                    {sections.map((section) => {
                      const count = findStatements(sources, section.keywords).length;
                      return (
                        <li key={section.key}>
                          <StatusPill tone={sectionCoverageTone(count)}>
                            {count >= 2 ? 'Covered' : 'Needs review'}
                          </StatusPill>
                          <span>{section.title}</span>
                        </li>
                      );
                    })}
                  </ul>
                </Panel>

                <Panel
                  title="Open gaps"
                  description="Questions callers asked that this encyclopedia may still not answer."
                >
                  {gaps.length > 0 ? (
                    <ul className="encyclopedia-gap-list">
                      {gaps.slice(0, 5).map((gap) => (
                        <li key={gap.id}>
                          <strong>{gap.title}</strong>
                          <span>
                            {formatNumber(gap.frequency)} mentions · {gap.language.toUpperCase()} ·{' '}
                            {humaniseState(gap.status)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="knowledge-copy">No open gaps returned by the API.</p>
                  )}
                </Panel>
              </aside>
            </div>
          </>
        )}
      </div>
    </SettingsPage>
  );
}
