import {
  DataTable,
  EmptyState,
  Panel,
  StatusPill,
  formatChecksum,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  humaniseState,
  toneForState,
  type Column,
} from '@quantum-parks/ui';
import Link from 'next/link';
import { DomainPage, LoadFailure } from '../../domain-page';
import { apiGet } from '../../../lib/api';
import type { AgentListRow } from '../../../lib/types';

export const dynamic = 'force-dynamic';

/** Where each release state sits in the pipeline, so the list reads in order. */
const PIPELINE_STAGE: Record<string, string> = {
  DRAFT: 'Being written',
  IN_REVIEW: 'Waiting for review',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED_FOR_TEST: 'Approved, awaiting tests',
  TESTING: 'Tests running',
  TEST_FAILED: 'Tests failed',
  TEST_PASSED: 'Tests passed, awaiting publication approval',
  APPROVED_FOR_PUBLISH: 'Approved to publish',
  PUBLISHING: 'Publishing to the voice runtime',
  PUBLISHED: 'Published, awaiting activation',
  ACTIVE: 'Live',
  SUPERSEDED: 'Replaced by a later version',
  ROLLED_BACK: 'Rolled back',
  RETIRED: 'Retired',
  EXTERNALLY_BLOCKED: 'Blocked by an external dependency',
};

export default async function VersionsPage() {
  const response = await apiGet<{ items: AgentListRow[] }>('/agents', {
    purpose: 'RELEASE_MANAGEMENT',
  });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Receptionist"
        title="Versions"
        description="Every configuration version and where it sits in the release pipeline."
      >
        <LoadFailure subject="Versions" reason={response.reason} />
      </DomainPage>
    );
  }

  const versions = response.data.items
    .filter((row) => row.versionId !== null)
    .sort((left, right) => (right.version ?? 0) - (left.version ?? 0));

  const columns: Column<AgentListRow>[] = [
    {
      key: 'version',
      header: 'Version',
      render: (row) => (
        <>
          Version {row.version}
          <small className="cell-sub">{row.name}</small>
        </>
      ),
    },
    {
      key: 'state',
      header: 'State',
      render: (row) => (
        <StatusPill tone={toneForState(row.state)}>{humaniseState(row.state)}</StatusPill>
      ),
    },
    {
      key: 'stage',
      header: 'What this means',
      render: (row) => PIPELINE_STAGE[row.state ?? ''] ?? 'Unknown stage',
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row) => (
        <>
          {formatDateTime(row.createdAt)}
          <small className="cell-sub">{formatRelativeTime(row.createdAt)}</small>
        </>
      ),
    },
    {
      key: 'checksum',
      header: 'Checksum',
      render: (row) => <code className="inline-code">{formatChecksum(row.checksum)}</code>,
      priority: 'secondary',
    },
  ];

  return (
    <DomainPage
      eyebrow="Receptionist"
      title="Versions"
      description="Every configuration version is immutable. A change creates a new version rather than editing the one in front of callers."
      meta={<StatusPill tone="neutral">{formatNumber(versions.length)} versions</StatusPill>}
      actions={
        versions.length >= 2 ? (
          <Link className="button secondary" href="/receptionist/versions/compare">
            Compare versions
          </Link>
        ) : undefined
      }
    >
      <Panel
        title="Version history"
        eyebrow="Newest first"
        description="The checksum is what the platform compares against the provider to detect drift."
      >
        <DataTable
          caption="Configuration versions with their release state and checksum"
          columns={columns}
          rows={versions}
          getRowKey={(row) => row.versionId ?? row.id}
          rowHref={(row) => `/receptionist/agents/${row.id}`}
          empty={
            <EmptyState
              title="No versions yet"
              detail="Creating an agent produces its first draft version."
            />
          }
        />
      </Panel>
    </DomainPage>
  );
}
