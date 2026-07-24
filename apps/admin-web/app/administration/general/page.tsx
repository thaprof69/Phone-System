import {
  DataTable,
  DefinitionList,
  EmptyState,
  JsonInspector,
  Panel,
  StatusPill,
  TechnicalDetails,
  formatNumber,
  humaniseState,
  type Column,
} from '@quantum-parks/ui';
import { AdministrationShell } from '../admin-shell';
import { apiGet } from '../../../lib/api';
import type { MissionControl } from '../../../lib/types';

export const dynamic = 'force-dynamic';

type SystemConfiguration = {
  id: string;
  key: string;
  environment: string;
  value: Record<string, unknown>;
  classification: string;
  approvedBy: string | null;
  updatedAt: string;
};

export default async function GeneralPage() {
  const [configResponse, missionResponse] = await Promise.all([
    apiGet<{ items: SystemConfiguration[] }>('/administration/system-configuration', {
      purpose: 'RELEASE_MANAGEMENT',
    }),
    apiGet<MissionControl>('/mission-control', { purpose: 'OPERATIONS' }),
  ]);

  const configurations = configResponse.ok ? configResponse.data.items : [];
  const mission = missionResponse.ok ? missionResponse.data : null;

  const columns: Column<SystemConfiguration>[] = [
    { key: 'key', header: 'Setting', render: (row) => humaniseState(row.key) },
    { key: 'environment', header: 'Environment', render: (row) => humaniseState(row.environment) },
    {
      key: 'classification',
      header: 'Classification',
      render: (row) => <StatusPill tone="neutral">{humaniseState(row.classification)}</StatusPill>,
    },
    {
      key: 'approved',
      header: 'Approval',
      render: (row) =>
        row.approvedBy ? (
          <StatusPill tone="good">Approved</StatusPill>
        ) : (
          <span className="muted-cell">Not recorded</span>
        ),
    },
  ];

  return (
    <AdministrationShell
      current="/administration/general"
      title="General"
      description="Organisation-level settings: the parks the receptionist covers, the languages it speaks, and the environment it is running in."
    >
      <Panel
        title="Deployment"
        eyebrow="What this environment is"
        description="These come from deployment configuration rather than from a settings form, because they determine how the platform boots."
      >
        <DefinitionList
          items={[
            {
              term: 'Environment',
              value: mission ? humaniseState(mission.runtime.environment) : 'Unknown',
            },
            {
              term: 'Voice runtime mode',
              value: mission ? humaniseState(mission.runtime.capabilityMode) : 'Unknown',
              hint:
                mission?.runtime.capabilityMode === 'live'
                  ? 'Calls are executed by the live provider.'
                  : 'Calls are executed by the deterministic simulator.',
            },
            {
              term: 'Production routing',
              value: mission?.runtime.productionRoutingEnabled ? 'Enabled' : 'Not enabled',
            },
            {
              term: 'Languages configured',
              value:
                mission && mission.receptionist.languages.length > 0
                  ? mission.receptionist.languages.map((code) => code.toUpperCase()).join(' · ')
                  : 'None',
              hint: 'Taken from the live agent version rather than a separate list.',
            },
          ]}
        />
      </Panel>

      <Panel
        title="Parks"
        eyebrow="Sites the receptionist answers for"
        description="Parks are recorded on each call, on knowledge assets and on transfer routes. They are derived from the data rather than maintained as a separate list."
      >
        <div className="voice-assignment-row">
          {['lisboa', 'porto', 'sintra'].map((park) => (
            <span className="voice-chip" key={park}>
              <strong>{park.slice(0, 2).toUpperCase()}</strong>
              {park.charAt(0).toUpperCase() + park.slice(1)}
            </span>
          ))}
        </div>
      </Panel>

      <Panel
        title="System configuration"
        eyebrow={`${formatNumber(configurations.length)} entries`}
        description="Governed configuration values scoped per environment. Changes are audited."
      >
        <DataTable
          caption="System configuration entries with their environment, classification and approval state"
          columns={columns}
          rows={configurations}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState
              title="No governed configuration recorded"
              detail="Deployment configuration is supplied by environment rather than stored here."
            />
          }
        />
        {configurations.length > 0 ? (
          <TechnicalDetails summary="Configuration values">
            {configurations.map((row) => (
              <JsonInspector key={row.id} label={row.key} value={row.value} />
            ))}
          </TechnicalDetails>
        ) : null}
      </Panel>
    </AdministrationShell>
  );
}
