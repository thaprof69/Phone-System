import Link from 'next/link';
import { EmptyState, Panel, StatusPill, formatNumber } from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../domain-page';
import { apiGet } from '../../lib/api';
import type { MissionControl } from '../../lib/types';

export const dynamic = 'force-dynamic';

const SEVERITY_TONE = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
} as const;

const SEVERITY_COPY = {
  critical: 'Callers may be getting the wrong answer, or a release cannot proceed.',
  high: 'A commitment to a customer or a release gate is at risk.',
  medium: 'Worth clearing before it becomes urgent.',
} as const;

export default async function AlertsPage() {
  const response = await apiGet<MissionControl>('/mission-control', { purpose: 'OPERATIONS' });

  if (!response.ok) {
    return (
      <DomainPage
        eyebrow="Mission Control"
        title="Alerts"
        description="Everything currently blocked, failing, drifted or overdue."
      >
        <LoadFailure subject="Alerts" reason={response.reason} />
      </DomainPage>
    );
  }

  const { attention } = response.data;
  const groups = (['critical', 'high', 'medium'] as const).map((severity) => ({
    severity,
    items: attention.filter((item) => item.severity === severity),
  }));
  const total = attention.reduce((sum, item) => sum + item.count, 0);

  return (
    <DomainPage
      eyebrow="Mission Control"
      title="Alerts"
      description="Everything currently blocked, failing, drifted or overdue, grouped by how urgently it needs a person."
      meta={
        <StatusPill tone={attention.length === 0 ? 'good' : 'warning'}>
          {formatNumber(total)} affected records
        </StatusPill>
      }
      badges={{ '/alerts': attention.length }}
    >
      {attention.length === 0 ? (
        <Panel title="No open alerts" eyebrow="All clear">
          <EmptyState
            title="Nothing needs attention"
            detail="No drift, failed publication, overdue work or failing test is currently outstanding."
          />
        </Panel>
      ) : (
        groups
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <Panel
              key={group.severity}
              title={`${group.severity.charAt(0).toUpperCase()}${group.severity.slice(1)}`}
              eyebrow={`${group.items.length} ${group.items.length === 1 ? 'alert' : 'alerts'}`}
              description={SEVERITY_COPY[group.severity]}
              action={
                <StatusPill tone={SEVERITY_TONE[group.severity]}>{group.severity}</StatusPill>
              }
            >
              <ul className="attention-list">
                {group.items.map((item) => (
                  <li key={item.id} className={`attention-item severity-${item.severity}`}>
                    <Link href={item.href}>
                      <span className="attention-count">{formatNumber(item.count)}</span>
                      <span className="attention-body">
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </span>
                      <span className="attention-severity">Resolve</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ))
      )}
    </DomainPage>
  );
}
