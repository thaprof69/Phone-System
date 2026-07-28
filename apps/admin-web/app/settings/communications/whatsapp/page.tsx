import { SettingsPage } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import { CommunicationsConsole } from '../communications-console';
import type { CommunicationsReadiness } from '../../../alerts/alerts-command-center';
import { unavailable } from '../page';
export const dynamic = 'force-dynamic';
export default async function WhatsAppSettingsPage() {
  const response = await apiGet<CommunicationsReadiness>('/admin/communications/readiness', {
    purpose: 'RELEASE_MANAGEMENT',
  });
  return (
    <SettingsPage
      eyebrow="Email & WhatsApp"
      title="WhatsApp configuration"
      description="Meta business identity, phone number, approved templates, webhooks and reply policy."
    >
      <CommunicationsConsole
        readiness={response.ok ? response.data : unavailable(response.reason)}
        mode="whatsapp"
      />
    </SettingsPage>
  );
}
