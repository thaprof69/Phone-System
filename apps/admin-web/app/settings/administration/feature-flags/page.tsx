import {
  Banner,
  DataTable,
  EmptyState,
  JsonInspector,
  Panel,
  StatusPill,
  TechnicalDetails,
  formatNumber,
  humaniseState,
  type Column,
} from '@quantum-parks/ui';
import { SettingsPage } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import { ToggleFeatureFlagForm } from '../administration-actions';

export const dynamic = 'force-dynamic';

type FeatureFlag = {
  id: string;
  key: string;
  environment: string;
  enabled: boolean;
  configuration: Record<string, unknown>;
  updatedAt: string;
};

/**
 * Several of these are not conveniences — they are approval gates. Turning one on
 * without the corresponding sign-off is what the readiness evaluation exists to catch.
 */
const GATE_EXPLANATIONS: Record<string, string> = {
  AUDIO_INGESTION_ENABLED:
    'Audio is rejected at ingestion until a separate approval is recorded. The launch is transcript-only.',
  CUSTOM_VOICE_ENABLED:
    'Custom voices require recorded speaker consent with a permitted use and expiry before they can be assigned.',
  BOOKING_WRITES_ENABLED:
    'The receptionist never performs a capacity-affecting booking action while this is off.',
};

export default async function FeatureFlagsPage() {
  const response = await apiGet<{ items: FeatureFlag[] }>('/administration/feature-flags', {
    purpose: 'RELEASE_MANAGEMENT',
  });

  if (!response.ok) {
    return (
      <SettingsPage
        eyebrow="Administration"
        title="Feature flags"
        description="Capabilities held behind an explicit approval gate."
      >
        <Panel title="Feature flags unavailable">
          <EmptyState title="Could not be read" detail={response.reason} />
        </Panel>
      </SettingsPage>
    );
  }

  const flags = response.data.items;
  const gates = flags.filter((flag) => GATE_EXPLANATIONS[flag.key]);
  const enabledGates = gates.filter((flag) => flag.enabled);

  const columns: Column<FeatureFlag>[] = [
    {
      key: 'key',
      header: 'Capability',
      render: (flag) => (
        <>
          {humaniseState(flag.key)}
          {GATE_EXPLANATIONS[flag.key] ? (
            <small className="cell-sub">{GATE_EXPLANATIONS[flag.key]}</small>
          ) : null}
        </>
      ),
    },
    {
      key: 'environment',
      header: 'Environment',
      render: (flag) => humaniseState(flag.environment),
    },
    {
      key: 'enabled',
      header: 'State',
      render: (flag) =>
        flag.enabled ? (
          <StatusPill tone="good">Enabled</StatusPill>
        ) : (
          <StatusPill tone="neutral">Disabled</StatusPill>
        ),
    },
    {
      key: 'kind',
      header: 'Type',
      render: (flag) =>
        GATE_EXPLANATIONS[flag.key] ? (
          <StatusPill tone="warning">Approval gate</StatusPill>
        ) : (
          <span className="muted-cell">Behaviour flag</span>
        ),
      priority: 'secondary',
    },
    {
      key: 'manage',
      header: 'Change',
      // Always mounted: `ToggleFeatureFlagForm` reads its own success state, so it
      // stays correct even after the table row it lives in re-renders with the new
      // `enabled` value.
      render: (flag) => (
        <details className="row-actions">
          <summary>{flag.enabled ? 'Disable' : 'Enable'}</summary>
          <div className="row-actions-body">
            <ToggleFeatureFlagForm flagId={flag.id} enabled={flag.enabled} />
          </div>
        </details>
      ),
    },
  ];

  return (
    <SettingsPage
      eyebrow="Administration"
      title="Feature flags"
      description="Capabilities that stay off until a separate approval is recorded, plus ordinary behaviour switches."
      meta={
        <StatusPill tone={enabledGates.length > 0 ? 'warning' : 'good'}>
          {formatNumber(enabledGates.length)} approval gates open
        </StatusPill>
      }
    >
      <Banner tone="info" title="Some of these are gates, not preferences">
        Audio ingestion, custom voices and booking writes stay disabled until they are separately
        approved. Enabling one without that approval is caught by the readiness evaluation.
      </Banner>

      <Panel
        title="Flags"
        eyebrow={`${formatNumber(flags.length)} flags`}
        description="Each flag is scoped to an environment, so enabling something locally does not enable it in production."
      >
        <DataTable
          caption="Feature flags with their environment, state and whether they act as an approval gate"
          columns={columns}
          rows={flags}
          getRowKey={(flag) => flag.id}
          empty={
            <EmptyState
              title="No feature flags"
              detail="Flags are seeded with the platform and scoped per environment."
            />
          }
        />
      </Panel>

      {flags.some((flag) => Object.keys(flag.configuration).length > 0) ? (
        <TechnicalDetails summary="Flag configuration">
          {flags
            .filter((flag) => Object.keys(flag.configuration).length > 0)
            .map((flag) => (
              <JsonInspector key={flag.id} label={flag.key} value={flag.configuration} />
            ))}
        </TechnicalDetails>
      ) : null}
    </SettingsPage>
  );
}
