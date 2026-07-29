/**
 * The control plane's information architecture, declared once.
 *
 * Structure: five primary domains in the sidebar (Mission Control, Calls,
 * Intelligence, Reports, Settings), reflecting how often an operator actually visits
 * each one — monitor, review calls, act on insight, consume reports, occasionally
 * configure. Settings is a third tier: it does not get its own row of sub-navigation
 * tabs like the other four domains. Instead `/settings` is a grouped landing page,
 * and each group (Receptionist, Simulation Lab, Knowledge Hub, AI Providers,
 * AI Routing, Integrations, Administration) has its own vertical section list
 * (`SettingsSectionShell`) rather than a horizontal tab bar, so the primary nav
 * never grows a second or third stacked row.
 *
 * There is no second competing navigation system: everything derives from this file
 * and from the current pathname.
 */

export type SubArea = {
  href: string;
  label: string;
  /** Shown in the page description when this sub-area is current. */
  description: string;
};

export type Domain = {
  key: string;
  href: string;
  label: string;
  /** Icon name resolved against lucide-react in the shell. */
  icon: string;
  description: string;
  areas: readonly SubArea[];
};

export const DOMAINS = [
  {
    key: 'mission-control',
    href: '/',
    label: 'Mission Control',
    icon: 'Gauge',
    description: 'What is happening right now and what needs attention.',
    areas: [
      {
        href: '/',
        label: 'Overview',
        description: 'Live state, today’s activity and the attention queue.',
      },
      {
        href: '/readiness',
        label: 'Readiness',
        description: 'Whether this platform can carry production traffic, and what is stopping it.',
      },
    ],
  },
  {
    key: 'calls',
    href: '/calls',
    label: 'Calls',
    icon: 'Activity',
    description: 'Every call, and the work a call creates: transfers, callbacks, tasks, messages.',
    areas: [
      {
        href: '/calls',
        label: 'All calls',
        description: 'Every call the platform holds a record of.',
      },
      {
        href: '/calls/live',
        label: 'Live activity',
        description: 'Calls whose enrichment is still in progress.',
      },
      {
        href: '/calls/failed',
        label: 'Failed ingestion',
        description: 'Calls that failed to ingest and need replay or import.',
      },
      {
        href: '/calls/corrections',
        label: 'Corrections',
        description: 'Proposed and applied corrections, with their full history.',
      },
      {
        href: '/calls/reconciliation',
        label: 'Reconciliation',
        description: 'Missing calls, duplicate events and provider import.',
      },
      {
        href: '/calls/handoffs',
        label: 'Handoffs',
        description: 'Live transfers, whether they were answered, and their fallback.',
      },
      {
        href: '/calls/callbacks',
        label: 'Callbacks',
        description: 'Customers owed a call back, by owner and due time.',
      },
      {
        href: '/calls/tasks',
        label: 'Staff tasks',
        description: 'Work raised for a team to complete.',
      },
      {
        href: '/calls/messages',
        label: 'Messages',
        description: 'Outbound messages, delivery receipts and failures.',
      },
      {
        href: '/calls/sla',
        label: 'SLA and failures',
        description: 'Overdue, failed and blocked work first.',
      },
    ],
  },
  {
    key: 'chat',
    href: '/chat',
    label: 'Chat',
    icon: 'MessageSquare',
    description:
      'Website and app chat conversations, with the same captured intelligence as phone calls.',
    areas: [
      {
        href: '/chat',
        label: 'Captured chats',
        description:
          'ElevenLabs text-chat sessions, their transcripts, summaries, sentiment, classification and operator test console.',
      },
    ],
  },
  {
    key: 'alerts',
    href: '/alerts',
    label: 'Alerts',
    icon: 'BellRing',
    description: 'Urgent work, human approvals and governed escalation.',
    areas: [
      {
        href: '/alerts',
        label: 'Alerts',
        description: 'Urgent work, human approvals and governed escalation.',
      },
    ],
  },
  {
    key: 'intelligence',
    href: '/intelligence',
    label: 'Intelligence',
    icon: 'ChartNoAxesCombined',
    description: 'The evidence and insight produced from calls.',
    areas: [
      {
        href: '/intelligence',
        label: 'Overview',
        description: 'Demand, intent mix, outcomes and containment over time.',
      },
      {
        href: '/intelligence/trends',
        label: 'Trends',
        description: 'Movements detected across periods, with their evidence.',
      },
      {
        href: '/intelligence/call-reasons',
        label: 'Call reasons',
        description: 'Why people call, ranked, with drill-through to the calls behind each reason.',
      },
      {
        href: '/intelligence/knowledge-gaps',
        label: 'Knowledge gaps',
        description: 'Unanswered questions ranked by how often they are asked.',
      },
      {
        href: '/intelligence/customer-continuity',
        label: 'Customer continuity',
        description: 'Repeat contact: whether the same question is coming back.',
      },
      {
        href: '/intelligence/agent-performance',
        label: 'Agent performance',
        description: 'Containment, transfer, callback and failure rate by receptionist version.',
      },
      {
        href: '/intelligence/provider-performance',
        label: 'Provider performance',
        description: 'Execution health of the AI providers and models enriching calls.',
      },
      {
        href: '/intelligence/costs',
        label: 'Costs',
        description: 'Token usage and spend, by provider, model and capability.',
      },
    ],
  },
  {
    key: 'reports',
    href: '/reports',
    label: 'Reports',
    icon: 'FileText',
    description: 'Scheduled reports, their run history and data lineage.',
    areas: [
      {
        href: '/reports',
        label: 'Scheduled reports',
        description: 'Report definitions, their schedule and classification.',
      },
      {
        href: '/reports/history',
        label: 'Run history',
        description: 'Every run, the period it covered, and its data lineage.',
      },
    ],
  },
  {
    key: 'settings',
    href: '/settings',
    label: 'Settings',
    icon: 'Settings',
    description: 'Everything used to configure and govern the receptionist.',
    // Settings does not render these as a horizontal tab bar (see module comment) —
    // it renders them as the grouped landing page at /settings.
    areas: [
      {
        href: '/settings',
        label: 'Overview',
        description: 'Every configuration area, grouped.',
      },
    ],
  },
] as const satisfies readonly Domain[];

