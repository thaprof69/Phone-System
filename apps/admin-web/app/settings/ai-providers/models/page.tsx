import { SettingsPage, LoadFailure } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import { ModelsView, type ModelRow } from '../../ai-routing/registry-views';

export const dynamic = 'force-dynamic';

export default async function ModelsPage() {
  const models = await apiGet<{ items: ModelRow[] }>('/admin/ai/models', {
    purpose: 'RELEASE_MANAGEMENT',
  });

  if (!models.ok) {
    return (
      <SettingsPage
        eyebrow="AI Providers"
        title="Models"
        description="Discovered models, approval by environment, and recorded pricing."
      >
        <LoadFailure subject="Models" reason={models.reason} />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage
      eyebrow="AI Providers"
      title="Models"
      description="Discovered models, approval by environment, and recorded pricing. Prices are stored, never inferred — the platform must not invent what a provider charges."
    >
      <ModelsView models={models.data.items} />
    </SettingsPage>
  );
}
