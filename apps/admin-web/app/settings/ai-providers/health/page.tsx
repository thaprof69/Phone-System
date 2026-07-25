import { SettingsPage, LoadFailure } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import { MonitoringView, type MonitoringSummary } from '../../ai-routing/monitoring-view';

export const dynamic = 'force-dynamic';

export default async function ProviderHealthPage() {
  const monitoring = await apiGet<MonitoringSummary>('/admin/ai/monitoring', {
    purpose: 'RELEASE_MANAGEMENT',
  });

  if (!monitoring.ok) {
    return (
      <SettingsPage
        eyebrow="AI Providers"
        title="Provider health"
        description="Connection health checks and degraded periods."
      >
        <LoadFailure subject="Provider health" reason={monitoring.reason} />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage
      eyebrow="AI Providers"
      title="Provider health"
      description="Health is read from recorded checks rather than inferred from the last request."
    >
      <MonitoringView summary={monitoring.data} section="health" />
    </SettingsPage>
  );
}
