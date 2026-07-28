import { SettingsPage } from '../settings-page';
import { apiGet } from '../../../lib/api';
import { CommunicationsConsole } from './communications-console';
import type { CommunicationsReadiness } from '../../alerts/alerts-command-center';

export const dynamic = 'force-dynamic';
export default async function CommunicationsPage() {
  const response = await apiGet<CommunicationsReadiness>('/admin/communications/readiness', {
    purpose: 'RELEASE_MANAGEMENT',
  });
  const readiness = response.ok ? response.data : unavailable(response.reason);
  return (
    <SettingsPage
      eyebrow="Email & WhatsApp"
      title="Channel configuration"
      description="Central identity, authentication and policy for alerts and future digital receptionists."
    >
      <CommunicationsConsole readiness={readiness} mode="overview" />
    </SettingsPage>
  );
}
export function unavailable(reason: string): CommunicationsReadiness {
  return {
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
    inboundFoundation: { system: { status: 'UNAVAILABLE', boundary: reason } },
    policy: {
      defaultMode: 'HUMAN_APPROVAL_REQUIRED',
      automaticRepliesEnabled: false,
      bookingWritesEnabled: false,
      approvedWhatsAppTemplatesRequired: true,
    },
  };
}
