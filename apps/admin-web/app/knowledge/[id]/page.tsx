import {
  Banner,
  Breadcrumbs,
  DefinitionList,
  DiffView,
  ErrorState,
  PageHeading,
  Panel,
  StatusPill,
  SyntheticBadge,
  Tabs,
  TechnicalDetails,
  formatChecksum,
  formatDateTime,
  formatNumber,
  humaniseState,
  toneForState,
} from '@quantum-parks/ui';
import { AppShell } from '../../shell';
import { apiGet } from '../../../lib/api';
import {
  AssignmentForm,
  KnowledgeEditor,
  ReviewDecision,
  RetrySyncButton,
  SubmitForReviewButton,
} from './knowledge-actions';

export const dynamic = 'force-dynamic';

type Approval = { reviewerId: string; decision: string; reason: string; createdAt: string };
type Sync = {
  id: string;
  syncState: string;
  providerDocumentId: string | null;
  localChecksum: string;
  remoteChecksum: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: Record<string, unknown> | null;
} | null;
type Assignment = {
  id: string;
  agentVersionId: string;
  language: string;
  park: string | null;
  active: boolean;
  agentVersionLabel: number | null;
};
type Version = {
  id: string;
  version: number;
  state: string;
  content: string;
  contentChecksum: string;
  changeReason: string;
  effectiveAt: string | null;
  expiresAt: string | null;
  createdBy: string;
  createdAt: string;
  approvals: Approval[];
  sync: Sync;
  assignments: Assignment[];
};
type Detail = {
  status: 'FOUND' | 'NOT_FOUND';
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
  versions: Version[];
  conflicts: Array<{ id: string; conflictType: string; resolvedAt: string | null }>;
  agentVersions: Array<{ id: string; version: number; state: string }>;
  linkedTests: Array<{ id: string; name: string; riskLevel: string }>;
};

