import { SettingsPage, LoadFailure } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import { ProviderCard, type ProviderStatus } from './provider-card';

export const dynamic = 'force-dynamic';

export default async function VoiceRuntimePage() {
  const statusResponse = await apiGet<ProviderStatus>('/admin/integrations/elevenlabs/status', {
    purpose: 'RELEASE_MANAGEMENT',
  });

  return (
    <SettingsPage
      description="Set up and test the AI receptionist before going live."
      eyebrow="AI Providers"
      title="ElevenLabs setup"
    >
      {statusResponse.ok ? (
        <ProviderCard initialStatus={statusResponse.data} />
      ) : (
        // A failed status read must not be rendered as an empty configuration. Doing so
        // reported "Key not saved · Agent not configured" for a correctly saved provider
        // whenever the API was unreachable.
        <LoadFailure subject="ElevenLabs configuration" reason={statusResponse.reason} />
      )}
    </SettingsPage>
  );
}
