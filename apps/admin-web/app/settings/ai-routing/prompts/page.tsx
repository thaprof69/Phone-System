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

export default async function PromptsPage() {
  const catalogue = await apiGet<Catalogue>('/admin/ai/catalogue', {
    purpose: 'RELEASE_MANAGEMENT',
  });

  if (!catalogue.ok) {
    return (
      <SettingsPage
        eyebrow="AI Routing"
        title="Prompts"
        description="Prompt versions, approval and rollback."
      >
        <LoadFailure subject="Prompts" reason={catalogue.reason} />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage
      eyebrow="AI Routing"
      title="Prompts"
      description="Prompt versions, approval and rollback."
    >
      <GovernanceView
        section="prompts"
        prompts={catalogue.data.prompts ?? []}
        schemas={[]}
        taxonomies={[]}
        budgetStatus={[]}
        scopeOptions={[]}
        spendMicros={0}
      />
    </SettingsPage>
  );
}
