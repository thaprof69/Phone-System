import Link from 'next/link';
import {
  Banner,
  Breadcrumbs,
  DataTable,
  DefinitionList,
  EmptyState,
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
  formatRelativeTime,
  humaniseState,
  toneForState,
  type Column,
} from '@quantum-parks/ui';
import { AppShell } from '../../../shell';
import { apiGet } from '../../../../lib/api';
import { ConversationEditor, type ConversationConfiguration } from './conversation-editor';
import { DraftActions } from './draft-actions';
import { ToolContracts, type ToolContractRow } from './tool-contracts';
import { TransferRoutes, type TransferRoute } from './transfer-routes';
import type { AgentListRow, MissionControl, TestRunRow, TestRow } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [agentsResponse, missionResponse, testsResponse] = await Promise.all([
    apiGet<{ items: AgentListRow[] }>('/agents', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<MissionControl>('/mission-control', { purpose: 'OPERATIONS' }),
    apiGet<{ tests: TestRow[]; runs: TestRunRow[] }>('/test-suites', {
      purpose: 'RELEASE_MANAGEMENT',
    }),
  ]);

  if (!agentsResponse.ok) {
    return (
      <AppShell>
        <Breadcrumbs
          trail={[
            { label: 'Settings', href: '/settings' },
            { label: 'Receptionist', href: '/settings/receptionist' },
            { label: 'Agent' },
          ]}
        />
        <PageHeading eyebrow="Receptionist" title="Agent" />
        <ErrorState detail={agentsResponse.reason} />
      </AppShell>
    );
  }

  const versions = agentsResponse.data.items.filter((row) => row.id === id && row.versionId);
  const agent = agentsResponse.data.items.find((row) => row.id === id);

  if (!agent) {
    return (
      <AppShell>
        <Breadcrumbs
          trail={[
            { label: 'Settings', href: '/settings' },
            { label: 'Receptionist', href: '/settings/receptionist' },
            { label: 'Agent' },
          ]}
        />
        <PageHeading eyebrow="Receptionist" title="Agent not found" />
        <ErrorState
          title="This agent does not exist"
          detail="It may have been removed, or the identifier in the address is wrong."
        />
      </AppShell>
    );
  }

  const mission = missionResponse.ok ? missionResponse.data : null;
  const active = versions.find((row) => row.state === 'ACTIVE');
  const draft = versions.find((row) => row.state === 'DRAFT' || row.state === 'CHANGES_REQUESTED');

  // The editor works on the draft when one exists, and otherwise shows the live
  // version read-only so an operator can see what callers hear before drafting.
  const editingVersionId = draft?.versionId ?? active?.versionId ?? versions[0]?.versionId;
  const versionDetail = editingVersionId
    ? await apiGet<{
        status: string;
        version: {
          id: string;
          version: number;
          state: string;
          configuration: ConversationConfiguration;
          changeReason: string;
          editable: boolean;
        };
      }>(`/agent-versions/${editingVersionId}`, { purpose: 'RELEASE_MANAGEMENT' })
    : null;

  const toolsResponse = await apiGet<{ items: ToolContractRow[]; undocumented: string[] }>(
    '/tool-contracts',
    { purpose: 'RELEASE_MANAGEMENT' },
  );

  const editedConfiguration =
    versionDetail?.ok && versionDetail.data.status === 'OK'
      ? versionDetail.data.version.configuration
      : null;
  const transferRoutes = (editedConfiguration?.transfers ?? []) as TransferRoute[];
  const enabledToolKeys = (editedConfiguration?.tools ?? []) as string[];
  const sorted = [...versions].sort((left, right) => (right.version ?? 0) - (left.version ?? 0));
  const runs = testsResponse.ok ? testsResponse.data.runs : [];
  const lastCompletedRun = runs.find((run) => run.status !== 'RUNNING');
  const assignments = mission?.receptionist.voiceAssignments ?? [];
  const drifted = mission?.receptionist.syncState === 'DRIFTED';

  const versionColumns: Column<AgentListRow>[] = [
    {
      key: 'version',
      header: 'Version',
      render: (row) => `Version ${row.version}`,
    },
    {
      key: 'state',
      header: 'State',
      render: (row) => (
        <StatusPill tone={toneForState(row.state)}>{humaniseState(row.state)}</StatusPill>
      ),
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
    <AppShell>
      <Breadcrumbs
        trail={[
          { label: 'Settings', href: '/settings' },
          { label: 'Receptionist', href: '/settings/receptionist' },
          { label: agent.name },
        ]}
      />
      <PageHeading
        eyebrow="Receptionist"
        title={agent.name}
        description={agent.purpose}
        meta={
          <>
            <StatusPill tone={active ? 'good' : 'danger'}>
              {active ? `Version ${active.version} live` : 'No live version'}
            </StatusPill>
            {mission ? (
              <StatusPill tone={toneForState(mission.receptionist.syncState)}>
                {humaniseState(mission.receptionist.syncState)}
              </StatusPill>
            ) : null}
            {agent.synthetic ? <SyntheticBadge /> : null}
          </>
        }
        actions={
          <Link className="button secondary" href="/settings/receptionist/releases">
            Release pipeline
          </Link>
        }
      />

      {drifted ? (
        <Banner tone="danger" title="The published copy has drifted">
          The agent in the provider console no longer matches this approved configuration. Local
          records remain authoritative.
        </Banner>
      ) : null}

      <Tabs
        label="Agent detail"
        panels={[
          {
            value: 'overview',
            label: 'Overview',
            content: (
              <Panel title="Current state" eyebrow="At a glance">
                <DefinitionList
                  items={[
                    {
                      term: 'Live version',
                      value: active ? `Version ${active.version}` : 'None published',
                      ...(mission?.receptionist.publishedAt
                        ? {
                            hint: `Published ${formatRelativeTime(mission.receptionist.publishedAt)}`,
                          }
                        : {}),
                    },
                    {
                      term: 'Draft in progress',
                      value: draft ? `Version ${draft.version}` : 'None',
                    },
                    {
                      term: 'Languages',
                      value:
                        mission && mission.receptionist.languages.length > 0
                          ? mission.receptionist.languages
                              .map((code) => code.toUpperCase())
                              .join(' · ')
                          : 'None configured',
                    },
                    {
                      term: 'Versions recorded',
                      value: formatNumber(versions.length),
                    },
                    {
                      term: 'Last test run',
                      value: lastCompletedRun
                        ? `${formatNumber(lastCompletedRun.passCount)} passed, ${formatNumber(lastCompletedRun.failCount)} failed`
                        : 'No completed run',
                      hint: lastCompletedRun
                        ? formatRelativeTime(lastCompletedRun.startedAt)
                        : 'A release cannot publish without passing tests.',
                    },
                  ]}
                />
              </Panel>
            ),
          },
          {
            value: 'conversation',
            label: 'Conversation',
            content:
              versionDetail?.ok && versionDetail.data.status === 'OK' ? (
                <>
                  <DraftActions
                    agentId={agent.id}
                    versionId={versionDetail.data.version.id}
                    versionNumber={versionDetail.data.version.version}
                    state={versionDetail.data.version.state}
                    hasDraft={Boolean(draft)}
                  />
                  <ConversationEditor
                    versionId={versionDetail.data.version.id}
                    versionNumber={versionDetail.data.version.version}
                    editable={versionDetail.data.version.editable}
                    canEditPolicy={false}
                    initialConfiguration={versionDetail.data.version.configuration}
                    initialChangeReason={versionDetail.data.version.changeReason}
                  />
                </>
              ) : (
                <Panel title="Configuration unavailable">
                  <EmptyState
                    title="This agent has no configuration to edit"
                    detail="Create a draft to begin writing the conversation configuration."
                  />
                </Panel>
              ),
          },
          {
            value: 'voices',
            label: 'Languages and voices',
            badge: assignments.length,
            content: (
              <Panel
                title="Voice assignments"
                eyebrow="Per language, with fallback"
                action={
                  <Link className="button ghost small" href="/settings/receptionist/voices">
                    Voice library
                  </Link>
                }
              >
                {assignments.length === 0 ? (
                  <EmptyState
                    title="No voices assigned"
                    detail="Each language needs a primary voice before a release can be published."
                  />
                ) : (
                  <div className="voice-assignment-row">
                    {assignments.map((assignment) => (
                      <span
                        className={assignment.available ? 'voice-chip' : 'voice-chip unavailable'}
                        key={`${assignment.language}-${assignment.fallback ? 'fallback' : 'primary'}`}
                      >
                        <strong>{assignment.language.toUpperCase()}</strong>
                        {assignment.voiceName ?? 'Unassigned'}
                        {assignment.fallback ? <em>fallback</em> : null}
                        {assignment.available ? null : <em className="danger">unavailable</em>}
                      </span>
                    ))}
                  </div>
                )}
              </Panel>
            ),
          },
          {
            value: 'tools',
            label: 'Tools',
            badge: enabledToolKeys.length,
            content: toolsResponse.ok ? (
              <ToolContracts
                contracts={toolsResponse.data.items}
                undocumented={toolsResponse.data.undocumented}
                enabledKeys={enabledToolKeys}
              />
            ) : (
              <Panel title="Tool contracts unavailable">
                <EmptyState title="Could not be read" detail={toolsResponse.reason} />
              </Panel>
            ),
          },
          {
            value: 'transfers',
            label: 'Transfers',
            badge: transferRoutes.length,
            content: (
              <TransferRoutes
                routes={transferRoutes}
                editable={Boolean(
                  versionDetail?.ok &&
                  versionDetail.data.status === 'OK' &&
                  versionDetail.data.version.editable,
                )}
              />
            ),
          },
          {
            value: 'versions',
            label: 'Versions',
            badge: versions.length,
            content: (
              <Panel
                title="Version history"
                eyebrow="Newest first"
                description="Versions are immutable. A change creates a new one rather than editing what callers hear."
              >
                <DataTable
                  caption="Configuration versions with their state, creation time and checksum"
                  columns={versionColumns}
                  rows={sorted}
                  getRowKey={(row) => row.versionId ?? row.id}
                  empty={
                    <EmptyState title="No versions" detail="This agent has no configuration yet." />
                  }
                />
              </Panel>
            ),
          },
          {
            value: 'tests',
            label: 'Tests',
            badge: runs.length,
            content: (
              <Panel
                title="Test runs"
                eyebrow="Against this agent"
                action={
                  <Link className="button ghost small" href="/settings/simulation/results">
                    All runs
                  </Link>
                }
              >
                {runs.length === 0 ? (
                  <EmptyState
                    title="No test runs"
                    detail="A run is started once a version is approved for testing."
                  />
                ) : (
                  <ul className="plain-list">
                    {runs.slice(0, 8).map((run) => (
                      <li key={run.id}>
                        {formatRelativeTime(run.startedAt)} — {humaniseState(run.status)},{' '}
                        {formatNumber(run.passCount)} passed, {formatNumber(run.failCount)} failed
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            ),
          },
        ]}
      />

      <TechnicalDetails>
        <dl className="technical-grid">
          <div>
            <dt>Agent id</dt>
            <dd>{agent.id}</dd>
          </div>
          <div>
            <dt>Active version id</dt>
            <dd>{active?.versionId ?? '—'}</dd>
          </div>
          <div>
            <dt>Active checksum</dt>
            <dd>{active?.checksum ?? '—'}</dd>
          </div>
        </dl>
      </TechnicalDetails>
    </AppShell>
  );
}
