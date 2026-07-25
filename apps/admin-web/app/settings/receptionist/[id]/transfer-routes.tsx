import {
  Banner,
  DataTable,
  EmptyState,
  Panel,
  StatusPill,
  formatDuration,
  formatNumber,
  humaniseState,
  type Column,
  type Tone,
} from '@quantum-parks/ui';

/**
 * Transfer routing.
 *
 * Routes are evaluated in priority order — the first match wins — so the order is the
 * behaviour, not decoration. They live inside the agent configuration, which means a
 * routing change travels the same review, test and publication path as a prompt change
 * rather than taking effect the moment someone saves it.
 */

export type TransferRoute = {
  routeKey: string;
  park: string | null;
  language: string | null;
  intent: string;
  target: string;
  fallback: 'callback' | 'voicemail' | 'none';
  callbackPolicy: 'ALWAYS' | 'IF_UNANSWERED' | 'NEVER';
  slaSeconds: number;
  operatingHours: { opensAt: string; closesAt: string; days: string[] };
  sensitive: boolean;
  environments: string[];
  enabled: boolean;
  priority: number;
};

function fallbackTone(fallback: string): Tone {
  if (fallback === 'none') return 'danger';
  if (fallback === 'voicemail') return 'warning';
  return 'good';
}

export function TransferRoutes({
  routes,
  editable,
}: {
  routes: TransferRoute[];
  editable: boolean;
}) {
  // A version written before the current route contract may lack fields. Those routes
  // are reported as incomplete rather than crashing the page or being hidden — an
  // operator needs to know a live route cannot be fully described.
  const complete = routes.filter((route) => route?.operatingHours?.opensAt);
  const incomplete = routes.filter((route) => !route?.operatingHours?.opensAt);

  // Presented in the order the runtime evaluates them, not alphabetically: reading
  // them in any other order would misrepresent which route actually wins.
  const ordered = [...complete].sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0));
  const withoutFallback = ordered.filter((route) => route.enabled && route.fallback === 'none');
  const sensitiveRoutes = ordered.filter((route) => route.sensitive);

  const columns: Column<TransferRoute>[] = [
    {
      key: 'priority',
      header: 'Order',
      render: (route) => (
        <>
          {formatNumber(route.priority + 1)}
          <small className="cell-sub">{route.routeKey}</small>
        </>
      ),
    },
    {
      key: 'match',
      header: 'Matches',
      render: (route) => (
        <>
          {humaniseState(route.intent)}
          <small className="cell-sub">
            {route.park ? `${route.park}` : 'any park'} ·{' '}
            {route.language ? route.language.toUpperCase() : 'any language'}
          </small>
        </>
      ),
    },
    {
      key: 'target',
      header: 'Goes to',
      render: (route) => (
        <>
          {humaniseState(route.target)}
          <small className="cell-sub">
            {route.operatingHours.opensAt}–{route.operatingHours.closesAt} ·{' '}
            {route.operatingHours.days.join(', ')}
          </small>
        </>
      ),
    },
    {
      key: 'fallback',
      header: 'If unanswered',
      render: (route) => (
        <>
          <StatusPill tone={fallbackTone(route.fallback)}>
            {humaniseState(route.fallback)}
          </StatusPill>
          <small className="cell-sub">Callback {humaniseState(route.callbackPolicy)}</small>
        </>
      ),
    },
    {
      key: 'sla',
      header: 'SLA',
      align: 'end',
      render: (route) => formatDuration(route.slaSeconds),
    },
    {
      key: 'sensitive',
      header: 'Handling',
      render: (route) =>
        route.sensitive ? (
          <StatusPill tone="warning" title="No commercial offers on this route">
            Sensitive
          </StatusPill>
        ) : (
          <span className="muted-cell">Standard</span>
        ),
      priority: 'secondary',
    },
    {
      key: 'enabled',
      header: 'State',
      render: (route) =>
        route.enabled ? (
          <StatusPill tone="good">Enabled</StatusPill>
        ) : (
          <StatusPill tone="neutral">Disabled</StatusPill>
        ),
    },
  ];

  return (
    <>
      {withoutFallback.length > 0 ? (
        <Banner
          tone="danger"
          title={`${formatNumber(withoutFallback.length)} enabled routes have no fallback`}
        >
          If nobody answers, the caller is left with nothing. Every enabled route should end in a
          callback or voicemail.
        </Banner>
      ) : null}

      {sensitiveRoutes.length > 0 ? (
        <Banner
          tone="info"
          title={`${formatNumber(sensitiveRoutes.length)} routes are marked sensitive`}
        >
          The receptionist makes no commercial offer on these, and the transfer context is delivered
          to the operator rather than read aloud.
        </Banner>
      ) : null}

      {incomplete.length > 0 ? (
        <Banner
          tone="warning"
          title={`${formatNumber(incomplete.length)} routes predate the current routing contract`}
        >
          These were written before operating hours, SLA and fallback policy were required, so they
          cannot be fully described here. Editing this version in a draft brings them up to the
          current contract.
        </Banner>
      ) : null}

      <Panel
        title={`${formatNumber(ordered.length)} transfer routes`}
        eyebrow="Evaluated top to bottom, first match wins"
        description={
          editable
            ? 'Routes are part of the agent configuration, so a change here is reviewed, tested and published like any other change.'
            : 'This version is not editable. Start a draft to change routing.'
        }
      >
        <DataTable
          caption="Transfer routes in evaluation order with what they match, where they go and what happens if nobody answers"
          columns={columns}
          rows={ordered}
          getRowKey={(route) => route.routeKey}
          empty={
            <EmptyState
              title="No transfer routes configured"
              detail="Without a route, a caller who needs a person can only be offered a callback."
            />
          }
        />
      </Panel>
    </>
  );
}
