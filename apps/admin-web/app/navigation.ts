/**
 * The control plane's information architecture, declared once.
 *
 * Three independent navigation arrays previously existed, and active state was matched
 * by comparing a label string that every page had to pass down by hand. Everything now
 * derives from this file and from the current pathname.
 *
 * Structure: eight primary domains in the sidebar, each with its own sub-navigation
 * rendered inside the domain. There is no second competing navigation system.
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
      { href: '/', label: 'Overview', description: 'Live state, today’s activity and the attention queue.' },
      {
        href: '/alerts',
        label: 'Alerts',
        description: 'Everything currently blocked, failing, drifted or overdue.',
      },
      {
        href: '/readiness',
        label: 'Readiness',
        description: 'Whether this platform can carry production traffic, and what is stopping it.',
      },
    ],
  },
  {
    key: 'receptionist',
    href: '/receptionist/agents',
    label: 'Receptionist',
    icon: 'Bot',
    description: 'The agent that answers the telephone: configuration, voices, versions and releases.',
    areas: [
      {
        href: '/receptionist/agents',
        label: 'Agents',
        description: 'Every receptionist agent with its live version, tests and drift state.',
      },
      {
        href: '/receptionist/voices',
        label: 'Voice library',
        description: 'Provider voices, approvals and per-language assignments.',
      },
      {
        href: '/receptionist/versions',
        label: 'Versions',
        description: 'Every configuration version and how it differs from the one before.',
      },
      {
        href: '/receptionist/releases',
        label: 'Releases',
        description: 'Approval, testing, publication, provider read-back and rollback.',
      },
    ],
  },
  {
    key: 'knowledge',
    href: '/knowledge/library',
    label: 'Knowledge',
    icon: 'Library',
    description: 'The approved company answers the receptionist is allowed to give.',
    areas: [
      {
        href: '/knowledge/library',
        label: 'Library',
        description: 'All knowledge assets with owner, risk, effective dates and sync state.',
      },
      {
        href: '/knowledge/review',
        label: 'Review queue',
        description: 'Changes waiting for an independent approver.',
      },
      {
        href: '/knowledge/releases',
        label: 'Releases',
        description: 'Publication to the voice runtime, and divergence from it.',
      },
      {
        href: '/knowledge/gaps',
        label: 'Knowledge gaps',
        description: 'Questions callers asked that approved knowledge could not answer.',
      },
    ],
  },
  {
    key: 'quality',
    href: '/quality/test-cases',
    label: 'Quality',
    icon: 'ClipboardCheck',
    description: 'Test definition, evidence and the gates a release must clear.',
    areas: [
      {
        href: '/quality/test-cases',
        label: 'Test cases',
        description: 'What each test asserts, at what risk level, in which language.',
      },
      {
        href: '/quality/suites',
        label: 'Test suites',
        description: 'Grouped tests, including the suites mandatory for release.',
      },
      {
        href: '/quality/runs',
        label: 'Test runs',
        description: 'Provider output beside internal evaluation, with failure evidence.',
      },
      {
        href: '/quality/gates',
        label: 'Release gates',
        description: 'Each gate evaluated independently by the server.',
      },
      {
        href: '/quality/reviews',
        label: 'QA reviews',
        description: 'Human quality scoring against the review rubric.',
      },
    ],
  },
  {
    key: 'calls',
    href: '/calls',
    label: 'Calls',
    icon: 'Activity',
    description: 'Canonical call history, investigation and reconciliation.',
    areas: [
      { href: '/calls', label: 'All calls', description: 'Every call the platform holds a record of.' },
      {
        href: '/calls/partial',
        label: 'Partial processing',
        description: 'Calls whose enrichment did not complete.',
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
    ],
  },
  {
    key: 'operations',
    href: '/operations/handoffs',
    label: 'Operations',
    icon: 'Workflow',
    description: 'The work a call creates: transfers, callbacks, tasks and messages.',
    areas: [
      {
        href: '/operations/handoffs',
        label: 'Handoffs',
        description: 'Live transfers, whether they were answered, and their fallback.',
      },
      {
        href: '/operations/callbacks',
        label: 'Callbacks',
        description: 'Customers owed a call back, by owner and due time.',
      },
      {
        href: '/operations/tasks',
        label: 'Staff tasks',
        description: 'Work raised for a team to complete.',
      },
      {
        href: '/operations/messages',
        label: 'Messages',
        description: 'Outbound messages, delivery receipts and failures.',
      },
      {
        href: '/operations/sla',
        label: 'SLA and failures',
        description: 'Overdue, failed and blocked work first.',
      },
    ],
  },
  {
    key: 'intelligence',
    href: '/intelligence/analytics',
    label: 'Intelligence',
    icon: 'ChartNoAxesCombined',
    description: 'What the calls say in aggregate, and the reports built from them.',
    areas: [
      {
        href: '/intelligence/analytics',
        label: 'Analytics',
        description: 'Demand, intent mix, outcomes and containment over time.',
      },
      {
        href: '/intelligence/trends',
        label: 'Trends',
        description: 'Movements detected across periods, with their evidence.',
      },
      {
        href: '/intelligence/gaps',
        label: 'Knowledge gaps',
        description: 'Unanswered questions ranked by how often they are asked.',
      },
      {
        href: '/intelligence/reports',
        label: 'Reports',
        description: 'Report definitions, schedules, runs and delivery.',
      },
    ],
  },
  {
    key: 'administration',
    href: '/administration',
    label: 'Administration',
    icon: 'Settings',
    description: 'Platform configuration, integrations, access, privacy and release control.',
    areas: [
      { href: '/administration', label: 'Overview', description: 'Administration at a glance.' },
      {
        href: '/administration/general',
        label: 'General',
        description: 'Organisation, parks, languages, hours and contact defaults.',
      },
      {
        href: '/administration/voice-runtime',
        label: 'Voice runtime',
        description: 'The ElevenLabs connection, capabilities, health and drift.',
      },
      {
        href: '/administration/ai',
        label: 'AI infrastructure',
        description: 'Providers, models, capabilities, routes, prompts, budgets and runs.',
      },
      {
        href: '/administration/integrations',
        label: 'Business integrations',
        description: 'Support, customer, booking, messaging and storage systems.',
      },
      {
        href: '/administration/users',
        label: 'Users and roles',
        description: 'Who has access, with what authority, and separation of duties.',
      },
      {
        href: '/administration/security',
        label: 'Security and privacy',
        description: 'Credentials, masking, residency, retention posture and consent.',
      },
      {
        href: '/administration/audit',
        label: 'Audit',
        description: 'The hash-chained record of who changed what, and why.',
      },
      {
        href: '/administration/retention',
        label: 'Retention',
        description: 'Retention policies, deletion jobs and legal holds.',
      },
      {
        href: '/administration/feature-flags',
        label: 'Feature flags',
        description: 'Capabilities held behind an explicit approval gate.',
      },
      {
        href: '/administration/readiness',
        label: 'Production readiness',
        description: 'Readiness by domain, with the blockers for each.',
      },
      {
        href: '/administration/release',
        label: 'Release administration',
        description: 'Release authority, evidence and rollback control.',
      },
    ],
  },
] as const satisfies readonly Domain[];

/** Path prefixes each domain owns. Mission Control owns the root and its siblings. */
const DOMAIN_PREFIXES: Record<string, readonly string[]> = {
  'mission-control': ['/alerts', '/readiness'],
  receptionist: ['/receptionist'],
  knowledge: ['/knowledge'],
  quality: ['/quality'],
  calls: ['/calls'],
  operations: ['/operations'],
  intelligence: ['/intelligence'],
  administration: ['/administration'],
};

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Resolves the active domain. Longest matching prefix wins, so a nested path such as
 * `/administration/ai/routes` resolves to Administration rather than falling back.
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
