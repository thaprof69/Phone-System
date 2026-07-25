import { SettingsPage, LoadFailure } from '../../settings-page';
import { apiGet } from '../../../../lib/api';
import {
  ExecutionView,
  executionFilterOptions,
  filterRuns,
  type ExecutionFilters,
  type ExecutionRun,
} from '../execution-view';
import type { AIWorkspace } from '../ai-console';

export const dynamic = 'force-dynamic';

const BASE = '/settings/ai-routing/executions';

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first && first.length > 0 ? first : undefined;
}

export default async function ExecutionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const [execution, workspace] = await Promise.all([
    apiGet<{ items: ExecutionRun[] }>('/admin/ai/execution?limit=200', {
      purpose: 'RELEASE_MANAGEMENT',
    }),
    apiGet<AIWorkspace>('/admin/ai/workspace', { purpose: 'RELEASE_MANAGEMENT' }),
  ]);

  if (!execution.ok) {
    return (
      <SettingsPage
        eyebrow="AI Routing"
        title="Execution history"
        description="Every run, its provenance, and the record it enriched."
      >
        <LoadFailure subject="Execution history" reason={execution.reason} />
      </SettingsPage>
    );
  }

  const filters: ExecutionFilters = {
    from: single(params.from),
    to: single(params.to),
    provider: single(params.provider),
    model: single(params.model),
    capability: single(params.capability),
    state: single(params.state),
    fallback: single(params.fallback),
  };
  const page = Number(single(params.page) ?? '1');

  return (
    <SettingsPage
      eyebrow="AI Routing"
      title="Execution history"
      description="Every run, its provenance, and the record it enriched — the evidence behind Intelligence → Provider performance and Costs."
    >
      <ExecutionView
        runs={filterRuns(execution.data.items, filters)}
        options={executionFilterOptions(execution.data.items)}
        filters={filters}
        page={Number.isFinite(page) ? Math.trunc(page) : 1}
        basePath={BASE}
        services={workspace.ok ? workspace.data.execution.services.length : 0}
        routes={workspace.ok ? workspace.data.execution.routes.length : 0}
      />
    </SettingsPage>
  );
}
