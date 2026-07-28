import { SettingsPage } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import { CommunicationsConsole } from '../communications-console';
import type { CommunicationsReadiness } from '../../../alerts/alerts-command-center';
import { unavailable } from '../page';
export const dynamic = 'force-dynamic';
export default async function EmailSettingsPage() {
  const response = await apiGet<CommunicationsReadiness>('/admin/communications/readiness', {
    purpose: 'RELEASE_MANAGEMENT',
  });
  return (
    <SettingsPage
      eyebrow="Email & WhatsApp"
      title="Email configuration"
      description="Gmail identity, OAuth, alert delivery and the controlled path to inbound email reception."
    >
      <CommunicationsConsole
        readiness={response.ok ? response.data : unavailable(response.reason)}
        mode="email"
      />
    </SettingsPage>
  );
}
