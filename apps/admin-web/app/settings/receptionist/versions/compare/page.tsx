import Link from 'next/link';
import {
  Banner,
  Breadcrumbs,
  DefinitionList,
  DiffView,
  EmptyState,
  ErrorState,
  PageHeading,
  Panel,
  SelectField,
  StatusPill,
  formatChecksum,
  formatDateTime,
  humaniseState,
  toneForState,
} from '@quantum-parks/ui';
import { AppShell } from '../../../../shell';
import { apiGet } from '../../../../../lib/api';
import { readParam, type SearchParams } from '../../../../../lib/list-view';
import type { AgentListRow } from '../../../../../lib/types';

export const dynamic = 'force-dynamic';

type VersionSide = {
  id: string;
  version: number;
  state: string;
  changeReason: string;
  authorId: string;
  checksum: string;
  createdAt: string;
  configurationText: string;
  approvals: Array<{ reviewerId: string; decision: string; reason: string; createdAt: string }>;
};

type Comparison =
  | { status: 'OK'; left: VersionSide; right: VersionSide; identical: boolean }
  | { status: 'NOT_FOUND' };

/**
 * Version comparison.
 *
 * A reviewer approving a change that will answer real callers needs to see exactly
 * what changed, not a summary of it. The diff is computed over the same canonical
 * text the checksum was taken over.
 */
export default async function CompareVersionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const agentsResponse = await apiGet<{ items: AgentListRow[] }>('/agents', {
    purpose: 'RELEASE_MANAGEMENT',
  });

  if (!agentsResponse.ok) {
    return (
      <AppShell>
        <PageHeading eyebrow="Receptionist" title="Compare versions" />
        <ErrorState detail={agentsResponse.reason} />
      </AppShell>
    );
  }

  const versions = agentsResponse.data.items
    .filter((row) => row.versionId)
    .sort((a, b) => (b.version ?? 0) - (a.version ?? 0));

  // Default to the two most recent versions, which is the comparison a reviewer
  // almost always wants when they arrive from a release.
  const left = readParam(params, 'left') ?? versions[1]?.versionId;
  const right = readParam(params, 'right') ?? versions[0]?.versionId;

  const comparison =
    left && right && left !== right
      ? await apiGet<Comparison>(
          `/agent-versions/compare?left=${encodeURIComponent(left)}&right=${encodeURIComponent(right)}`,
          { purpose: 'RELEASE_MANAGEMENT' },
        )
      : null;

  const options = versions.map((row) => ({
    value: row.versionId ?? '',
    label: `Version ${row.version} — ${humaniseState(row.state)}`,
  }));

  return (
    <AppShell>
      <Breadcrumbs
        trail={[
          { label: 'Settings', href: '/settings' },
          { label: 'Receptionist', href: '/settings/receptionist' },
          { label: 'Versions', href: '/settings/receptionist/versions' },
          { label: 'Compare' },
        ]}
      />
      <PageHeading
        eyebrow="Receptionist"
        title="Compare versions"
        description="What actually changed between two configuration versions, line by line."
        actions={
          <Link className="button secondary" href="/settings/receptionist/versions">
            All versions
          </Link>
        }
      />

      <form className="filter-bar" method="get" action="/settings/receptionist/versions/compare">
        <div className="filter-controls">
          <SelectField
            id="left"
            label="Compare from"
            options={options}
            {...(left ? { defaultValue: left } : {})}
          />
          <SelectField
            id="right"
            label="Compare to"
            options={options}
            {...(right ? { defaultValue: right } : {})}
          />
        </div>
        <div className="filter-actions">
          <button className="button primary small" type="submit">
            Compare
          </button>
        </div>
      </form>

      {versions.length < 2 ? (
        <Panel title="Not enough versions">
          <EmptyState
            title="At least two versions are needed"
            detail="A comparison needs a version to compare from and a version to compare to."
          />
        </Panel>
      ) : !comparison ? (
        <Panel title="Choose two different versions">
          <EmptyState
            title="Select a pair to compare"
            detail="Pick a different version on each side, then choose Compare."
          />
        </Panel>
      ) : !comparison.ok ? (
        <ErrorState detail={comparison.reason} />
      ) : comparison.data.status === 'NOT_FOUND' ? (
        <ErrorState
          title="One of those versions no longer exists"
          detail="Choose a different pair from the lists above."
        />
      ) : (
        <>
          {comparison.data.identical ? (
            <Banner tone="info" title="These versions are byte-identical">
              Both carry the same checksum, so the published behaviour would be unchanged.
            </Banner>
          ) : null}

          <div className="compare-columns">
            {([comparison.data.left, comparison.data.right] as const).map((side, index) => (
              <Panel
                key={side.id}
                title={`Version ${side.version}`}
                eyebrow={index === 0 ? 'Compare from' : 'Compare to'}
                action={
                  <StatusPill tone={toneForState(side.state)}>
                    {humaniseState(side.state)}
                  </StatusPill>
                }
              >
                <DefinitionList
                  columns={1}
                  items={[
                    { term: 'Change reason', value: side.changeReason },
                    { term: 'Created', value: formatDateTime(side.createdAt) },
                    { term: 'Checksum', value: formatChecksum(side.checksum) },
                    {
                      term: 'Approvals',
                      value:
                        side.approvals.length === 0
                          ? 'None recorded'
                          : side.approvals
                              .map((approval) => humaniseState(approval.decision))
                              .join(', '),
                      hint:
                        side.approvals[0]?.reason ??
                        'This version has not been independently approved.',
                    },
                  ]}
                />
              </Panel>
            ))}
          </div>

          <Panel
            title="Configuration differences"
            eyebrow={`Version ${comparison.data.left.version} compared with version ${comparison.data.right.version}`}
            description="Unchanged sections are collapsed so the change itself is what you read."
          >
            <DiffView
              before={comparison.data.left.configurationText}
              after={comparison.data.right.configurationText}
              beforeLabel={`Version ${comparison.data.left.version}`}
              afterLabel={`Version ${comparison.data.right.version}`}
            />
          </Panel>
        </>
      )}
    </AppShell>
  );
}