/** One group on the Settings landing page, each with its own vertical section list. */
export type SettingsGroup = {
  key: string;
  href: string;
  label: string;
  description: string;
  areas: readonly SubArea[];
};

export const SETTINGS_GROUPS = [
  {
    key: 'receptionist',
    href: '/settings/receptionist',
    label: 'Receptionist',
    description: 'The agent that answers the telephone: configuration, voices, versions, releases.',
    areas: [
      {
        href: '/settings/receptionist',
        label: 'Agents',
        description: 'Every receptionist agent with its live version, tests and drift state.',
      },
      {
        href: '/settings/receptionist/voices',
        label: 'Languages and voices',
        description: 'Provider voices, approvals and per-language assignments.',
      },
      {
        href: '/settings/receptionist/versions',
        label: 'Versions',
        description: 'Every configuration version and how it differs from the one before.',
      },
      {
        href: '/settings/receptionist/releases',
        label: 'Releases',
        description: 'Approval, testing, publication, provider read-back and rollback.',
      },
    ],
  },
  {
    key: 'simulation',
    href: '/settings/simulation',
    label: 'Simulation Lab',
    description:
      'Test the receptionist live, against the real published agent and evaluation pipeline.',
    areas: [
      {
        href: '/settings/simulation',
        label: 'Live test',
        description:
          'Start a session, send preset scenarios or a typed message, and inspect the transcript and Quantum Result.',
      },
      {
        href: '/settings/simulation/sessions',
        label: 'Sessions',
        description:
          'Every persisted receptionist test session, with its transcript and evaluation.',
      },
    ],
  },
  {
    key: 'knowledge',
    href: '/settings/knowledge',
    label: 'Knowledge Hub',
    description: 'The approved company answers the receptionist is allowed to give.',
    areas: [
      {
        href: '/settings/knowledge',
        label: 'Ingest & overview',
        description:
          'Bring in documents, URLs and business facts, then review what the ingestion layer understood.',
      },
      {
        href: '/settings/knowledge/encyclopedia',
        label: 'Company encyclopedia',
        description:
          'A structured operator-readable view of what the AI believes the company is, does and sounds like.',
      },
      {
        href: '/settings/knowledge/library',
        label: 'Library',
        description: 'All knowledge assets with owner, risk, effective dates and sync state.',
      },
      {
        href: '/settings/knowledge/review',
        label: 'Review queue',
        description: 'Changes waiting for an independent approver.',
      },
      {
        href: '/settings/knowledge/releases',
        label: 'Releases',
        description: 'Publication to the voice runtime, and divergence from it.',
      },
      {
        href: '/settings/knowledge/gaps',
        label: 'Knowledge gaps',
        description: 'Questions callers asked that approved knowledge could not answer.',
      },
    ],
  },
  {
    key: 'ai-providers',
    href: '/settings/ai-providers',
    label: 'AI Providers',
    description: 'Connections, credentials and health for every provider in use.',
    areas: [
      {
        href: '/settings/ai-providers/elevenlabs',
        label: 'ElevenLabs setup',
        description: 'The voice runtime connection: capabilities, health and drift.',
      },
      {
        href: '/settings/ai-providers/models',
        label: 'Intelligence Models',
        description: 'The AI models Quantum Parks may use for intelligence tasks.',
      },
      {
        href: '/settings/ai-providers/routing',
        label: 'Model Routing',
        description: 'Which configured model handles each intelligence task.',
      },
      {
        href: '/settings/ai-providers/health',
        label: 'Provider health',
        description: 'Connection health checks and degraded periods.',
      },
    ],
  },
  {
    key: 'ai-routing',
    href: '/settings/ai-routing',
    label: 'AI Routing',
    description: 'What performs each business capability, and what it is allowed to cost.',
    areas: [
      {
        href: '/settings/ai-routing',
        label: 'Overview',
        description: 'Capabilities, prompts, schemas and taxonomies at a glance.',
      },
      {
        href: '/settings/ai-routing/capabilities',
        label: 'Capabilities',
        description: 'Business capabilities and the service contract each version implements.',
      },
      {
        href: '/settings/ai-routing/routes',
        label: 'Routes',
        description: 'Provider and model routing per capability, with ordered fallbacks.',
      },
      {
        href: '/settings/ai-routing/prompts',
        label: 'Prompts',
        description: 'Prompt versions, approval and rollback.',
      },
      {
        href: '/settings/ai-routing/schemas',
        label: 'Schemas and taxonomies',
        description: 'Output schema and taxonomy versions a capability may depend on.',
      },
      {
        href: '/settings/ai-routing/budgets',
        label: 'Budgets',
        description: 'Spend limits in GBP, by provider, model or capability.',
      },
      {
        href: '/settings/ai-routing/executions',
        label: 'Execution history',
        description: 'Every run, its provenance, and the record it enriched.',
      },
      {
        href: '/settings/ai-routing/monitoring',
        label: 'Monitoring',
        description: 'Success, fallback and failure rates, drilling through to runs.',
      },
    ],
  },
  {
    key: 'communications',
    href: '/settings/communications',
    label: 'Email & WhatsApp',
    description:
      'Central channel identity, authentication and policy for alerts and future digital receptionists.',
    areas: [
      {
        href: '/settings/communications',
        label: 'Overview',
        description: 'Channel readiness, shared policy and dependent features.',
      },
      {
        href: '/settings/communications/email',
        label: 'Email',
        description: 'Gmail identity, OAuth, inbound sync and reply controls.',
      },
      {
        href: '/settings/communications/whatsapp',
        label: 'WhatsApp',
        description: 'Meta business account, phone identity, templates and webhooks.',
      },
    ],
  },
  {
    key: 'integrations',
    href: '/settings/integrations',
    label: 'Integrations',
    description: 'Support, customer, booking, messaging and storage systems.',
    areas: [
      {
        href: '/settings/integrations',
        label: 'Business integrations',
        description: 'Support, customer, booking, messaging and storage systems.',
      },
    ],
  },
  {
    key: 'administration',
    href: '/settings/administration',
    label: 'Administration',
    description: 'Organisation defaults, access, privacy, audit and release control.',
    areas: [
      {
        href: '/settings/administration',
        label: 'Overview',
        description: 'Administration at a glance, with readiness by domain.',
      },
      {
        href: '/settings/administration/general',
        label: 'General',
        description: 'Organisation, parks, languages, hours and contact defaults.',
      },
      {
        href: '/settings/administration/users',
        label: 'Users and roles',
        description: 'Who has access, with what authority, and separation of duties.',
      },
      {
        href: '/settings/administration/security',
        label: 'Security and privacy',
        description: 'Credentials, masking, residency, retention posture and consent.',
      },
      {
        href: '/settings/administration/audit',
        label: 'Audit',
        description: 'The hash-chained record of who changed what, and why.',
      },
      {
        href: '/settings/administration/retention',
        label: 'Retention and legal holds',
        description: 'Retention policies, deletion jobs and legal holds.',
      },
      {
        href: '/settings/administration/feature-flags',
        label: 'Feature flags',
        description: 'Capabilities held behind an explicit approval gate.',
      },
      {
        href: '/settings/administration/readiness',
        label: 'Production readiness',
        description: 'Readiness by domain, with the blockers for each.',
      },
      {
        href: '/settings/administration/release',
        label: 'Release administration',
        description: 'Release authority, evidence and rollback control.',
      },
    ],
  },
  {
    key: 'advanced',
    href: '/settings/advanced',
    label: 'Advanced',
    description:
      'Engineering and QA tooling for the receptionist: scenario authoring, release gates and provider test runs. For live testing, operators should use the primary live-test workflow instead; this group is for building and gating releases.',
    areas: [
      {
        href: '/settings/advanced/scenarios',
        label: 'Scenarios',
        description: 'What each scenario asserts, at what risk level, in which language.',
      },
      {
        href: '/settings/advanced/collections',
        label: 'Test collections',
        description: 'Grouped scenarios, including the collections mandatory for release.',
      },
      {
        href: '/settings/advanced/provider-test-runs',
        label: 'Provider test runs',
        description: 'Run a collection now, and see provider output beside internal evaluation.',
      },
      {
        href: '/settings/advanced/release-checks',
        label: 'Release checks',
        description: 'Each gate evaluated independently by the server.',
      },
      {
        href: '/settings/advanced/reviews',
        label: 'Reviews',
        description: 'Human quality scoring against the review rubric.',
      },
    ],
  },
] as const satisfies readonly SettingsGroup[];

