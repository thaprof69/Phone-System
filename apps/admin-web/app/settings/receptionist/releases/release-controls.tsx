'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Banner,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Panel,
  StatusPill,
  TechnicalDetails,
  TextArea,
  formatChecksum,
  formatDateTime,
  formatNumber,
  humaniseState,
  toneForState,
  type Column,
} from '@quantum-parks/ui';

/**
 * Release controls.
 *
 * Every action calls the platform and reports what came back. A publication is not
 * shown as successful because the request returned — it is successful when the provider
 * read-back matches the approved checksum, and this surface says which of those two
 * things happened.
 */

export type PipelineVersion = {
  id: string;
  version: number;
  state: string;
  changeReason: string;
  checksum: string;
  createdAt: string;
  approvals: Array<{ reviewerId: string; decision: string; reason: string; createdAt: string }>;
  testEvidence: {
    runId: string;
    status: string;
    passCount: number;
    failCount: number;
    completedAt: string | null;
  } | null;
  deployment: {
    id: string;
    syncState: string;
    providerAgentId: string | null;
    localChecksum: string;
    remoteChecksum: string | null;
    readBackMatches: boolean;
    publishedAt: string | null;
    verifiedAt: string | null;
  } | null;
  drift: Array<{
    id: string;
    severity: string;
    path: string;
    localValueHash: string | null;
    remoteValueHash: string | null;
  }>;
  rollbackCandidate: boolean;
};

type Outcome =
  | { kind: 'idle' }
  | { kind: 'working'; what: string }
  | { kind: 'ok'; title: string; detail: string }
  | { kind: 'blocked'; title: string; detail: string };

