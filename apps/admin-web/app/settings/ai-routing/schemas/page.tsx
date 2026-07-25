import { SettingsPage, LoadFailure } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import {
  GovernanceView,
  type PromptVersion,
  type SchemaVersion,
  type TaxonomyVersion,
} from '../governance-view';

export const dynamic = 'force-dynamic';

type Catalogue = {
  prompts: PromptVersion[];
  schemas: SchemaVersion[];
  taxonomies: TaxonomyVersion[];
};

export default async function SchemasPage() {
  const catalogue = await apiGet<Catalogue>('/admin/ai/catalogue', {
    purpose: 'RELEASE_MANAGEMENT',
  });

  if (!catalogue.ok) {
    return (
      <SettingsPage
        eyebrow="AI Routing"
        title="Schemas and taxonomies"
        description="Output schema and taxonomy versions a capability may depend on."
      >
        <LoadFailure subject="Schemas and taxonomies" reason={catalogue.reason} />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage
      eyebrow="AI Routing"
      title="Schemas and taxonomies"
      description="Output schema and taxonomy versions a capability may depend on."
    >
      <GovernanceView
        section="schemas"
        prompts={[]}
        schemas={catalogue.data.schemas ?? []}
        taxonomies={catalogue.data.taxonomies ?? []}
        budgetStatus={[]}
        scopeOptions={[]}
        spendMicros={0}
      />
    </SettingsPage>
  );
}
