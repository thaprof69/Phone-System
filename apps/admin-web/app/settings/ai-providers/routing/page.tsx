import { SettingsPage, LoadFailure } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import { ModelRouting, type RouteView } from './model-routing';
import type { ConfiguredModel } from '../models/intelligence-models';

export const dynamic = 'force-dynamic';

export default async function ModelRoutingPage() {
  const [routes, models] = await Promise.all([
    apiGet<RouteView[]>('/admin/ai/intelligence/routes', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<ConfiguredModel[]>('/admin/ai/intelligence/models', { purpose: 'RELEASE_MANAGEMENT' }),
  ]);

  return (
    <SettingsPage
      eyebrow="AI Providers"
      title="Model Routing"
      description="Assign primary and fallback models to each product intelligence capability."
    >
      {routes.ok && models.ok ? (
        <ModelRouting initialRoutes={routes.data} models={models.data} />
      ) : (
        <LoadFailure
          subject="Model routing"
          reason={routes.ok ? (models.ok ? 'UNKNOWN' : models.reason) : routes.reason}
        />
      )}
    </SettingsPage>
  );
}