export function ReleaseControls({
  agentId,
  versions,
}: {
  agentId: string;
  versions: PipelineVersion[];
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [resolution, setResolution] = useState('');

  const active = versions.find((version) => version.state === 'ACTIVE');
  const unresolvedDrift = versions.flatMap((version) =>
    version.drift.map((finding) => ({ ...finding, version: version.version })),
  );
  const rollbackTargets = versions.filter((version) => version.rollbackCandidate);

  async function call(path: string, body: unknown, what: string) {
    setOutcome({ kind: 'working', what });
    try {
      const response = await fetch(`/api/admin/agents/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const status = String(data.status ?? '');

      if (status === 'VERIFIED') {
        const matches = Boolean(data.matches);
        setOutcome({
          kind: matches ? 'ok' : 'blocked',
          title: matches
            ? 'Read-back matched the approved configuration'
            : 'Read-back did not match',
          detail: matches
            ? 'The provider holds exactly what was approved, so this version is genuinely live.'
            : `The remote object differs from the approved checksum. A drift finding has been recorded and publication stays blocked. ${
                data.providerError ? String(data.providerError) : ''
              }`,
        });
      } else if (status === 'ROLLED_BACK') {
        setOutcome({
          kind: 'ok',
          title: `Rolled back to version ${String(data.restoredVersion)}`,
          detail:
            'The previous version is marked rather than deleted, and the restored version must be verified against the provider before it counts as live.',
        });
      } else if (status === 'RESOLVED') {
        setOutcome({
          kind: 'ok',
          title: 'Drift finding reconciled',
          detail:
            'Recorded against the finding. The local record stays authoritative — the remedy for drift is republishing, not adopting the remote value.',
        });
        setResolution('');
      } else if (status === 'BLOCKED') {
        setOutcome({
          kind: 'blocked',
          title: 'The platform refused this',
          detail: Array.isArray(data.blockers)
            ? data.blockers.join(' · ')
            : 'Server gates rejected it.',
        });
      } else {
        setOutcome({
          kind: 'blocked',
          title: 'That did not complete',
          detail: String(data.message ?? `The platform returned ${response.status}.`),
        });
      }
      router.refresh();
    } catch {
      setOutcome({
        kind: 'blocked',
        title: 'The operations service is not reachable',
        detail: 'Nothing was changed.',
      });
    }
  }

  const busy = outcome.kind === 'working';

  const columns: Column<PipelineVersion>[] = [
    {
      key: 'version',
      header: 'Version',
      render: (version) => (
        <>
          Version {version.version}
          <small className="cell-sub">{version.changeReason}</small>
        </>
      ),
    },
    {
      key: 'state',
      header: 'State',
      render: (version) => (
        <StatusPill tone={toneForState(version.state)}>{humaniseState(version.state)}</StatusPill>
      ),
    },
    {
      key: 'approval',
      header: 'Approval',
      render: (version) =>
        version.approvals.length === 0 ? (
          <span className="muted-cell">None</span>
        ) : (
          <StatusPill tone="good">
            {humaniseState(version.approvals[0]?.decision ?? 'APPROVED')}
          </StatusPill>
        ),
    },
    {
      key: 'tests',
      header: 'Tests',
      render: (version) =>
        version.testEvidence ? (
          <>
            {formatNumber(version.testEvidence.passCount)} passed,{' '}
            {formatNumber(version.testEvidence.failCount)} failed
            <small className="cell-sub">{humaniseState(version.testEvidence.status)}</small>
          </>
        ) : (
          <span className="muted-cell">No run</span>
        ),
    },
    {
      key: 'readback',
      header: 'Provider read-back',
      render: (version) => {
        if (!version.deployment) return <span className="muted-cell">Not published</span>;
        return (
          <>
            <StatusPill tone={version.deployment.readBackMatches ? 'good' : 'danger'}>
              {version.deployment.readBackMatches ? 'Matches' : 'Differs'}
            </StatusPill>
            <small className="cell-sub">
              {version.deployment.verifiedAt
                ? formatDateTime(version.deployment.verifiedAt)
                : 'Never verified'}
            </small>
          </>
        );
      },
    },
    {
      key: 'actions',
      header: 'Action',
      render: (version) =>
        version.deployment ? (
          <Button
            size="small"
            variant="ghost"
            type="button"
            disabled={busy}
            onClick={() => {
              void call(`versions/${version.id}/verify-read-back`, {}, 'Verifying read-back');
            }}
          >
            Verify read-back
          </Button>
        ) : (
          <span className="muted-cell">—</span>
        ),
    },
  ];

  return (
    <>
      {outcome.kind === 'ok' ? (
        <Banner tone="good" title={outcome.title}>
          {outcome.detail}
        </Banner>
      ) : null}
      {outcome.kind === 'blocked' ? (
        <Banner tone="danger" title={outcome.title}>
          {outcome.detail}
        </Banner>
      ) : null}

      <Panel
        title="Version pipeline"
        eyebrow="Newest first"
        description="A version is live only when the provider read-back matches the approved checksum. The publish call returning is not the same thing."
      >
        <DataTable
          caption="Versions with their state, approval and test evidence, and provider read-back result"
          columns={columns}
          rows={versions}
          getRowKey={(version) => version.id}
          empty={<EmptyState title="No versions" detail="This agent has no configuration yet." />}
        />
      </Panel>

      <Panel
        title="Unresolved drift"
        eyebrow={`${formatNumber(unresolvedDrift.length)} findings`}
        description="Someone changed the agent in the provider console. Local approved versions stay authoritative; the remedy is republishing, not adopting the remote value."
      >
        {unresolvedDrift.length === 0 ? (
          <EmptyState
            title="No unresolved drift"
            detail="Every published version matches the approved configuration."
          />
        ) : (
          <>
            <ul className="drift-list">
              {unresolvedDrift.map((finding) => (
                <li key={finding.id}>
                  <div>
                    <strong>{finding.path}</strong>
                    <span>
                      Version {finding.version} · {humaniseState(finding.severity)} severity
                    </span>
                  </div>
                  <ConfirmDialog
                    title="Reconcile this drift finding"
                    description="This records that a person reviewed the difference and acted. It does not copy the remote value into the approved record."
                    confirmLabel="Record reconciliation"
                    tone="primary"
                    trigger={
                      <Button size="small" variant="secondary" type="button" disabled={busy}>
                        Reconcile
                      </Button>
                    }
                    onConfirm={() =>
                      call(
                        `drift/${finding.id}/resolve`,
                        {
                          resolution:
                            resolution.trim().length >= 8
                              ? resolution.trim()
                              : 'Reviewed and republished from the approved local version',
                        },
                        'Recording reconciliation',
                      )
                    }
                  />
                </li>
              ))}
            </ul>
            <TextArea
              id="driftResolution"
              label="Reconciliation note"
              hint="Recorded against the finding and shown in the audit log."
              rows={2}
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
            />
          </>
        )}
      </Panel>

      <Panel
        title="Rollback"
        eyebrow="Restore a previously live version"
        description="Rollback republishes an earlier approved version. Nothing is deleted, and the restored version is re-verified against the provider before it counts as live."
      >
        {rollbackTargets.length === 0 ? (
          <EmptyState
            title="No rollback target"
            detail="Only a version that has already been live can be restored."
          />
        ) : (
          <ul className="rollback-list">
            {rollbackTargets.map((version) => (
              <li key={version.id}>
                <div>
                  <strong>Version {version.version}</strong>
                  <span>
                    {version.changeReason} · {formatDateTime(version.createdAt)}
                  </span>
                </div>
                <ConfirmDialog
                  title={`Roll back to version ${version.version}?`}
                  description={`This will supersede version ${active?.version ?? '—'} and restore version ${version.version}. The restored version must then be verified against the provider.`}
                  confirmLabel={`Roll back to version ${version.version}`}
                  confirmationPhrase={`rollback ${version.version}`}
                  trigger={
                    <Button size="small" variant="danger" type="button" disabled={busy}>
                      Roll back
                    </Button>
                  }
                  onConfirm={() =>
                    call(`${agentId}/rollback`, { targetVersionId: version.id }, 'Rolling back')
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <TechnicalDetails summary="Checksums">
        <dl className="technical-grid">
          {versions
            .filter((version) => version.deployment)
            .map((version) => (
              <div key={version.id}>
                <dt>Version {version.version}</dt>
                <dd>
                  local {formatChecksum(version.deployment?.localChecksum ?? null)} · remote{' '}
                  {formatChecksum(version.deployment?.remoteChecksum ?? null)}
                </dd>
              </div>
            ))}
        </dl>
      </TechnicalDetails>
    </>
  );
}
