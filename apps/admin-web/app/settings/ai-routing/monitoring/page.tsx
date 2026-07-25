import { SettingsPage, LoadFailure } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import { MonitoringView, type MonitoringSummary } from '../monitoring-view';

export const dynamic = 'force-dynamic';

export default async function MonitoringPage() {
  const monitoring = await apiGet<MonitoringSummary>('/admin/ai/monitoring', {
    purpose: 'RELEASE_MANAGEMENT',
  });

  if (!monitoring.ok) {
    return (
      <SettingsPage
        eyebrow="AI Routing"
        title="Monitoring"
        description="Success, fallback and failure rates, drilling through to runs."
      >
        <LoadFailure subject="Monitoring" reason={monitoring.reason} />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage
      eyebrow="AI Routing"
      title="Monitoring"
      description="Success, fallback and failure rates, latency and spend, every figure linking back to the runs that produced it."
    >
      <MonitoringView summary={monitoring.data} section="runs" />
    </SettingsPage>
  );
}