export default async function KnowledgeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = await apiGet<Detail>(`/knowledge/${id}`, { purpose: 'RELEASE_MANAGEMENT' });

  if (!response.ok || response.data.status === 'NOT_FOUND') {
    return (
      <AppShell>
        <Breadcrumbs
          trail={[{ label: 'Knowledge', href: '/knowledge/library' }, { label: 'Asset' }]}
        />
        <PageHeading eyebrow="Knowledge" title="Asset not found" />
        <ErrorState
          title={!response.ok ? 'Could not be read' : 'This asset does not exist'}
          detail={!response.ok ? response.reason : 'It may have been removed.'}
        />
      </AppShell>
    );
  }

  const { asset, versions, liveVersionId, conflicts, agentVersions, linkedTests } = response.data;
  const draft = versions.find((version) => ['DRAFT', 'IN_REVIEW'].includes(version.state));
  const live = versions.find((version) => version.id === liveVersionId) ?? null;
  const openConflicts = conflicts.filter((conflict) => !conflict.resolvedAt);

  const agentOptions = agentVersions.map((agent) => ({
    value: agent.id,
    label: `v${agent.version} (${humaniseState(agent.state)})`,
  }));

  const versionPanels = versions.map((version) => {
    const requiresIndependentApprover = asset.riskClass === 'HIGH';
    return {
      value: version.id,
      label: `v${version.version}`,
      badge: (
        <StatusPill tone={toneForState(version.state)}>{humaniseState(version.state)}</StatusPill>
      ),
      content: (
        <div className="version-panel">
          <DefinitionList
            items={[
              { term: 'Change reason', value: version.changeReason },
              {
                term: 'Effective',
                value: version.effectiveAt ? formatDateTime(version.effectiveAt) : 'Immediately',
              },
              {
                term: 'Expires',
                value: version.expiresAt ? formatDateTime(version.expiresAt) : 'No expiry set',
              },
              { term: 'Checksum', value: formatChecksum(version.contentChecksum) },
            ]}
          />

          {live && live.id !== version.id ? (
            <Panel
              title="Compared to what is live"
              description="What callers are currently answered from, against this version."
            >
              <DiffView
                before={live.content}
                after={version.content}
                beforeLabel="Live"
                afterLabel={`v${version.version}`}
              />
            </Panel>
          ) : (
            // Named distinctly from the editable "Content" field above: `Panel` gives a
            // section an `aria-label` from its title, and matching that field's label
            // exactly would make them ambiguous to any assistive query for "Content".
            <Panel title="Published content">
              <pre className="knowledge-content">{version.content}</pre>
            </Panel>
          )}

          {version.approvals.length > 0 ? (
            <Panel title="Decisions recorded">
              <ul className="approval-history">
                {version.approvals.map((approval) => (
                  <li key={`${approval.reviewerId}-${approval.createdAt}`}>
                    <StatusPill tone={approval.decision === 'APPROVED' ? 'good' : 'danger'}>
                      {humaniseState(approval.decision)}
                    </StatusPill>
                    <span>{approval.reason}</span>
                    <small>{formatDateTime(approval.createdAt)}</small>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {version.state === 'DRAFT' ? (
            <Panel title="Submit">
              <SubmitForReviewButton versionId={version.id} />
            </Panel>
          ) : null}

          {version.state === 'IN_REVIEW' ? (
            <Panel title="Review decision">
              <ReviewDecision
                versionId={version.id}
                requiresIndependentApprover={requiresIndependentApprover}
              />
            </Panel>
          ) : null}

          {['APPROVED', 'PUBLISHED', 'ACTIVE'].includes(version.state) ? (
            <Panel
              title="Assignment"
              description="Which agent version serves this content, and in what language."
            >
              {version.assignments.length > 0 ? (
                <ul className="approval-history">
                  {version.assignments.map((assignment) => (
                    <li key={assignment.id}>
                      <StatusPill tone={assignment.active ? 'good' : 'neutral'}>
                        {assignment.active ? 'Active' : 'Inactive'}
                      </StatusPill>
                      <span>
                        Agent v{assignment.agentVersionLabel ?? '?'} ·{' '}
                        {assignment.language.toUpperCase()}
                        {assignment.park ? ` · ${assignment.park}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted-cell">Not assigned to any agent version yet.</p>
              )}
              <AssignmentForm
                versionId={version.id}
                assetLanguage={asset.language}
                agentVersions={agentOptions}
              />
            </Panel>
          ) : null}

          {version.sync ? (
            <Panel
              title="Voice runtime synchronisation"
              description="The local approved version is authoritative. This is the separate, remote copy."
            >
              <DefinitionList
                items={[
                  { term: 'Sync state', value: humaniseState(version.sync.syncState) },
                  {
                    term: 'Checksums match',
                    value:
                      version.sync.remoteChecksum === null
                        ? 'Not published'
                        : version.sync.remoteChecksum === version.sync.localChecksum
                          ? 'Yes'
                          : 'No — drifted',
                  },
                  {
                    term: 'Last success',
                    value: version.sync.lastSuccessAt
                      ? formatDateTime(version.sync.lastSuccessAt)
                      : 'Never',
                  },
                ]}
              />
              {['DRIFTED', 'PUBLISH_FAILED', 'REMOTE_MISSING'].includes(version.sync.syncState) ? (
                <RetrySyncButton syncId={version.sync.id} />
              ) : null}
              {version.sync.lastError ? (
                <TechnicalDetails summary="Last provider error">
                  <pre>{JSON.stringify(version.sync.lastError, null, 2)}</pre>
                </TechnicalDetails>
              ) : null}
            </Panel>
          ) : null}
        </div>
      ),
    };
  });

  return (
    <AppShell>
      <Breadcrumbs
        trail={[{ label: 'Knowledge', href: '/knowledge/library' }, { label: asset.title }]}
      />
      <PageHeading
        eyebrow="Knowledge"
        title={asset.title}
        description={`${humaniseState(asset.category)} · ${asset.language.toUpperCase()}${asset.park ? ` · ${asset.park}` : ''}`}
        meta={
          <>
            <StatusPill
              tone={
                asset.riskClass === 'HIGH'
                  ? 'danger'
                  : asset.riskClass === 'MEDIUM'
                    ? 'warning'
                    : 'neutral'
              }
            >
              {humaniseState(asset.riskClass)} risk
            </StatusPill>
            {asset.synthetic ? <SyntheticBadge /> : null}
          </>
        }
      />

      {openConflicts.length > 0 ? (
        <Banner tone="warning" title={`${formatNumber(openConflicts.length)} unresolved conflicts`}>
          Another version overlaps with this content. Resolve the conflict before assigning either.
        </Banner>
      ) : null}

      {
        // Always mounted, never swapped for a plain banner: `router.refresh()` after a
        // successful save flips `draft` from false to true, and a save that just
        // created that very draft must not have its own confirmation replaced by the
        // "already open" notice in the same instant it appears — a component that gets
        // unmounted takes its local success state with it.
      }
      <Panel
        title="Author a new version"
        description="Saved as a new version — the live content stays exactly as it was published, since it is evidence of what an agent answered from."
      >
        <KnowledgeEditor
          assetId={asset.id}
          liveContent={live?.content ?? ''}
          hasOpenDraft={Boolean(draft)}
          openDraftMessage={
            draft
              ? `Version ${draft.version} is already ${humaniseState(draft.state).toLowerCase()}. Only one draft or in-review version may exist at a time; finish this one before starting another edit.`
              : undefined
          }
        />
      </Panel>

      <Panel
        title="Versions"
        eyebrow={`${formatNumber(versions.length)} total`}
        description="Immutable once submitted. Each is shown against the currently live version, not against the one before it."
      >
        {/* Keyed on which version is open: `Tabs` picks its active tab from
            `defaultValue` only on mount, and a server re-render after creating or
            submitting a draft does not remount a client component on its own. Without
            this key the tab selection would freeze on whatever was open when the page
            first loaded, and a newly created draft's "Submit for review" button would
            sit on a tab nothing ever switches to. */}
        <Tabs
          key={draft?.id ?? 'none'}
          panels={versionPanels}
          label={`Versions of ${asset.title}`}
          {...(draft ? { defaultValue: draft.id } : {})}
        />
      </Panel>

      {linkedTests.length > 0 ? (
        <Panel
          title="Linked tests"
          eyebrow={`${formatNumber(linkedTests.length)} available`}
          description="Test cases that can exercise whether the receptionist answers correctly from this content."
        >
          <ul className="capability-grid">
            {linkedTests.slice(0, 12).map((test) => (
              <li key={test.id}>
                <span>{test.name}</span>
                <StatusPill tone={test.riskLevel === 'HIGH' ? 'danger' : 'neutral'}>
                  {humaniseState(test.riskLevel)}
                </StatusPill>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </AppShell>
  );
}
