import {
  Banner,
  DataTable,
  EmptyState,
  JsonInspector,
  MetricCard,
  MetricGrid,
  Panel,
  StatusPill,
  TechnicalDetails,
  formatChecksum,
  formatNumber,
  formatRelativeTime,
  humaniseState,
  toneForState,
  type Column,
} from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../../domain-page';
import { apiGet } from '../../../lib/api';

export const dynamic = 'force-dynamic';

type ReleaseRow = {
  id: string;
  assetId: string;
  title: string;
  category: string;
  language: string;
  riskClass: string;
  version: number;
  versionState: string;
  syncState: string;
  providerDocumentId: string | null;
  localChecksum: string;
  remoteChecksum: string | null;
  checksumsMatch: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: Record<string, unknown> | null;
};

const HEALTHY = ['IN_SYNC'];

export default async function KnowledgeReleasesPage() {
  const response = await apiGet<{ items: ReleaseRow[] }>('/knowledge-releases', {
    purpose: 'RELEASE_MANAGEMENT',
  });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Knowledge"
        title="Releases"
        description="Publication to the voice runtime, and divergence from it."
      >
        <LoadFailure subject="Knowledge releases" reason={response.reason} />
      </DomainPage>
    );
  }

  const all = response.data.items;
  const failed = all.filter((row) => row.syncState === 'PUBLISH_FAILED');
  const drifted = all.filter((row) => row.syncState === 'DRIFTED');
  const inSync = all.filter((row) => HEALTHY.includes(row.syncState));
  // Problems first — a healthy list is not what this page exists to show.
  const rows = [...all].sort(
    (left, right) =>
      Number(HEALTHY.includes(left.syncState)) - Number(HEALTHY.includes(right.syncState)),
  );

  const columns: Column<ReleaseRow>[] = [
    {
      key: 'title',
      header: 'Knowledge',
      render: (row) => (
        <>
          {row.title}
          <small className="cell-sub">
            v{row.version} · {humaniseState(row.category)} · {row.language.toUpperCase()}
          </small>
        </>
      ),
    },
    {
      key: 'local',
      header: 'Local state',
      render: (row) => (
        <StatusPill tone={toneForState(row.versionState)}>
          {humaniseState(row.versionState)}
        </StatusPill>
      ),
    },
    {
      key: 'remote',
      header: 'Voice runtime',
      render: (row) => (
        <StatusPill tone={toneForState(row.syncState)}>{humaniseState(row.syncState)}</StatusPill>
      ),
    },
    {
      key: 'match',
      header: 'Checksums',
      render: (row) =>
        row.remoteChecksum === null ? (
          <span className="muted-cell">Not published</span>
        ) : row.checksumsMatch ? (
          <StatusPill tone="good">Match</StatusPill>
        ) : (
          <StatusPill tone="danger">Differ</StatusPill>
        ),
    },
    {
      key: 'lastSuccess',
      header: 'Last published',
      render: (row) =>
        row.lastSuccessAt ? (
          formatRelativeTime(row.lastSuccessAt)
        ) : (
          <span className="muted-cell">Never</span>
        ),
      priority: 'secondary',
    },
  ];

  return (
    <DomainPage
      eyebrow="Knowledge"
      title="Releases"
      description="Approved knowledge is published to the voice runtime as a copy. This page reports the local record and the remote copy separately."
      meta={
        <StatusPill tone={failed.length + drifted.length > 0 ? 'danger' : 'good'}>
          {formatNumber(failed.length + drifted.length)} need attention
        </StatusPill>
      }
    >
      {failed.length > 0 ? (
        <Banner tone="danger" title={`${formatNumber(failed.length)} documents failed to publish`}>
          Callers are being answered from the previously published copy. The local record is
          authoritative and unaffected; only the runtime copy is stale.
        </Banner>
      ) : null}

      <MetricGrid>
        <MetricCard
          label="In sync"
          value={formatNumber(inSync.length)}
          detail="Local and remote checksums match"
          tone="good"
        />
        <MetricCard
          label="Drifted"
          value={formatNumber(drifted.length)}
          detail="Remote copy was changed outside this platform"
          tone={drifted.length > 0 ? 'warning' : 'good'}
        />
        <MetricCard
          label="Publish failed"
          value={formatNumber(failed.length)}
          detail="The provider rejected the document"
          tone={failed.length > 0 ? 'danger' : 'good'}
        />
        <MetricCard
          label="Total published"
          value={formatNumber(all.length)}
          detail="Approved versions with a runtime mapping"
        />
      </MetricGrid>

      <Panel
        title="Publication state"
        eyebrow="Problems first"
        description="Local approved versions are authoritative. A remote object that differs is drift, and never overwrites local state."
      >
        <DataTable
          caption="Knowledge versions with their local state, runtime sync state and checksum comparison"
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState
              title="Nothing published yet"
              detail="Approved knowledge is published to the voice runtime and then read back to confirm the copy matches."
            />
          }
        />
      </Panel>

      {failed.length > 0 ? (
        <Panel title="Publication failures" eyebrow="Provider responses">
          {failed.map((row) => (
            <div className="failure-entry" key={row.id}>
              <strong>{row.title}</strong>
              <TechnicalDetails summary="Provider error and checksums">
                <JsonInspector label="Last error" value={row.lastError} />
                <dl className="technical-grid">
                  <div>
                    <dt>Local checksum</dt>
                    <dd>{formatChecksum(row.localChecksum)}</dd>
                  </div>
                  <div>
                    <dt>Remote checksum</dt>
                    <dd>{row.remoteChecksum ? formatChecksum(row.remoteChecksum) : '—'}</dd>
                  </div>
                  <div>
                    <dt>Provider document</dt>
                    <dd>{row.providerDocumentId ?? 'Not created'}</dd>
                  </div>
                </dl>
              </TechnicalDetails>
            </div>
          ))}
        </Panel>
      ) : null}
    </DomainPage>
  );
}
