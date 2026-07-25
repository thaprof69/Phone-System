import Link from 'next/link';
import {
  Banner,
  DataTable,
  DefinitionList,
  EmptyState,
  Panel,
  StatusPill,
  TechnicalDetails,
  formatCurrencyFromMicros,
  formatDateTime,
  formatLatency,
  formatNumber,
  humaniseState,
  toneForState,
  type Column,
  type Tone,
} from '@quantum-parks/ui';
import { ModelApprovalActions, RouteBuilder, RouteVersionActions } from './ai-actions';

/**
 * Providers, models, capabilities and routes rendered from the code-owned registries.
 *
 * The connection form is generated from each adapter's declared credential fields, so
 * adding a provider means adding an adapter and a definition — not editing a form.
 */

export type ProviderDefinition = {
  key: string;
  displayName: string;
  installed: boolean;
  support: string;
  description: string;
  credentialFields: Array<{
    name: string;
    label: string;
    kind: string;
    required: boolean;
    hint: string;
  }>;
  capabilities: {
    structuredOutput: boolean;
    embeddings: boolean;
    modelDiscovery: boolean;
    healthCheck: boolean;
  };
  regions: string[] | null;
  retention: string;
  productionRequirements: string[];
  unavailableReason?: string;
};

export type ProviderConnection = {
  id: string;
  providerKey: string;
  connectionLabel: string;
  environment: string;
  status: string;
  enabled: boolean;
  synthetic: boolean;
  lastVerifiedAt?: string | null;
  approvedDataRegion?: string | null;
  productionEligible?: boolean;
};

function supportTone(support: string): Tone {
  if (support === 'SUPPORTED') return 'good';
  if (support === 'NON_PRODUCTION_ONLY') return 'warning';
  return 'neutral';
}

