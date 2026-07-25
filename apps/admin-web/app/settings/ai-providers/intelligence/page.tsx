import { SettingsPage, LoadFailure } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import {
  ProvidersView,
  type ProviderConnection,
  type ProviderDefinition,
} from '../../ai-routing/registry-views';
import type { AIWorkspace } from '../../ai-routing/ai-console';

export const dynamic = 'force-dynamic';

export default async function IntelligenceProvidersPage() {
  const [registry, workspace] = await Promise.all([
    apiGet<{ items: ProviderDefinition[] }>('/admin/ai/providers/registry', {
      purpose: 'RELEASE_MANAGEMENT',
    }),
    apiGet<AIWorkspace & { providers: { connections: ProviderConnection[] } }>(
      '/admin/ai/workspace',
      { purpose: 'RELEASE_MANAGEMENT' },
    ),
  ]);

  if (!registry.ok) {
    return (
      <SettingsPage
        eyebrow="AI Providers"
        title="Intelligence providers"
        description="Providers connected for post-call enrichment, with test-before-save proof."
      >
        <LoadFailure subject="Intelligence providers" reason={registry.reason} />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage
      eyebrow="AI Providers"
      title="Intelligence providers"
      description="Providers connected for post-call enrichment (summaries, classification, knowledge-gap detection). A provider is usable only when an adapter for it exists in this platform."
    >
      <ProvidersView
        definitions={registry.data.items}
        connections={workspace.ok ? (workspace.data.providers?.connections ?? []) : []}
      />
    </SettingsPage>
  );
}
