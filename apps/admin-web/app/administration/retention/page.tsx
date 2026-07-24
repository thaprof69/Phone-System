import {
  Banner,
  DataTable,
  EmptyState,
  Panel,
  StatusPill,
  formatDate,
  formatNumber,
  humaniseState,
  type Column,
  type Tone,
} from '@quantum-parks/ui';
import { AdministrationShell } from '../admin-shell';
import { apiGet } from '../../../lib/api';

export const dynamic = 'force-dynamic';

type RetentionPolicy = {
  id: string;
  environment: string;
  dataType: string;
  classification: string;
  retentionDays: number;
  approvedBy: string | null;
  approvedAt: string | null;
  active: boolean;
};

function classificationTone(classification: string): Tone {
  if (classification === 'RESTRICTED') return 'danger';
  if (classification === 'CONFIDENTIAL') return 'warning';
  return 'neutral';
}

export default async function RetentionPage() {
  const response = await apiGet<{ items: RetentionPolicy[] }>('/retention-policies', {
    purpose: 'PRIVACY_AUDIT',
  });

  if (!response.ok) {
    return (
      <AdministrationShell
        current="/administration/retention"
        title="Retention"
        description="How long each class of data is kept."
      >
        <Panel title="Retention unavailable">
          <EmptyState title="Could not be read" detail={response.reason} />
        </Panel>
      </AdministrationShell>
    );
  }

  const policies = response.data.items;
  const unapproved = policies.filter((policy) => policy.approvedAt === null);
  const productionInactive = policies.filter(
    (policy) => policy.environment === 'production' && !policy.active,
  );

  const columns: Column<RetentionPolicy>[] = [
    {
      key: 'dataType',
      header: 'Data',
      render: (policy) => (
        <>
          {humaniseState(policy.dataType)}
          <small className="cell-sub">{humaniseState(policy.environment)}</small>
        </>
      ),
    },
    {
      key: 'classification',
      header: 'Classification',
      render: (policy) => (
        <StatusPill tone={classificationTone(policy.classification)}>
          {humaniseState(policy.classification)}
        </StatusPill>
      ),
    },
    {
      key: 'retention',
      header: 'Kept for',
      align: 'end',
      render: (policy) => `${formatNumber(policy.retentionDays)} days`,
    },
    {
      key: 'approved',
      header: 'Approval',
      render: (policy) =>
        policy.approvedAt ? (
          <>
            <StatusPill tone="good">Approved</StatusPill>
            <small className="cell-sub">{formatDate(policy.approvedAt)}</small>
          </>
        ) : (
          <StatusPill tone="warning">Not approved</StatusPill>
        ),
    },
    {
      key: 'active',
      header: 'Enforced',
      render: (policy) =>
        policy.active ? (
          <StatusPill tone="good">Active</StatusPill>
        ) : (
          <StatusPill tone="neutral">Inactive</StatusPill>
        ),
    },
  ];

  return (
    <AdministrationShell
      current="/administration/retention"
      title="Retention"
      description="How long each class of data is kept, whether that period has been approved, and whether the policy is being enforced."
      meta={
        <StatusPill tone={unapproved.length > 0 ? 'warning' : 'good'}>
          {formatNumber(unapproved.length)} awaiting approval
        </StatusPill>
      }
    >
      {productionInactive.length > 0 ? (
        <Banner tone="warning" title="Production retention is not yet active">
          Production readiness requires an approved and active retention policy. This is one of the
          gates currently blocking production routing.
        </Banner>
      ) : null}

      <Panel
        title="Retention policies"
        eyebrow={`${formatNumber(policies.length)} policies`}
        description="Raw provider evidence is held on the shortest clock; redacted records the longest."
      >
        <DataTable
          caption="Retention policies with their classification, retention period, approval and enforcement state"
          columns={columns}
          rows={policies}
          getRowKey={(policy) => policy.id}
          empty={
            <EmptyState
              title="No retention policies"
              detail="A policy per data type and environment is required before production."
            />
          }
        />
      </Panel>
    </AdministrationShell>
  );
}
