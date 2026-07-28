import { StatusPill, formatNumber } from '@quantum-parks/ui';
import { DomainPage, LoadFailure } from '../domain-page';
import { apiGet } from '../../lib/api';
import type { MissionControl } from '../../lib/types';
import { AlertsCommandCenter, type CommunicationsReadiness } from './alerts-command-center';

export const dynamic = 'force-dynamic';

export default async function AlertsPage() {
  const [mission, communications] = await Promise.all([
    apiGet<MissionControl>('/mission-control', { purpose: 'OPERATIONS' }),
    apiGet<CommunicationsReadiness>('/admin/communications/readiness', {
      purpose: 'RELEASE_MANAGEMENT',
    }),
  ]);

  if (!mission.ok) {
    return (
      <DomainPage
        eyebrow="Mission Control"
        title="Attention & Alerts"
        description="Human attention, governed escalation and delivery evidence."
      >
        <LoadFailure subject="Alerts" reason={mission.reason} />
      </DomainPage>
    );
  }

  const total = mission.data.attention.reduce((sum, item) => sum + item.count, 0);

  return (
    <DomainPage
      eyebrow="Mission Control"
      title="Attention & Alerts"
      description="Detect urgent work, route it to the right people and prove every escalation was handled."
      meta={
        <StatusPill tone={mission.data.attention.length ? 'warning' : 'good'}>
          {formatNumber(total)} affected records
        </StatusPill>
      }
      badges={{ '/alerts': mission.data.attention.length }}
    >
      <AlertsCommandCenter
        generatedAt={mission.data.generatedAt}
        initialAttention={mission.data.attention}
        communications={
          communications.ok
            ? communications.data
            : {
                generatedAt: new Date().toISOString(),
                gmail: {
                  provider: 'GMAIL',
                  status: 'UNAVAILABLE',
                  sender: null,
                  auth: 'OAUTH_2',
                  requiredScopes: [],
                  supports: [],
                },
                whatsapp: {
                  provider: 'WHATSAPP_CLOUD',
                  status: 'UNAVAILABLE',
                  phoneNumberId: null,
                  businessAccountId: null,
                  auth: 'SYSTEM_USER_ACCESS_TOKEN',
                  supports: [],
                },
                inboundFoundation: {
                  gmail: { status: 'PLANNED', boundary: communications.reason },
                  whatsapp: { status: 'PLANNED', boundary: communications.reason },
                  zendesk: { status: 'ADAPTER_NOT_INSTALLED', boundary: communications.reason },
                },
                policy: {
                  defaultMode: 'HUMAN_APPROVAL_REQUIRED',
                  automaticRepliesEnabled: false,
                  bookingWritesEnabled: false,
                  approvedWhatsAppTemplatesRequired: true,
                },
              }
        }
      />
    </DomainPage>
  );
}