export function ProvidersView({
  definitions,
  connections,
}: {
  definitions: ProviderDefinition[];
  connections: ProviderConnection[];
}) {
  const installed = definitions.filter((definition) => definition.installed);
  const unavailable = definitions.filter((definition) => !definition.installed);

  const connectionColumns: Column<ProviderConnection>[] = [
    {
      key: 'label',
      header: 'Connection',
      render: (connection) => (
        <>
          {connection.connectionLabel}
          <small className="cell-sub">
            {connection.providerKey} · {humaniseState(connection.environment)}
          </small>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (connection) => (
        <StatusPill tone={toneForState(connection.status)}>
          {humaniseState(connection.status)}
        </StatusPill>
      ),
    },
    {
      key: 'synthetic',
      header: 'Kind',
      // A synthetic connection can never serve production, so it is labelled wherever it
      // appears rather than only where someone remembered to check.
      render: (connection) =>
        connection.synthetic ? (
          <StatusPill tone="warning">Synthetic</StatusPill>
        ) : (
          <StatusPill tone="neutral">Real</StatusPill>
        ),
    },
    {
      key: 'region',
      header: 'Approved region',
      render: (connection) =>
        connection.approvedDataRegion ?? <span className="muted-cell">Not recorded</span>,
      priority: 'secondary',
    },
    {
      key: 'verified',
      header: 'Last verified',
      render: (connection) =>
        connection.lastVerifiedAt ? (
          formatDateTime(connection.lastVerifiedAt)
        ) : (
          <span className="muted-cell">Never</span>
        ),
      priority: 'secondary',
    },
    {
      key: 'production',
      header: 'Production',
      render: (connection) =>
        connection.productionEligible ? (
          <StatusPill tone="good">Eligible</StatusPill>
        ) : (
          <span className="muted-cell">Not eligible</span>
        ),
    },
  ];

  return (
    <>
      <Banner tone="info" title="Providers are adapter-driven">
        A provider is usable only when an adapter for it exists in this platform. The connection
        form is generated from each adapter&rsquo;s declared credential fields rather than written
        around one vendor.
      </Banner>

      <Panel
        title="Connections"
        eyebrow={`${formatNumber(connections.length)} configured`}
        description="Credentials are validated against the provider before they are stored and are never returned to the browser."
      >
        <DataTable
          caption="Configured provider connections with their status, kind and production eligibility"
          columns={connectionColumns}
          rows={connections}
          getRowKey={(connection) => connection.id}
          empty={
            <EmptyState
              title="No connections"
              detail="Connect an installed adapter to begin discovering models."
            />
          }
        />
      </Panel>

      <Panel
        title="Installed adapters"
        eyebrow={`${formatNumber(installed.length)} available`}
        description="OpenAI is the first production-grade adapter. The simulator can never satisfy production readiness."
      >
        {installed.map((definition) => (
          <div className="provider-card" key={definition.key}>
            <div className="provider-card-head">
              <div>
                <strong>{definition.displayName}</strong>
                <span>{definition.description}</span>
              </div>
              <StatusPill tone={supportTone(definition.support)}>
                {humaniseState(definition.support)}
              </StatusPill>
            </div>

            <DefinitionList
              items={[
                {
                  term: 'Structured output',
                  value: definition.capabilities.structuredOutput ? 'Supported' : 'Not supported',
                },
                {
                  term: 'Model discovery',
                  value: definition.capabilities.modelDiscovery ? 'Supported' : 'Not supported',
                },
                {
                  term: 'Health checks',
                  value: definition.capabilities.healthCheck ? 'Supported' : 'Not supported',
                },
                {
                  term: 'Regions',
                  value: definition.regions ? definition.regions.join(', ') : 'Not pinnable',
                  hint: definition.retention,
                },
              ]}
            />

            {definition.credentialFields.length > 0 ? (
              <>
                <p className="eyebrow provider-fields-heading">Credential fields</p>
                <ul className="schema-list">
                  {definition.credentialFields.map((field) => (
                    <li key={field.name}>
                      <code className="inline-code">{field.name}</code>
                      <span className="schema-type">{field.kind}</span>
                      {field.required ? <StatusPill tone="warning">Required</StatusPill> : null}
                      <small>{field.hint}</small>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            <TechnicalDetails summary="What this provider needs before production">
              <ol className="blocker-list">
                {definition.productionRequirements.map((requirement) => (
                  <li key={requirement}>{requirement}</li>
                ))}
              </ol>
            </TechnicalDetails>
          </div>
        ))}
      </Panel>

      <Panel
        title="Not installed"
        eyebrow={`${formatNumber(unavailable.length)} considered`}
        description="Listed so it is clear they were considered. There is deliberately no connect action: offering one would promise a capability this platform does not have."
      >
        <ul className="capability-grid">
          {unavailable.map((definition) => (
            <li key={definition.key}>
              <span>{definition.displayName}</span>
              <StatusPill tone="neutral">
                {definition.unavailableReason ?? 'Adapter not installed'}
              </StatusPill>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

export type ModelRow = {
  id: string;
  providerKey: string;
  connectionLabel: string | null;
  providerModelId: string;
  displayName: string | null;
  available: boolean;
  deprecated: boolean;
  structuredOutput: string;
  jsonSchemaSupport: string;
  embeddingSupport: string;
  contextLimit: number | null;
  outputLimit: number | null;
  regionRestrictions: string[];
  lastVerifiedAt: string | null;
  productionApproved: boolean;
  approvals: Array<{ environment: string; approved: boolean; approvedBy: string; reason: string }>;
  price: {
    currency: string;
    inputMicrosPerMillion: number | null;
    outputMicrosPerMillion: number | null;
    sourceUrl: string;
  } | null;
  latencyProfile: { runs: number; p50Ms: number | null; p95Ms: number | null } | null;
};

export function ModelsView({ models }: { models: ModelRow[] }) {
  const productionApproved = models.filter((model) => model.productionApproved);
  const unavailable = models.filter((model) => !model.available || model.deprecated);

  const columns: Column<ModelRow>[] = [
    {
      key: 'model',
      header: 'Model',
      render: (model) => (
        <>
          {model.displayName ?? model.providerModelId}
          <small className="cell-sub">
            {model.providerKey} · {model.connectionLabel ?? 'no connection'}
          </small>
        </>
      ),
    },
    {
      key: 'availability',
      header: 'Availability',
      render: (model) =>
        model.deprecated ? (
          <StatusPill tone="danger">Deprecated</StatusPill>
        ) : model.available ? (
          <StatusPill tone="good">Available</StatusPill>
        ) : (
          <StatusPill tone="warning">Unavailable</StatusPill>
        ),
    },
    {
      key: 'structured',
      header: 'Structured output',
      render: (model) => (
        <StatusPill tone={toneForState(model.structuredOutput)}>
          {humaniseState(model.structuredOutput)}
        </StatusPill>
      ),
    },
    {
      key: 'limits',
      header: 'Context window',
      align: 'end',
      // Absent rather than guessed when the provider has not told us.
      render: (model) =>
        model.contextLimit === null ? (
          <span className="muted-cell">Not verified</span>
        ) : (
          formatNumber(model.contextLimit)
        ),
      priority: 'secondary',
    },
    {
      key: 'price',
      header: 'Cost per million',
      align: 'end',
      render: (model) =>
        model.price ? (
          <>
            {formatCurrencyFromMicros(model.price.inputMicrosPerMillion, model.price.currency)} in
            <small className="cell-sub">
              {formatCurrencyFromMicros(model.price.outputMicrosPerMillion, model.price.currency)}{' '}
              out
            </small>
          </>
        ) : (
          <span className="muted-cell">No price recorded</span>
        ),
    },
    {
      key: 'latency',
      header: 'Observed latency',
      align: 'end',
      // Measured from recorded runs rather than quoted from a datasheet.
      render: (model) =>
        model.latencyProfile ? (
          <>
            {formatLatency(model.latencyProfile.p50Ms)}
            <small className="cell-sub">
              p95 {formatLatency(model.latencyProfile.p95Ms)} over{' '}
              {formatNumber(model.latencyProfile.runs)} runs
            </small>
          </>
        ) : (
          <span className="muted-cell">No runs yet</span>
        ),
      priority: 'secondary',
    },
    {
      key: 'production',
      header: 'Production',
      render: (model) =>
        model.productionApproved ? (
          <StatusPill tone="good">Approved</StatusPill>
        ) : (
          <span className="muted-cell">Not approved</span>
        ),
    },
    {
      key: 'decide',
      header: 'Approval',
      render: (model) => (
        <details className="row-actions">
          <summary>Decide</summary>
          <div className="row-actions-body">
            {model.approvals.length > 0 ? (
              <ul className="approval-history">
                {model.approvals.map((approval) => (
                  <li key={`${approval.environment}-${approval.approvedBy}`}>
                    <StatusPill tone={approval.approved ? 'good' : 'neutral'}>
                      {humaniseState(approval.environment)}
                    </StatusPill>
                    <span>{approval.reason}</span>
                    <small>{approval.approvedBy}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-cell">No decision has been recorded for this model.</p>
            )}
            <ModelApprovalActions
              modelId={model.id}
              modelLabel={model.displayName ?? model.providerModelId}
              available={model.available}
            />
          </div>
        </details>
      ),
    },
  ];

  return (
    <>
      <Banner tone="info" title="Only verified metadata is shown">
        Where a provider has not told us a context window or a price, the field says so rather than
        being filled with a plausible number. An invented limit is worse than a missing one because
        it will be believed.
      </Banner>

      {unavailable.length > 0 ? (
        <Banner
          tone="warning"
          title={`${formatNumber(unavailable.length)} models are unavailable or deprecated`}
        >
          A route pointing at one of these will fail pre-activation validation.
        </Banner>
      ) : null}

      <Panel
        title="Model registry"
        eyebrow={`${formatNumber(models.length)} models · ${formatNumber(productionApproved.length)} production approved`}
        description="Availability is what the provider offers. Approval is a separate decision about whether it may do caller-affecting work."
      >
        <DataTable
          caption="Models with their availability, structured-output support, cost and observed latency"
          columns={columns}
          rows={models}
          getRowKey={(model) => model.id}
          empty={
            <EmptyState
              title="No models discovered"
              detail="Connect a provider and run model discovery to populate this registry."
            />
          }
        />
      </Panel>
    </>
  );
}

export type CapabilityRow = {
  id: string;
  key: string;
  displayName: string;
  purpose: string;
  boundedContext: string;
  owningProduct: string;
  inputContractKey: string;
  outputContractKey: string;
};

export function CapabilitiesView({
  capabilities,
  runsByCapability,
}: {
  capabilities: CapabilityRow[];
  runsByCapability: Record<string, number>;
}) {
  const columns: Column<CapabilityRow>[] = [
    {
      key: 'name',
      header: 'Capability',
      render: (capability) => (
        <>
          {capability.displayName}
          <small className="cell-sub">{capability.purpose}</small>
        </>
      ),
    },
    {
      key: 'contract',
      header: 'Contract',
      render: (capability) => (
        <>
          <code className="inline-code">{capability.inputContractKey}</code>
          <small className="cell-sub">→ {capability.outputContractKey}</small>
        </>
      ),
      priority: 'secondary',
    },
    {
      key: 'context',
      header: 'Owned by',
      render: (capability) => (
        <>
          {humaniseState(capability.boundedContext)}
          <small className="cell-sub">{humaniseState(capability.owningProduct)}</small>
        </>
      ),
      priority: 'secondary',
    },
    {
      key: 'runs',
      header: 'Runs recorded',
      align: 'end',
      render: (capability) => formatNumber(runsByCapability[capability.key] ?? 0),
    },
    {
      key: 'drill',
      header: 'Execution',
      render: (capability) => (
        <Link
          className="row-link"
          href={`/administration/ai?area=execution&capability=${capability.key}`}
        >
          View runs
        </Link>
      ),
    },
  ];

  return (
    <Panel
      title="Capabilities"
      eyebrow={`${formatNumber(capabilities.length)} registered`}
      description="Capabilities are the stable business abstraction. Applications ask for a capability; which provider and model answer it is a routing decision, not an application concern."
    >
      <DataTable
        caption="Capabilities with their contracts and recorded execution counts"
        columns={columns}
        rows={capabilities}
        getRowKey={(capability) => capability.id}
        empty={
          <EmptyState title="No capabilities" detail="Capabilities are seeded with the registry." />
        }
      />
    </Panel>
  );
}

export type RouteRow = {
  id: string;
  key: string;
  purpose: string;
  versions: Array<{
    id: string;
    version: number;
    state: string;
    environment: string;
    candidates: Array<{
      position: number;
      role: string;
      providerKey?: string;
      providerModelId?: string | null;
      available?: boolean;
    }>;
    timeoutMs: number;
    maximumRetries: number;
    maximumCostMicros: number | null;
    approvedBy: string | null;
    createdAt: string;
  }>;
};

type RouteVersion = RouteRow['versions'][number];

export function RoutesView({
  routes,
  connections,
  models,
}: {
  routes: RouteRow[];
  connections: Array<{ id: string; connectionLabel: string; providerKey: string }>;
  models: Array<{
    id: string;
    connectionId: string;
    providerModelId: string;
    available: boolean;
    deprecated: boolean;
  }>;
}) {
  const connectionOptions = connections.map((connection) => ({
    value: connection.id,
    label: `${connection.connectionLabel} (${connection.providerKey})`,
  }));
  const modelOptions = models.map((model) => ({
    value: model.id,
    // A deprecated or unavailable model stays selectable so the refusal comes from the
    // platform with its reason, rather than from a disabled control with none.
    label: model.deprecated
      ? `${model.providerModelId} — deprecated`
      : model.available
        ? model.providerModelId
        : `${model.providerModelId} — unavailable`,
  }));

  const columns: Column<RouteVersion>[] = [
    {
      key: 'version',
      header: 'Version',
      render: (version) => (
        <>
          v{version.version}
          <small className="cell-sub">{humaniseState(version.environment)}</small>
        </>
      ),
    },
    {
      key: 'state',
      header: 'State',
      render: (version) => (
        <StatusPill tone={toneForState(version.state)}>{humaniseState(version.state)}</StatusPill>
      ),
    },
    {
      key: 'candidates',
      header: 'Candidates in order',
      // The order is the behaviour: primary is tried first, then each fallback.
      render: (version) => (
        <ol className="candidate-list">
          {version.candidates.map((candidate) => (
            <li key={candidate.position}>
              <span className="candidate-role">{candidate.role.toLowerCase()}</span>
              {candidate.providerModelId ?? 'unknown model'}
              <small>{candidate.providerKey}</small>
              {candidate.available === false ? (
                <StatusPill tone="danger">Unavailable</StatusPill>
              ) : null}
            </li>
          ))}
        </ol>
      ),
    },
    {
      key: 'limits',
      header: 'Limits',
      render: (version) => (
        <>
          {formatLatency(version.timeoutMs)} timeout
          <small className="cell-sub">
            {formatNumber(version.maximumRetries)} retries ·{' '}
            {version.maximumCostMicros === null
              ? 'no per-run ceiling'
              : `${formatCurrencyFromMicros(version.maximumCostMicros)} per run`}
          </small>
        </>
      ),
      priority: 'secondary',
    },
    {
      key: 'approved',
      header: 'Activated by',
      render: (version) => (
        <>
          {version.approvedBy ?? <span className="muted-cell">Not activated</span>}
          <small className="cell-sub">{formatDateTime(version.createdAt)}</small>
        </>
      ),
      priority: 'secondary',
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (version) => (
        <details className="row-actions">
          <summary>Manage</summary>
          <div className="row-actions-body">
            <RouteVersionActions
              versionId={version.id}
              state={version.state}
              environment={version.environment}
            />
          </div>
        </details>
      ),
    },
  ];

  return (
    <>
      <Banner tone="info" title="Activation revalidates everything">
        A route that passed validation when it was drafted cannot activate if a model has since been
        deprecated or an approval has been withdrawn. The check runs again at the moment of
        activation, server-side.
      </Banner>

      {routes.map((route) => (
        <Panel
          key={route.id}
          title={humaniseState(route.key)}
          eyebrow={`${formatNumber(route.versions.length)} versions`}
          description={route.purpose}
        >
          <DataTable
            caption={`Route versions for ${route.key} with their ordered candidates, limits and state`}
            columns={columns}
            rows={route.versions}
            getRowKey={(version) => version.id}
            empty={
              <EmptyState
                title="No versions"
                detail="This capability has no route yet, so it cannot execute."
              />
            }
          />
          <details className="row-actions">
            <summary>Create a new version</summary>
            <div className="row-actions-body">
              <RouteBuilder
                routeId={route.id}
                routeLabel={humaniseState(route.key)}
                connections={connectionOptions}
                models={modelOptions}
              />
            </div>
          </details>
        </Panel>
      ))}

      {routes.length === 0 ? (
        <Panel title="Routes">
          <EmptyState title="No routes" detail="Routes are seeded with the registry." />
        </Panel>
      ) : null}
    </>
  );
}