/** Path prefixes each domain owns. Mission Control owns the root and its siblings. */
const DOMAIN_PREFIXES: Record<string, readonly string[]> = {
  'mission-control': ['/readiness'],
  calls: ['/calls'],
  chat: ['/chat'],
  alerts: ['/alerts'],
  intelligence: ['/intelligence'],
  reports: ['/reports'],
  settings: ['/settings'],
};

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Resolves the active domain. Longest matching prefix wins, so a nested path such as
 * `/settings/ai-routing/routes` resolves to Settings rather than falling back.
 */
export function domainForPath(pathname: string): Domain {
  let best: Domain | undefined;
  let bestLength = -1;
  for (const domain of DOMAINS) {
    for (const prefix of DOMAIN_PREFIXES[domain.key] ?? []) {
      if (matches(pathname, prefix) && prefix.length > bestLength) {
        best = domain;
        bestLength = prefix.length;
      }
    }
  }
  // The root path belongs to Mission Control, which is also the fallback for
  // anything unrecognised so the shell always renders a coherent sidebar.
  return best ?? DOMAINS[0];
}

/** The sub-area whose href is the longest prefix of the pathname. */
export function areaForPath(domain: Domain, pathname: string): SubArea | undefined {
  let best: SubArea | undefined;
  let bestLength = -1;
  for (const area of domain.areas) {
    if (matches(pathname, area.href) && area.href.length > bestLength) {
      best = area;
      bestLength = area.href.length;
    }
  }
  return best;
}

/** Resolves the active Settings group. Longest matching prefix wins. */
export function settingsGroupForPath(pathname: string): SettingsGroup | undefined {
  let best: SettingsGroup | undefined;
  let bestLength = -1;
  for (const group of SETTINGS_GROUPS) {
    if (matches(pathname, group.href) && group.href.length > bestLength) {
      best = group;
      bestLength = group.href.length;
    }
  }
  return best;
}

/** The section within a Settings group whose href is the longest prefix of the pathname. */
export function settingsAreaForPath(group: SettingsGroup, pathname: string): SubArea | undefined {
  let best: SubArea | undefined;
  let bestLength = -1;
  for (const area of group.areas) {
    if (matches(pathname, area.href) && area.href.length > bestLength) {
      best = area;
      bestLength = area.href.length;
    }
  }
  return best;
}
