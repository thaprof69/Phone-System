import { SettingsPage, LoadFailure } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import { IntelligenceModels, type ConfiguredModel } from './intelligence-models';

export const dynamic = 'force-dynamic';

export default async function IntelligenceModelsPage() {
  const models = await apiGet<ConfiguredModel[]>('/admin/ai/intelligence/models', {
    purpose: 'RELEASE_MANAGEMENT',
  });

  return (
    <SettingsPage
      eyebrow="AI Providers"
      title="Intelligence Models"
      description="Add and configure the AI models Quantum Parks may use for intelligence tasks."
    >
      {models.ok ? (
        <IntelligenceModels initialModels={models.data} />
      ) : (
        <LoadFailure subject="Intelligence models" reason={models.reason} />
      )}
    </SettingsPage>
  );
}
