import { SettingsPage, LoadFailure } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import { CapabilitiesView, type CapabilityRow } from '../registry-views';
import type { ExecutionRun } from '../execution-view';

export const dynamic = 'force-dynamic';

type Catalogue = { capabilities: CapabilityRow[] };

export default async function CapabilitiesPage() {
  const [catalogue, execution] = await Promise.all([
    apiGet<Catalogue>('/admin/ai/catalogue', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<{ items: ExecutionRun[] }>('/admin/ai/execution?limit=200', {
      purpose: 'RELEASE_MANAGEMENT',
    }),
  ]);

  if (!catalogue.ok) {
    return (
      <SettingsPage
        eyebrow="AI Routing"
        title="Capabilities"
        description="Business capabilities and the service contract each version implements."
      >
        <LoadFailure subject="Capabilities" reason={catalogue.reason} />
      </SettingsPage>
    );
  }

  const runsByCapability: Record<string, number> = {};
  if (execution.ok) {
    for (const run of execution.data.items) {
      runsByCapability[run.capabilityKey] = (runsByCapability[run.capabilityKey] ?? 0) + 1;
    }
  }

  return (
    <SettingsPage
      eyebrow="AI Routing"
      title="Capabilities"
      description="Business capabilities and the service contract each version implements. Capabilities are the stable abstraction — models and providers are how one is executed, not what it is."
    >
      <CapabilitiesView
        capabilities={catalogue.data.capabilities ?? []}
        runsByCapability={runsByCapability}
      />
    </SettingsPage>
  );
}
