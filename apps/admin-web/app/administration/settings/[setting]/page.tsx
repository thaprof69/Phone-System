import { notFound } from 'next/navigation';
import {
  ElevenLabsIntegrationCard,
  type ElevenLabsIntegrationStatus,
} from '../../../elevenlabs-integration';
import { apiGet } from '../../../../lib/api';
import { AdministrationShell, ConfigurationPlaceholder } from '../../admin-shell';

const content = {
  general: ['General', 'Organisation, environment, locale, and application defaults.'],
  knowledge: ['Knowledge', 'Knowledge publication, expiry, language, and approval controls.'],
  policies: ['Policies', 'Disclosure, retention, privacy, verification, and sensitive-case rules.'],
  'feature-flags': [
    'Feature Flags',
    'Governed feature availability and emergency-disable controls.',
  ],
} as const;

export default async function SettingPage({ params }: { params: Promise<{ setting: string }> }) {
  const { setting } = await params;
  if (setting === 'ai-intelligence') notFound();
  if (setting === 'voice-runtime') {
    const response = await apiGet<ElevenLabsIntegrationStatus>(
      '/admin/integrations/elevenlabs/status',
    );
    const status: ElevenLabsIntegrationStatus = response.ok
      ? response.data
      : {
          provider: 'ELEVENLABS',
          status: 'ERROR',
          productionRoutingEnabled: false,
        };
    return (
      <AdministrationShell
        area="Settings"
        setting="Voice Runtime"
        title="Voice Runtime"
        description="Configure the managed ElevenLabs runtime separately from Quantum Parks AI Intelligence."
      >
        <ElevenLabsIntegrationCard initialStatus={status} authorized={response.ok} />
      </AdministrationShell>
    );
  }
  const item = content[setting as keyof typeof content];
  if (!item) notFound();
  return (
    <AdministrationShell area="Settings" setting={item[0]} title={item[0]} description={item[1]}>
      <ConfigurationPlaceholder title={item[0]} description={item[1]} />
    </AdministrationShell>
  );
}
