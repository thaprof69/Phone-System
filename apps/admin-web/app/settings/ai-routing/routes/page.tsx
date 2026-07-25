import { SettingsPage, LoadFailure } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import { RoutesView, type RouteRow } from '../registry-views';

export const dynamic = 'force-dynamic';

type RouteRegistry = {
  items: RouteRow[];
  connections: Array<{ id: string; connectionLabel: string; providerKey: string; status: string }>;
  models: Array<{
    id: string;
    connectionId: string;
    providerModelId: string;
    available: boolean;
    deprecated: boolean;
  }>;
};

export default async function RoutesPage() {
  const routes = await apiGet<RouteRegistry>('/admin/ai/routes', { purpose: 'RELEASE_MANAGEMENT' });

  if (!routes.ok) {
    return (
      <SettingsPage
        eyebrow="AI Routing"
        title="Routes"
        description="Provider and model routing per capability, with ordered fallbacks."
      >
        <LoadFailure subject="Routes" reason={routes.reason} />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage
      eyebrow="AI Routing"
      title="Routes"
      description="Provider and model routing per capability, with ordered fallbacks and pre-activation validation."
    >
      <RoutesView
        routes={routes.data.items}
        connections={routes.data.connections}
        models={routes.data.models}
      />
    </SettingsPage>
  );
}
