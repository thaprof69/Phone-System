import Link from 'next/link';
import {
  Banner,
  DefinitionList,
  Panel,
  StatusPill,
  formatNumber,
  humaniseState,
  toneForState,
} from '@quantum-parks/ui';
import { SettingsPage } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import type { MissionControl, Readiness } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

type RetentionPolicy = {
  environment: string;
  dataType: string;
  active: boolean;
  approvedAt: string | null;
};

/**
 * The security and privacy posture, stated as facts the platform can evidence.
 * Where a control is not yet approved it says so rather than showing a green tick.
 */
export default async function SecurityPage() {
  const [readinessResponse, missionResponse, retentionResponse] = await Promise.all([
    apiGet<Readiness>('/readiness', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<MissionControl>('/mission-control', { purpose: 'OPERATIONS' }),
    apiGet<{ items: RetentionPolicy[] }>('/retention-policies', { purpose: 'PRIVACY_AUDIT' }),
  ]);

  const readiness = readinessResponse.ok ? readinessResponse.data : null;
  const mission = missionResponse.ok ? missionResponse.data : null;
  const retention = retentionResponse.ok ? retentionResponse.data.items : [];
  const retentionApproved = retention.some((policy) => policy.approvedAt !== null && policy.active);

  const privacyBlockers =
    readiness?.blockers.filter(
      (blocker) =>
        blocker.toLowerCase().includes('privacy') ||
        blocker.toLowerCase().includes('retention') ||
        blocker.toLowerCase().includes('disclosure') ||
        blocker.toLowerCase().includes('region'),
    ) ?? [];

  const controls = [
    {
      label: 'Provider credentials',
      state: 'Encrypted at rest',
      tone: 'good' as const,
      detail:
        'Keys are encrypted with AES-256-GCM and never returned to the browser. The interface only ever sees a reference.',
    },
    {
      label: 'Test before save',
      state: 'Enforced',
      tone: 'good' as const,
      detail:
        'A credential cannot be stored until it has been validated against the provider, and the proof expires after five minutes.',
    },
    {
      label: 'Payment data',
      state: 'Excluded',
      tone: 'good' as const,
      detail:
        'The receptionist never takes card details. Calls that mention them are transferred rather than handled.',
    },
    {
      label: 'Audio',
      state: 'Not ingested',
      tone: 'good' as const,
      detail: 'Payloads declaring audio are rejected at ingestion. The launch is transcript-only.',
    },
    {
      label: 'Transcript redaction',
      state: 'Applied',
      tone: 'good' as const,
      detail:
        'A redacted revision is produced from the canonical transcript, and the canonical revision is retained separately for audit.',
    },
    {
      label: 'Audit log',
      state: 'Hash-chained',
      tone: 'good' as const,
      detail:
        'Each entry commits to the previous hash, so entries cannot be edited or removed silently.',
    },
    {
      label: 'Retention approval',
      state: retentionApproved ? 'Approved and active' : 'Not approved',
      tone: retentionApproved ? ('good' as const) : ('warning' as const),
      detail: retentionApproved
        ? 'An approved retention policy is being enforced.'
        : 'Production readiness requires an approved and active retention policy.',
    },
    {
      label: 'Identity',
      state:
        mission?.runtime.environment === 'production' ? 'OIDC enforced' : 'Development identity',
      tone:
        mission?.runtime.environment === 'production' ? ('good' as const) : ('warning' as const),
      detail:
        mission?.runtime.environment === 'production'
          ? 'Requests are verified against the configured issuer.'
          : 'Outside production the API synthesises a development principal, so RBAC is not exercised by the browser here.',
    },
  ];

  return (
    <SettingsPage
      eyebrow="Administration"
      title="Security and privacy"
      description="The controls protecting caller data, and which of them still need recorded approval before production."
      meta={
        <StatusPill tone={privacyBlockers.length === 0 ? 'good' : 'warning'}>
          {formatNumber(privacyBlockers.length)} privacy blockers
        </StatusPill>
      }
    >
      {privacyBlockers.length > 0 ? (
        <Banner
          tone="warning"
          title="Privacy and retention approvals are incomplete"
          action={
            <Link className="button ghost small" href="/settings/administration/retention">
              Retention
            </Link>
          }
        >
          These are recorded approvals, not code changes. Until they exist the readiness evaluation
          keeps production routing blocked.
        </Banner>
      ) : null}

      <Panel title="Controls" eyebrow="What is enforced today">
        <div className="control-grid">
          {controls.map((control) => (
            <div className="control-card" key={control.label}>
              <div>
                <strong>{control.label}</strong>
                <StatusPill tone={control.tone}>{control.state}</StatusPill>
              </div>
              <p>{control.detail}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Data handling"
        eyebrow="How records are separated"
        description="Raw provider evidence, the provider transcript, the canonical transcript, the redacted revision and generated intelligence are distinct records. None overwrites another."
      >
        <DefinitionList
          items={[
            {
              term: 'Raw provider evidence',
              value: 'Immutable object storage',
              hint: 'Written before the webhook is acknowledged, so a processing failure never loses it.',
            },
            {
              term: 'Canonical transcript',
              value: 'Revision 1',
              hint: 'Normalised from the provider payload. Retained for audit.',
            },
            {
              term: 'Redacted revision',
              value: 'Revision 2',
              hint: 'What operators see by default. Personal data is removed by the redaction pass.',
            },
            {
              term: 'Corrections',
              value: 'New revisions',
              hint: 'A correction never edits the record it corrects; both are kept.',
            },
            {
              term: 'Generated intelligence',
              value: 'Evidence-linked',
              hint: 'Summaries and classifications must cite transcript spans, and cannot assert a completed action.',
            },
          ]}
        />
      </Panel>

      {readiness && privacyBlockers.length > 0 ? (
        <Panel title="Outstanding approvals" eyebrow="Blocking production">
          <ol className="blocker-list">
            {privacyBlockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ol>
        </Panel>
      ) : null}
    </SettingsPage>
  );
}
