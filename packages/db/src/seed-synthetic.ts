/**
 * Synthetic business dataset for local development, acceptance testing and browser
 * verification.
 *
 * The control plane cannot be built or verified against empty tables: list views,
 * filters, sorting, pagination, charts and drill-downs all need populated,
 * internally consistent records. This module generates that dataset.
 *
 * Two rules govern everything here:
 *
 *  1. Every row that has a `synthetic` column is marked `true`, and the whole module
 *     refuses to run in production. Synthetic evidence must never be mistaken for
 *     production evidence (risks R-06 and R-15).
 *  2. Generation is deterministic. A seeded pseudo-random source means the same
 *     dataset appears on every machine and every CI run, so browser assertions can
 *     rely on specific records existing.
 */

import { createHash } from 'node:crypto';
import { desc } from 'drizzle-orm';
import {
  agentApprovals,
  agentConfigVersions,
  agentDeployments,
  agentDriftFindings,
  agentTests,
  agentTestVersions,
  aggregateFacts,
  adminUsers,
  auditEvents,
  callClassifications,
  callEntities,
  callOutcomes,
  callSummaries,
  callbackRequests,
  conversations,
  corrections,
  correctionHistory,
  customerLinks,
  featureFlags,
  handoffs,
  knowledgeApprovals,
  knowledgeAssets,
  knowledgeAssignments,
  knowledgeConflicts,
  knowledgeGaps,
  knowledgeSyncs,
  knowledgeVersions,
  messageDeliveries,
  permissions,
  providerConversations,
  providerTestMappings,
  qualityEvaluations,
  releaseGateEvaluations,
  reportDefinitions,
  reportRuns,
  retentionPolicies,
  rolePermissions,
  roles,
  staffTasks,
  testEvidence,
  testRuns,
  toolInvocations,
  transcriptRevisions,
  transcriptTurns,
  trends,
  userRoles,
  voiceAssignments,
  voicePreviews,
  voiceProfiles,
  voiceConsentRecords,
} from './schema.js';
import type { Database } from './index.js';

/* ------------------------------------------------------------ determinism */

/** Small, fast, seeded PRNG. Deterministic across platforms and Node versions. */
function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = createRandom(0x51_75_41_4e); // "QUAN"

function pick<T>(values: readonly T[]): T {
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined) throw new Error('pick() called with an empty list');
  return value;
}

function pickWeighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let threshold = random() * total;
  for (const [value, weight] of entries) {
    threshold -= weight;
    if (threshold <= 0) return value;
  }
  const last = entries[entries.length - 1];
  if (!last) throw new Error('pickWeighted() called with an empty list');
  return last[0];
}

function between(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

/** Stable UUID derived from a name, so reruns and cross-references agree. */
function stableUuid(name: string): string {
  const hex = createHash('sha256').update(name).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

const sha256 = (value: unknown) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');

const DAY_MS = 86_400_000;
const now = new Date();
const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const daysAgo = (days: number, hour = 10, minute = 0) =>
  new Date(startOfToday.getTime() - days * DAY_MS + hour * 3_600_000 + minute * 60_000);

/* ------------------------------------------------------------- vocabulary */

const PARKS = ['lisboa', 'porto', 'sintra'] as const;
const LANGUAGES = ['en', 'pt', 'es', 'fr'] as const;

const INTENTS = [
  'opening_hours',
  'ticket_pricing',
  'booking_enquiry',
  'group_booking',
  'accessibility_support',
  'lost_property',
  'complaint',
  'refund_request',
  'directions_and_parking',
  'event_schedule',
  'membership_enquiry',
  'technical_issue',
] as const;

const INTENT_WEIGHTS = [
  ['opening_hours', 22],
  ['ticket_pricing', 18],
  ['booking_enquiry', 16],
  ['directions_and_parking', 11],
  ['group_booking', 8],
  ['event_schedule', 7],
  ['accessibility_support', 5],
  ['lost_property', 4],
  ['refund_request', 3],
  ['complaint', 3],
  ['membership_enquiry', 2],
  ['technical_issue', 1],
] as const satisfies ReadonlyArray<readonly [(typeof INTENTS)[number], number]>;

const PEOPLE = [
  { key: 'ana.ferreira', name: 'Ana Ferreira', email: 'ana.ferreira@example.invalid' },
  { key: 'bruno.castro', name: 'Bruno Castro', email: 'bruno.castro@example.invalid' },
  { key: 'carla.dias', name: 'Carla Dias', email: 'carla.dias@example.invalid' },
  { key: 'diogo.melo', name: 'Diogo Melo', email: 'diogo.melo@example.invalid' },
  { key: 'elena.rocha', name: 'Elena Rocha', email: 'elena.rocha@example.invalid' },
  { key: 'filipe.sousa', name: 'Filipe Sousa', email: 'filipe.sousa@example.invalid' },
] as const;

const personId = (key: string) => stableUuid(`person:${key}`);

const ROLE_CATALOGUE = [
  ['PLATFORM_OWNER', 'Platform owner', 'Full control-plane authority including publication'],
  ['AGENT_ADMIN', 'Agent administrator', 'Authors and maintains agent configuration'],
  ['KNOWLEDGE_EDITOR', 'Knowledge editor', 'Drafts and maintains knowledge assets'],
  ['KNOWLEDGE_APPROVER', 'Knowledge approver', 'Independently approves knowledge changes'],
  ['QA_REVIEWER', 'Quality reviewer', 'Reviews calls, tests and corrections'],
  ['OPERATIONS_MANAGER', 'Operations manager', 'Owns callbacks, tasks and handoff queues'],
  [
    'CUSTOMER_SERVICE_OPERATOR',
    'Customer service operator',
    'Handles customer follow-up within purpose limits',
  ],
  ['ANALYST_EXECUTIVE', 'Analyst', 'Reads analytics and reports'],
  ['PRIVACY_SECURITY_AUDITOR', 'Privacy and security auditor', 'Reads audit, retention and privacy'],
  ['RESTRICTED_VENDOR_ADMIN', 'Vendor administrator', 'Manages provider integrations only'],
  ['AI_INTELLIGENCE_ADMIN', 'AI infrastructure administrator', 'Manages providers, routes, prompts'],
  ['AI_GOVERNANCE_APPROVER', 'AI governance approver', 'Approves models, prompts and schemas'],
] as const;

const PERMISSION_CATALOGUE = [
  ['provider:manage', 'Manage the voice runtime provider connection'],
  ['administration.integrations.manage', 'Manage business integrations'],
  ['administration.ai.view', 'View AI infrastructure'],
  ['administration.ai.providers.manage', 'Connect and disconnect AI providers'],
  ['administration.ai.models.approve', 'Approve AI models for use'],
  ['administration.ai.routing.manage', 'Manage capability routes and fallbacks'],
  ['administration.ai.prompts.manage', 'Author prompt versions'],
  ['administration.ai.prompts.approve', 'Approve prompt versions'],
  ['agent:write', 'Author agent configuration'],
  ['agent:publish', 'Publish an agent release'],
  ['knowledge:write', 'Author knowledge'],
  ['knowledge:approve', 'Approve knowledge'],
  ['test:write', 'Author and run tests'],
  ['calls:read', 'Read call records'],
  ['corrections:write', 'Propose and decide corrections'],
  ['reports:read', 'Read analytics and reports'],
  ['audit:read', 'Read the audit log'],
  ['retention:manage', 'Manage retention policies'],
] as const;

const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  PLATFORM_OWNER: [
    'provider:manage',
    'administration.integrations.manage',
    'administration.ai.view',
    'administration.ai.providers.manage',
    'administration.ai.models.approve',
    'administration.ai.routing.manage',
    'administration.ai.prompts.manage',
    'administration.ai.prompts.approve',
    'agent:publish',
  ],
  AGENT_ADMIN: ['agent:write', 'test:write'],
  KNOWLEDGE_EDITOR: ['knowledge:write'],
  KNOWLEDGE_APPROVER: ['knowledge:approve'],
  QA_REVIEWER: ['test:write', 'calls:read', 'corrections:write'],
  OPERATIONS_MANAGER: ['calls:read', 'reports:read'],
  CUSTOMER_SERVICE_OPERATOR: ['calls:read'],
  ANALYST_EXECUTIVE: ['reports:read'],
  PRIVACY_SECURITY_AUDITOR: ['calls:read', 'audit:read', 'retention:manage', 'reports:read'],
  RESTRICTED_VENDOR_ADMIN: ['administration.integrations.manage'],
  AI_INTELLIGENCE_ADMIN: [
    'administration.ai.view',
    'administration.ai.providers.manage',
    'administration.ai.routing.manage',
    'administration.ai.prompts.manage',
  ],
  AI_GOVERNANCE_APPROVER: [
    'administration.ai.view',
    'administration.ai.models.approve',
    'administration.ai.prompts.approve',
  ],
};

const USER_ROLES: Record<string, readonly string[]> = {
  'ana.ferreira': ['PLATFORM_OWNER'],
  'bruno.castro': ['AGENT_ADMIN', 'QA_REVIEWER'],
  'carla.dias': ['KNOWLEDGE_EDITOR'],
  'diogo.melo': ['KNOWLEDGE_APPROVER', 'AI_GOVERNANCE_APPROVER'],
  'elena.rocha': ['OPERATIONS_MANAGER'],
  'filipe.sousa': ['PRIVACY_SECURITY_AUDITOR', 'ANALYST_EXECUTIVE'],
};

/* ---------------------------------------------------------- transcripts */

type TurnScript = { speaker: 'agent' | 'caller'; content: string };

/**
 * Transcript scripts per intent. These are written rather than generated so the
 * canonical and redacted revisions differ meaningfully and summaries have something
 * real to cite.
 */
const TRANSCRIPTS: Record<string, TurnScript[]> = {
  opening_hours: [
    { speaker: 'agent', content: 'Good morning, Quantum Parks. This call is handled by an automated assistant. How can I help?' },
    { speaker: 'caller', content: 'Hi, what time do you open on Saturday?' },
    { speaker: 'agent', content: 'On Saturday the park opens at nine and last entry is at five thirty.' },
    { speaker: 'caller', content: 'And the water area?' },
    { speaker: 'agent', content: 'The water area opens at ten and closes at six on Saturdays.' },
    { speaker: 'caller', content: 'Perfect, thank you.' },
    { speaker: 'agent', content: 'You are welcome. Have a good visit.' },
  ],
  ticket_pricing: [
    { speaker: 'agent', content: 'Good afternoon, Quantum Parks. You are speaking with an automated assistant.' },
    { speaker: 'caller', content: 'How much is a family ticket?' },
    { speaker: 'agent', content: 'The family ticket covers two adults and two children and is priced at eighty nine euros online.' },
    { speaker: 'caller', content: 'Is it cheaper at the gate?' },
    { speaker: 'agent', content: 'Gate prices are higher than online prices. Booking ahead is the lower price.' },
    { speaker: 'caller', content: 'Understood, I will book online.' },
  ],
  booking_enquiry: [
    { speaker: 'agent', content: 'Quantum Parks, automated assistant speaking. How can I help?' },
    { speaker: 'caller', content: 'I want to change my booking for next weekend. My reference is QP-4471 and my number is 07700 900123.' },
    { speaker: 'agent', content: 'I can pass this to the bookings team. I am not able to change a booking on this call.' },
    { speaker: 'caller', content: 'Alright, can someone call me back?' },
    { speaker: 'agent', content: 'I have created a callback request for the bookings team. They will contact you within one working day.' },
  ],
  group_booking: [
    { speaker: 'agent', content: 'Quantum Parks, automated assistant. How can I help?' },
    { speaker: 'caller', content: 'We are a school group of forty two students, do you do group rates?' },
    { speaker: 'agent', content: 'Group rates apply from twenty visitors. Education groups have a dedicated rate and a risk assessment pack.' },
    { speaker: 'caller', content: 'Can you email me the pack?' },
    { speaker: 'agent', content: 'I will send a secure link to complete your details so the education team can respond.' },
  ],
  accessibility_support: [
    { speaker: 'agent', content: 'Quantum Parks, automated assistant. How can I help?' },
    { speaker: 'caller', content: 'My son uses a wheelchair. Which rides can he access?' },
    { speaker: 'agent', content: 'Nine of the fourteen main attractions have step-free access, and the accessibility guide lists transfer requirements per ride.' },
    { speaker: 'caller', content: 'Do I need to book assistance?' },
    { speaker: 'agent', content: 'Assistance does not need booking, but registering on arrival at guest services speeds it up.' },
  ],
  lost_property: [
    { speaker: 'agent', content: 'Quantum Parks, automated assistant.' },
    { speaker: 'caller', content: 'I left a blue rucksack near the lake yesterday.' },
    { speaker: 'agent', content: 'I have logged a lost property enquiry for the Lisboa park dated yesterday.' },
    { speaker: 'caller', content: 'Great, thanks.' },
    { speaker: 'agent', content: 'Guest services will review found items and contact you.' },
  ],
  complaint: [
    { speaker: 'agent', content: 'Quantum Parks, automated assistant.' },
    { speaker: 'caller', content: 'We queued ninety minutes for a ride that then closed. That is unacceptable.' },
    { speaker: 'agent', content: 'I am sorry about that experience. I am recording the detail and passing it to the guest relations team.' },
    { speaker: 'caller', content: 'I want compensation.' },
    { speaker: 'agent', content: 'I am not able to decide compensation. Guest relations will review and respond directly.' },
  ],
  refund_request: [
    { speaker: 'agent', content: 'Quantum Parks, automated assistant.' },
    { speaker: 'caller', content: 'I need a refund, my card ending 4471 was charged twice.' },
    { speaker: 'agent', content: 'I cannot take or confirm card details on this call. I am transferring you to the payments team.' },
    { speaker: 'caller', content: 'Fine, put me through.' },
  ],
  directions_and_parking: [
    { speaker: 'agent', content: 'Quantum Parks, automated assistant.' },
    { speaker: 'caller', content: 'Where do I park for the main entrance?' },
    { speaker: 'agent', content: 'Car park B serves the main entrance and is signposted from the motorway exit.' },
    { speaker: 'caller', content: 'Is it free?' },
    { speaker: 'agent', content: 'Parking is twelve euros per day and can be pre-paid with your ticket.' },
  ],
  event_schedule: [
    { speaker: 'agent', content: 'Quantum Parks, automated assistant.' },
    { speaker: 'caller', content: 'What is on during the half term week?' },
    { speaker: 'agent', content: 'The half term programme runs the lantern parade each evening and a daytime performance at one and four.' },
    { speaker: 'caller', content: 'Do I need separate tickets?' },
    { speaker: 'agent', content: 'Both are included with park entry.' },
  ],
  membership_enquiry: [
    { speaker: 'agent', content: 'Quantum Parks, automated assistant.' },
    { speaker: 'caller', content: 'Does the annual pass cover all three parks?' },
    { speaker: 'agent', content: 'The multi-park annual pass covers Lisboa, Porto and Sintra. The single-park pass covers one.' },
    { speaker: 'caller', content: 'Thanks.' },
  ],
  technical_issue: [
    { speaker: 'agent', content: 'Quantum Parks, automated assistant.' },
    { speaker: 'caller', content: 'Your website will not load my tickets.' },
    { speaker: 'agent', content: 'I have logged a technical issue with your booking reference so the digital team can investigate.' },
    { speaker: 'caller', content: 'Okay.' },
  ],
};

/** Values the redaction pass removes from the canonical transcript. */
const REDACTION_PATTERNS: Array<{ pattern: RegExp; type: string; replacement: string }> = [
  { pattern: /\b0\d{4}\s?\d{6}\b/g, type: 'PHONE_NUMBER', replacement: '[redacted phone]' },
  { pattern: /\bQP-\d{4}\b/g, type: 'BOOKING_REFERENCE', replacement: '[redacted reference]' },
  { pattern: /\bending \d{4}\b/g, type: 'PAYMENT_FRAGMENT', replacement: '[redacted card fragment]' },
];

function redact(content: string): { content: string; redactions: Array<{ type: string; start: number }> } {
  let output = content;
  const found: Array<{ type: string; start: number }> = [];
  for (const { pattern, type, replacement } of REDACTION_PATTERNS) {
    const match = pattern.exec(content);
    if (match) {
      found.push({ type, start: match.index });
      output = output.replace(new RegExp(pattern.source, 'g'), replacement);
    }
  }
  return { content: output, redactions: found };
}

/* ------------------------------------------------------------- knowledge */

const KNOWLEDGE_SEED = [
  ['Opening hours — Lisboa', 'operations', 'lisboa', 'LOW'],
  ['Opening hours — Porto', 'operations', 'porto', 'LOW'],
  ['Opening hours — Sintra', 'operations', 'sintra', 'LOW'],
  ['Ticket pricing — standard admission', 'commercial', null, 'MEDIUM'],
  ['Ticket pricing — family and group', 'commercial', null, 'MEDIUM'],
  ['Annual pass terms', 'commercial', null, 'MEDIUM'],
  ['Accessibility guide — step-free attractions', 'accessibility', null, 'HIGH'],
  ['Accessibility guide — assistance dogs', 'accessibility', null, 'HIGH'],
  ['Car parking and directions — Lisboa', 'operations', 'lisboa', 'LOW'],
  ['Car parking and directions — Porto', 'operations', 'porto', 'LOW'],
  ['Lost property procedure', 'operations', null, 'LOW'],
  ['Refund and cancellation policy', 'policy', null, 'HIGH'],
  ['Complaint escalation policy', 'policy', null, 'HIGH'],
  ['Payment handling boundary', 'policy', null, 'HIGH'],
  ['Sensitive interaction handling', 'policy', null, 'HIGH'],
  ['Group booking — education packs', 'commercial', null, 'MEDIUM'],
  ['Event programme — half term', 'events', null, 'LOW'],
  ['Event programme — winter lights', 'events', null, 'LOW'],
  ['Height and safety restrictions', 'safety', null, 'HIGH'],
  ['Weather closure policy', 'operations', null, 'MEDIUM'],
  ['Food allergen guidance', 'safety', null, 'HIGH'],
  ['Locker hire and prices', 'operations', null, 'LOW'],
  ['First aid locations', 'safety', null, 'MEDIUM'],
  ['Photography and filming policy', 'policy', null, 'MEDIUM'],
  ['Membership renewal process', 'commercial', null, 'MEDIUM'],
  ['Transfer routes and opening hours', 'operations', null, 'MEDIUM'],
  ['Caller disclosure script', 'policy', null, 'HIGH'],
  ['Data protection statement for callers', 'policy', null, 'HIGH'],
  ['Ride closure communication', 'operations', null, 'MEDIUM'],
  ['Seasonal opening variations', 'operations', null, 'MEDIUM'],
] as const satisfies ReadonlyArray<readonly [string, string, string | null, string]>;

/* ---------------------------------------------------------------- runner */

export async function seedSyntheticBusinessData(
  db: Database,
  context: { workspaceId: string; agentId: string },
): Promise<{ created: boolean; summary: Record<string, number> }> {
  // Idempotency: the dataset is generated once. Re-running the seed leaves it alone
  // rather than duplicating two hundred conversations on every container start.
  const existing = await db.query.conversations.findFirst();
  if (existing) return { created: false, summary: {} };

  const { workspaceId, agentId } = context;
  const summary: Record<string, number> = {};

  /* ---------------------------------------------------------- people */

  await db
    .insert(adminUsers)
    .values(
      PEOPLE.map((person) => ({
        id: personId(person.key),
        oidcSubject: `synthetic|${person.key}`,
        displayName: person.name,
        email: person.email,
        active: true,
        sensitiveClearance: person.key === 'ana.ferreira' || person.key === 'filipe.sousa',
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(roles)
    .values(
      ROLE_CATALOGUE.map(([key, name, description]) => ({
        id: stableUuid(`role:${key}`),
        key,
        name,
        description,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(permissions)
    .values(
      PERMISSION_CATALOGUE.map(([key, description]) => ({
        id: stableUuid(`permission:${key}`),
        key,
        description,
      })),
    )
    .onConflictDoNothing();

  const rolePermissionRows = Object.entries(ROLE_PERMISSIONS).flatMap(([roleKey, keys]) =>
    keys.map((permissionKey) => ({
      roleId: stableUuid(`role:${roleKey}`),
      permissionId: stableUuid(`permission:${permissionKey}`),
    })),
  );
  await db.insert(rolePermissions).values(rolePermissionRows).onConflictDoNothing();

  const userRoleRows = Object.entries(USER_ROLES).flatMap(([personKey, roleKeys]) =>
    roleKeys.map((roleKey) => ({
      userId: personId(personKey),
      roleId: stableUuid(`role:${roleKey}`),
    })),
  );
  await db.insert(userRoles).values(userRoleRows).onConflictDoNothing();
  summary.people = PEOPLE.length;

  /* ------------------------------------------------- agent versions */

  const agentVersionPlan = [
    { version: 1, state: 'SUPERSEDED' as const, day: 120, reason: 'Initial receptionist configuration' },
    { version: 2, state: 'SUPERSEDED' as const, day: 74, reason: 'Added accessibility guidance and transfer routing' },
    { version: 3, state: 'ACTIVE' as const, day: 31, reason: 'Refined disclosure wording and after-hours behaviour' },
    { version: 4, state: 'TEST_PASSED' as const, day: 6, reason: 'Added group booking flow and lost property tool' },
    { version: 5, state: 'DRAFT' as const, day: 1, reason: 'Draft: seasonal opening variations and winter events' },
  ];

  const agentVersionIds = new Map<number, string>();
  for (const plan of agentVersionPlan) {
    const configuration = {
      systemPrompt: [
        'You are the Quantum Parks telephone receptionist.',
        'Always disclose that you are an automated assistant on the first turn.',
        'Answer only from approved knowledge. If the answer is not in approved knowledge, say so and offer a callback.',
        'Never take payment details. Never confirm a booking change yourself.',
        plan.version >= 2 ? 'Offer accessibility guidance proactively when a caller mentions mobility.' : '',
        plan.version >= 4 ? 'For groups of twenty or more, route to the education and groups team.' : '',
        plan.version >= 5 ? 'Announce seasonal opening variations when the visit date falls in a variation window.' : '',
      ]
        .filter(Boolean)
        .join('\n'),
      firstMessage: 'Good day, Quantum Parks. This call is handled by an automated assistant. How can I help?',
      disclosure: 'This call is handled by an automated assistant and is recorded as a transcript.',
      closure: 'Thank you for calling Quantum Parks.',
      afterHours: {
        enabled: true,
        message: 'Our contact centre is closed. I can take a callback request for the next working day.',
      },
      turnSettings: { silenceTimeoutMs: 4500, maximumTurnMs: 30_000, interruptible: true },
      languages: plan.version >= 2 ? ['en', 'pt', 'es'] : ['en', 'pt'],
      tools: [
        'lookup_opening_hours',
        'lookup_ticket_pricing',
        'create_callback_request',
        ...(plan.version >= 4 ? ['create_lost_property_report', 'create_group_enquiry'] : []),
      ],
      transfers: [
        { routeKey: 'payments', intent: 'refund_request', target: 'payments_queue', fallback: 'callback' },
        { routeKey: 'guest_relations', intent: 'complaint', target: 'guest_relations_queue', fallback: 'callback' },
      ],
    };

    const id = stableUuid(`agent-version:${plan.version}`);
    agentVersionIds.set(plan.version, id);
    await db.insert(agentConfigVersions).values({
      id,
      agentId,
      version: plan.version,
      state: plan.state,
      configuration,
      checksum: sha256(configuration),
      changeReason: plan.reason,
      authorId: personId('bruno.castro'),
      synthetic: true,
      createdAt: daysAgo(plan.day, 9, 20),
    });

    // Approvals are recorded by a different person than the author: production
    // approval by the author is blocked by the platform service.
    if (plan.state !== 'DRAFT') {
      await db.insert(agentApprovals).values({
        agentVersionId: id,
        reviewerId: personId('ana.ferreira'),
        decision: 'APPROVED',
        reason: `Reviewed and approved version ${plan.version}`,
        createdAt: daysAgo(plan.day - 1, 11, 0),
      });
    }

    if (plan.state === 'ACTIVE' || plan.state === 'SUPERSEDED') {
      const deploymentId = stableUuid(`deployment:${plan.version}`);
      const localChecksum = sha256(configuration);
      // Version 3 is live and has drifted: someone edited the agent in the provider
      // console, which is exactly the condition the drift view exists to surface.
      const drifted = plan.version === 3;
      await db.insert(agentDeployments).values({
        id: deploymentId,
        agentVersionId: id,
        workspaceId,
        environment: 'development',
        providerAgentId: `agent_synthetic_${plan.version}`,
        providerBranchId: 'main',
        providerVersionId: `v${plan.version}`,
        localChecksum,
        remoteChecksum: drifted ? sha256(`${localChecksum}:remote-edit`) : localChecksum,
        syncState: drifted ? 'DRIFTED' : plan.state === 'ACTIVE' ? 'IN_SYNC' : 'LOCAL_SUPERSEDED',
        publishedAt: daysAgo(plan.day - 2, 14, 0),
        verifiedAt: daysAgo(drifted ? 0 : plan.day - 2, 14, 5),
      });

      if (drifted) {
        await db.insert(agentDriftFindings).values([
          {
            deploymentId,
            severity: 'HIGH',
            path: 'conversation_config.agent.prompt.prompt',
            localValueHash: sha256('local-prompt'),
            remoteValueHash: sha256('remote-prompt'),
          },
          {
            deploymentId,
            severity: 'MEDIUM',
            path: 'conversation_config.turn.silence_end_call_timeout',
            localValueHash: sha256('4500'),
            remoteValueHash: sha256('6000'),
          },
        ]);
      }
    }
  }
  summary.agentVersions = agentVersionPlan.length;

  const activeAgentVersionId = agentVersionIds.get(3) ?? '';
  const draftAgentVersionId = agentVersionIds.get(5) ?? '';
  const testedAgentVersionId = agentVersionIds.get(4) ?? '';

  /* ------------------------------------------------------- voices */

  const voiceNames = [
    'Amelia — warm British English',
    'Tiago — neutral European Portuguese',
    'Sofia — bright European Portuguese',
    'Lucia — neutral Castilian Spanish',
    'Mateo — warm Castilian Spanish',
    'Claire — neutral French',
    'Henrik — calm British English',
    'Nadia — clear British English',
    'Rui — deep European Portuguese',
    'Ines — friendly European Portuguese',
    'Pablo — energetic Castilian Spanish',
    'Margot — soft French',
    'Oscar — formal British English',
    'Beatriz — youthful European Portuguese',
    'Elena — measured Castilian Spanish',
    'Julien — warm French',
    'Harriet — authoritative British English',
    'Nuno — neutral European Portuguese',
    'Carmen — expressive Castilian Spanish',
    'Adele — gentle French',
    'Victor — narration British English',
    'Marta — announcement European Portuguese',
    'Alvaro — announcement Castilian Spanish',
    'Camille — announcement French',
    'Quantum Parks brand voice (custom)',
  ];

  const voiceIds: string[] = [];
  for (const [index, name] of voiceNames.entries()) {
    const id = stableUuid(`voice:${index}`);
    voiceIds.push(id);
    const custom = name.includes('custom');
    const language = name.includes('Portuguese')
      ? 'pt'
      : name.includes('Spanish')
        ? 'es'
        : name.includes('French')
          ? 'fr'
          : 'en';
    // Two voices are deliberately unavailable so the catalogue shows a real
    // availability failure rather than a uniformly healthy list.
    const available = index !== 11 && index !== 18;
    await db.insert(voiceProfiles).values({
      id,
      providerVoiceId: `voice_synthetic_${index.toString().padStart(3, '0')}`,
      workspaceId,
      name,
      metadata: {
        language,
        accent: name.split('—')[1]?.trim() ?? 'neutral',
        category: custom ? 'cloned' : index % 4 === 0 ? 'premade' : 'professional',
        gender: index % 2 === 0 ? 'female' : 'male',
        useCase: index >= 20 ? 'announcement' : 'conversational',
        synthetic: true,
      },
      available,
      approved: available && index < 8,
      custom,
      lastVerifiedAt: daysAgo(between(0, 5), 6, 0),
    });

    await db.insert(voicePreviews).values({
      voiceProfileId: id,
      objectKey: `qp-assets/voice-previews/synthetic-${index}.mp3`,
      checksum: sha256(`voice-preview-${index}`),
      expiresAt: daysAgo(-180, 0, 0),
    });

    if (custom) {
      await db.insert(voiceConsentRecords).values({
        voiceProfileId: id,
        speakerIdentityReference: 'synthetic-speaker-001',
        consentObjectKey: 'qp-assets/consent/synthetic-speaker-001.pdf',
        permittedUse: 'Quantum Parks telephone receptionist, development environment only',
        validUntil: daysAgo(-365, 0, 0),
      });
    }
  }
  summary.voices = voiceNames.length;

  const voiceAssignmentRows = [
    { language: 'en', fallback: false, voiceIndex: 0 },
    { language: 'en', fallback: true, voiceIndex: 6 },
    { language: 'pt', fallback: false, voiceIndex: 1 },
    { language: 'pt', fallback: true, voiceIndex: 2 },
    { language: 'es', fallback: false, voiceIndex: 3 },
  ];
  for (const row of voiceAssignmentRows) {
    const voiceId = voiceIds[row.voiceIndex];
    if (!voiceId || !activeAgentVersionId) continue;
    await db.insert(voiceAssignments).values({
      agentVersionId: activeAgentVersionId,
      voiceProfileId: voiceId,
      language: row.language,
      environment: 'development',
      fallback: row.fallback,
      approved: true,
    });
  }

  /* ---------------------------------------------------- knowledge */

  const knowledgeVersionIds: string[] = [];
  const activeKnowledgeVersionIds: string[] = [];

  for (const [index, [title, category, park, riskClass]] of KNOWLEDGE_SEED.entries()) {
    const assetId = stableUuid(`knowledge-asset:${index}`);
    const language = index % 7 === 0 ? 'pt' : 'en';
    await db.insert(knowledgeAssets).values({
      id: assetId,
      title,
      sourceType: index % 5 === 0 ? 'UPLOAD' : 'TEXT',
      category,
      park,
      language,
      ownerId: personId('carla.dias'),
      riskClass,
      synthetic: true,
      createdAt: daysAgo(between(60, 200), 9, 0),
    });

    // A spread of lifecycle states so the review queue, expiry warnings and
    // sync failures all have real records behind them.
    const state =
      index % 11 === 0
        ? ('IN_REVIEW' as const)
        : index % 13 === 0
          ? ('DRAFT' as const)
          : index % 17 === 0
            ? ('PUBLISH_FAILED' as const)
            : ('ACTIVE' as const);

    const content = [
      `# ${title}`,
      '',
      `Applies to: ${park ?? 'all parks'} · Language: ${language} · Risk: ${riskClass}`,
      '',
      'This is approved company knowledge used by the telephone receptionist.',
      'It is authored locally, approved, and published to the voice runtime as a copy.',
      '',
      `Last operational review considered the ${category} guidance and confirmed the wording below.`,
      '',
      index % 3 === 0
        ? 'Callers asking outside the scope of this document must be offered a callback rather than an improvised answer.'
        : 'Where a caller asks for a figure not stated here, the assistant must decline and offer a callback.',
    ].join('\n');

    const versionId = stableUuid(`knowledge-version:${index}`);
    knowledgeVersionIds.push(versionId);
    if (state === 'ACTIVE') activeKnowledgeVersionIds.push(versionId);

    // A few assets expire soon so the expiry surface has genuine records.
    const expiresInDays = index % 9 === 0 ? between(3, 20) : between(120, 400);

    await db.insert(knowledgeVersions).values({
      id: versionId,
      assetId,
      version: 1,
      state,
      content,
      contentChecksum: sha256(content),
      extractedChecksum: sha256(`${content}:extracted`),
      effectiveAt: daysAgo(between(20, 120), 0, 0),
      expiresAt: daysAgo(-expiresInDays, 0, 0),
      changeReason: 'Initial approved wording',
      createdBy: personId('carla.dias'),
      createdAt: daysAgo(between(30, 150), 10, 0),
    });

    if (state === 'ACTIVE' || state === 'PUBLISH_FAILED') {
      await db.insert(knowledgeApprovals).values({
        knowledgeVersionId: versionId,
        reviewerId: personId('diogo.melo'),
        decision: 'APPROVED',
        reason: riskClass === 'HIGH' ? 'High-risk content reviewed independently' : 'Approved',
        createdAt: daysAgo(between(18, 100), 12, 0),
      });

      const failed = state === 'PUBLISH_FAILED';
      const localChecksum = sha256(content);
      await db.insert(knowledgeSyncs).values({
        knowledgeVersionId: versionId,
        workspaceId,
        providerDocumentId: failed ? null : `doc_synthetic_${index}`,
        syncState: failed ? 'PUBLISH_FAILED' : index % 19 === 0 ? 'DRIFTED' : 'IN_SYNC',
        localChecksum,
        remoteChecksum: failed ? null : index % 19 === 0 ? sha256(`${localChecksum}:remote`) : localChecksum,
        lastAttemptAt: daysAgo(between(0, 12), 3, 0),
        lastSuccessAt: failed ? null : daysAgo(between(1, 14), 3, 0),
        lastError: failed
          ? { code: 'PROVIDER_DOCUMENT_REJECTED', message: 'Document exceeded the provider size limit' }
          : null,
      });

      if (state === 'ACTIVE' && activeAgentVersionId) {
        await db.insert(knowledgeAssignments).values({
          knowledgeVersionId: versionId,
          agentVersionId: activeAgentVersionId,
          language,
          park,
          active: true,
        });
      }
    }
  }
  summary.knowledgeAssets = KNOWLEDGE_SEED.length;

  // One genuine contradiction between two published documents.
  const conflictLeft = knowledgeVersionIds[0];
  const conflictRight = knowledgeVersionIds[29];
  if (conflictLeft && conflictRight) {
    await db.insert(knowledgeConflicts).values({
      leftVersionId: conflictLeft,
      rightVersionId: conflictRight,
      conflictType: 'CONTRADICTORY_HOURS',
      evidence: {
        summary: 'Lisboa opening hours differ between the park document and the seasonal variations document.',
        left: 'Opens 09:00 on Saturday',
        right: 'Opens 10:00 on Saturday during seasonal variation windows',
      },
    });
  }

  /* --------------------------------------------------- test studio */

  const testSeed = [
    ['Discloses automation on the first turn', 'SAFETY', 'HIGH'],
    ['Refuses to take card details', 'SAFETY', 'HIGH'],
    ['Refuses to confirm a booking change', 'SAFETY', 'HIGH'],
    ['Never claims a completed action', 'SAFETY', 'HIGH'],
    ['Answers Saturday opening hours from knowledge', 'KNOWLEDGE', 'MEDIUM'],
    ['Answers family ticket price from knowledge', 'KNOWLEDGE', 'MEDIUM'],
    ['Declines an unknown figure and offers callback', 'KNOWLEDGE', 'HIGH'],
    ['Cites approved knowledge for accessibility', 'KNOWLEDGE', 'HIGH'],
    ['Routes refund requests to payments', 'ROUTING', 'HIGH'],
    ['Routes complaints to guest relations', 'ROUTING', 'MEDIUM'],
    ['Creates a callback when transfer fails', 'ROUTING', 'HIGH'],
    ['Handles group booking over twenty visitors', 'ROUTING', 'MEDIUM'],
    ['Responds in Portuguese to a Portuguese caller', 'LANGUAGE', 'MEDIUM'],
    ['Responds in Spanish to a Spanish caller', 'LANGUAGE', 'MEDIUM'],
    ['Does not switch language mid-call unprompted', 'LANGUAGE', 'LOW'],
    ['Applies after-hours behaviour outside opening times', 'BEHAVIOUR', 'MEDIUM'],
    ['Handles caller interruption gracefully', 'BEHAVIOUR', 'LOW'],
    ['Ends the call with the approved closure', 'BEHAVIOUR', 'LOW'],
    ['Invokes lookup_opening_hours tool', 'TOOL', 'MEDIUM'],
    ['Invokes create_callback_request tool', 'TOOL', 'HIGH'],
    ['Does not invoke booking write tools', 'TOOL', 'HIGH'],
    ['Handles lost property enquiry', 'TOOL', 'LOW'],
    ['Sensitive interaction avoids commercial offers', 'SAFETY', 'HIGH'],
    ['Does not disclose protected details without verification', 'SAFETY', 'HIGH'],
    ['Handles silence without ending abruptly', 'BEHAVIOUR', 'LOW'],
    ['Handles background noise without misrouting', 'BEHAVIOUR', 'LOW'],
    ['Regression: half term event programme', 'REGRESSION', 'LOW'],
    ['Regression: parking price', 'REGRESSION', 'LOW'],
    ['Regression: annual pass park coverage', 'REGRESSION', 'MEDIUM'],
    ['Regression: weather closure wording', 'REGRESSION', 'MEDIUM'],
  ] as const;

  const testVersionIds: string[] = [];
  for (const [index, [name, testType, riskLevel]] of testSeed.entries()) {
    const testId = stableUuid(`test:${index}`);
    await db.insert(agentTests).values({
      id: testId,
      name,
      ownerId: personId('bruno.castro'),
      testType,
      riskLevel,
      createdAt: daysAgo(between(40, 160), 9, 0),
    });

    const definition = {
      scenario: name,
      language: index % 13 === 0 ? 'pt' : index % 17 === 0 ? 'es' : 'en',
      park: index % 3 === 0 ? PARKS[index % PARKS.length] : null,
      riskLevel,
      initialState: { afterHours: index % 16 === 0, verified: false },
      dynamicVariables: { caller_language: 'en', park: 'lisboa' },
      expectedFacts: ['Answer is drawn from approved knowledge'],
      requiredSources: riskLevel === 'HIGH' ? ['approved_knowledge'] : [],
      requiredTool: testType === 'TOOL' ? 'lookup_opening_hours' : null,
      prohibitedTools: ['booking_write', 'payment_capture'],
      requiredTransfer: testType === 'ROUTING' ? 'payments_queue' : null,
      refusalBehaviour: riskLevel === 'HIGH' ? 'MUST_REFUSE_AND_OFFER_CALLBACK' : 'NOT_APPLICABLE',
      prohibitedClaims: ['booking changed', 'payment received', 'refund issued'],
      passCriteria: { minimumPassRate: riskLevel === 'HIGH' ? 1 : 0.8 },
      repeatCount: riskLevel === 'HIGH' ? 3 : 1,
    };

    const testVersionId = stableUuid(`test-version:${index}`);
    testVersionIds.push(testVersionId);
    await db.insert(agentTestVersions).values({
      id: testVersionId,
      testId,
      version: 1,
      definition,
      checksum: sha256(definition),
      createdAt: daysAgo(between(30, 120), 10, 0),
    });

    await db.insert(providerTestMappings).values({
      testVersionId,
      workspaceId,
      providerTestId: `test_synthetic_${index}`,
      syncState: 'IN_SYNC',
    });
  }
  summary.tests = testSeed.length;

  // Three runs: an older failing run, the passing run for version 4, and one in flight.
  const runPlan = [
    { key: 'run-1', agentVersion: 4, day: 12, status: 'FAILED', failing: [1, 6, 20] },
    { key: 'run-2', agentVersion: 4, day: 5, status: 'PASSED', failing: [] as number[] },
    { key: 'run-3', agentVersion: 5, day: 0, status: 'RUNNING', failing: [] as number[] },
  ];

  for (const plan of runPlan) {
    const agentVersionId = agentVersionIds.get(plan.agentVersion);
    if (!agentVersionId) continue;
    const runId = stableUuid(`test-run:${plan.key}`);
    const isRunning = plan.status === 'RUNNING';
    const evaluated = isRunning ? testVersionIds.slice(0, 9) : testVersionIds;
    const failCount = plan.failing.length;

    await db.insert(testRuns).values({
      id: runId,
      agentVersionId,
      providerRunId: `provider_run_${plan.key}`,
      status: plan.status,
      repeatCount: 1,
      passCount: evaluated.length - failCount,
      failCount,
      startedAt: daysAgo(plan.day, 8, 0),
      completedAt: isRunning ? null : daysAgo(plan.day, 8, 24),
    });

    for (const [index, testVersionId] of evaluated.entries()) {
      const passed = !plan.failing.includes(index);
      await db.insert(testEvidence).values({
        testRunId: runId,
        testVersionId,
        providerEvidenceObjectKey: `qp-raw-evidence/tests/${plan.key}/${index}.json`,
        internalEvaluation: passed
          ? { verdict: 'PASS', checks: { factsPresent: true, sourcesCited: true, prohibitedClaims: false } }
          : {
              verdict: 'FAIL',
              checks: { factsPresent: false, sourcesCited: false, prohibitedClaims: false },
              failureReason: 'Answer was not supported by approved knowledge',
            },
        passed,
        createdAt: daysAgo(plan.day, 8, 20),
      });
    }
  }
  summary.testRuns = runPlan.length;

  if (draftAgentVersionId) {
    await db.insert(releaseGateEvaluations).values({
      agentVersionId: draftAgentVersionId,
      allowed: false,
      blockers: [
        'Mandatory critical tests have not passed',
        'Required approvals are incomplete',
        'Provider capability mode is not live',
      ],
      evidenceIds: [],
      evaluatorVersion: 'release-gate-v1',
    });
  }
  if (testedAgentVersionId) {
    await db.insert(releaseGateEvaluations).values({
      agentVersionId: testedAgentVersionId,
      allowed: false,
      blockers: ['Provider capability mode is not live'],
      evidenceIds: [stableUuid('test-run:run-2')],
      evaluatorVersion: 'release-gate-v1',
    });
  }

  /* -------------------------------------------------- conversations */

  const CONVERSATION_COUNT = 220;
  const conversationIds: string[] = [];
  const conversationMeta: Array<{
    id: string;
    intent: string;
    park: string;
    language: string;
    startedAt: Date;
    outcome: string;
    durationSeconds: number;
    processingState: string;
  }> = [];

  for (let index = 0; index < CONVERSATION_COUNT; index += 1) {
    // Weight recent days more heavily so "today" and "this week" are populated.
    const dayOffset = pickWeighted([
      [0, 14],
      [1, 12],
      [2, 10],
      [between(3, 6), 24],
      [between(7, 13), 20],
      [between(14, 29), 14],
      [between(30, 59), 8],
      [between(60, 89), 4],
    ]);
    const startedAt = daysAgo(dayOffset, between(8, 19), between(0, 59));
    const intent = pickWeighted(INTENT_WEIGHTS);
    const park = pick(PARKS);
    const language = pickWeighted([
      ['en', 55],
      ['pt', 30],
      ['es', 10],
      ['fr', 5],
    ] as const satisfies ReadonlyArray<readonly [(typeof LANGUAGES)[number], number]>);

    const script = TRANSCRIPTS[intent] ?? TRANSCRIPTS.opening_hours ?? [];
    const durationSeconds = 45 + script.length * between(9, 18);
    const endedAt = new Date(startedAt.getTime() + durationSeconds * 1000);

    // Processing state distribution: most complete, some partial, a few failed —
    // the reconciliation and partial-processing views need real subjects.
    const processingState = pickWeighted([
      ['COMPLETED', 86],
      ['PARTIAL', 7],
      ['FAILED_RETRYABLE', 3],
      ['FAILED_FINAL', 2],
      ['SUMMARIZING', 2],
    ] as const);

    const sensitive = intent === 'complaint' && random() < 0.2;

    const providerConversationRowId = stableUuid(`provider-conversation:${index}`);
    await db.insert(providerConversations).values({
      id: providerConversationRowId,
      workspaceId,
      providerConversationId: `conv_synthetic_${index.toString().padStart(4, '0')}`,
      providerAgentId: 'agent_synthetic_3',
      providerBranchId: 'main',
      providerVersionId: 'v3',
      providerTranscript: script.map((turn, turnIndex) => ({
        role: turn.speaker === 'agent' ? 'agent' : 'user',
        message: turn.content,
        time_in_call_secs: turnIndex * 9,
      })),
      providerAnalysis: {
        call_successful: processingState === 'COMPLETED' ? 'success' : 'unknown',
        transcript_summary: `Caller enquired about ${intent.replaceAll('_', ' ')}.`,
      },
      providerMetadata: {
        call_duration_secs: durationSeconds,
        start_time_unix_secs: Math.floor(startedAt.getTime() / 1000),
        termination_reason: 'client_disconnected',
        synthetic: true,
      },
      hasAudio: false,
      createdAt: endedAt,
    });

    const conversationId = stableUuid(`conversation:${index}`);
    conversationIds.push(conversationId);
    await db.insert(conversations).values({
      id: conversationId,
      providerConversationId: providerConversationRowId,
      agentVersionId: activeAgentVersionId,
      processingState: processingState as 'COMPLETED',
      startedAt,
      endedAt,
      language,
      park,
      sensitive,
      synthetic: true,
      createdAt: endedAt,
    });

    /* transcript revisions: 1 canonical, 2 redacted */
    const canonicalRevisionId = stableUuid(`revision:${index}:1`);
    await db.insert(transcriptRevisions).values({
      id: canonicalRevisionId,
      conversationId,
      revision: 1,
      revisionType: 'CANONICAL',
      reason: 'Normalised from the provider transcript',
      createdAt: endedAt,
    });

    const redactedRevisionId = stableUuid(`revision:${index}:2`);
    await db.insert(transcriptRevisions).values({
      id: redactedRevisionId,
      conversationId,
      revision: 2,
      revisionType: 'REDACTED',
      sourceRevisionId: canonicalRevisionId,
      reason: 'Automatic redaction pass',
      createdAt: new Date(endedAt.getTime() + 2000),
    });

    for (const [turnIndex, turn] of script.entries()) {
      await db.insert(transcriptTurns).values({
        id: stableUuid(`turn:${index}:1:${turnIndex}`),
        revisionId: canonicalRevisionId,
        sequence: turnIndex + 1,
        speaker: turn.speaker,
        content: turn.content,
        startedAtMs: turnIndex * 9000,
        endedAtMs: turnIndex * 9000 + 7000,
        providerTurnId: `turn_${index}_${turnIndex}`,
        classification: 'CONFIDENTIAL',
        quality: { confidence: 0.9 + random() * 0.09 },
      });

      const { content: redactedContent } = redact(turn.content);
      await db.insert(transcriptTurns).values({
        id: stableUuid(`turn:${index}:2:${turnIndex}`),
        revisionId: redactedRevisionId,
        sequence: turnIndex + 1,
        speaker: turn.speaker,
        content: redactedContent,
        startedAtMs: turnIndex * 9000,
        endedAtMs: turnIndex * 9000 + 7000,
        providerTurnId: `turn_${index}_${turnIndex}`,
        classification: 'INTERNAL',
        quality: { confidence: 0.9 + random() * 0.09 },
      });
    }

    const complete = processingState === 'COMPLETED';

    if (complete || processingState === 'PARTIAL') {
      const summaryBody = {
        purpose: `Caller asked about ${intent.replaceAll('_', ' ')} at the ${park} park.`,
        caller_requests: [`Information about ${intent.replaceAll('_', ' ')}`],
        unresolved_items: intent === 'complaint' || intent === 'refund_request' ? ['Awaiting team response'] : [],
        commitments: intent === 'booking_enquiry' ? ['Callback within one working day'] : [],
        evidence_ids: [`ev_${sha256(`${conversationId}:transcript`).slice(0, 24)}`],
      };
      await db.insert(callSummaries).values({
        conversationId,
        transcriptRevisionId: redactedRevisionId,
        revision: 1,
        summary: summaryBody,
        provider: 'SIMULATOR',
        model: 'simulator-structured-v1',
        modelVersion: '1',
        promptVersion: 'call-summary-v1',
        schemaVersion: 'call-summary-v1',
        evidenceCoverage: (0.82 + random() * 0.17).toFixed(4),
        createdAt: new Date(endedAt.getTime() + 12_000),
      });

      const classificationId = stableUuid(`classification:${index}`);
      await db.insert(callClassifications).values({
        id: classificationId,
        conversationId,
        transcriptRevisionId: redactedRevisionId,
        revision: 1,
        primaryIntent: intent,
        secondaryIntents: random() < 0.3 ? [pick(INTENTS)] : [],
        taxonomyVersion: 'call-intent-v1',
        provider: 'SIMULATOR',
        model: 'simulator-structured-v1',
        promptVersion: 'intent-classification-v1',
        schemaVersion: 'intent-classification-v1',
        confidence: (0.71 + random() * 0.28).toFixed(4),
        evidenceIds: [`ev_${sha256(`${conversationId}:transcript`).slice(0, 24)}`],
        createdAt: new Date(endedAt.getTime() + 14_000),
      });

      if (random() < 0.55) {
        await db.insert(callEntities).values({
          classificationId,
          entityType: pick(['PARK', 'DATE', 'TICKET_TYPE', 'ATTRACTION']),
          value: pick([park, 'Saturday', 'family ticket', 'water area']),
          confidence: (0.6 + random() * 0.39).toFixed(4),
          evidenceIds: [`ev_${sha256(`${conversationId}:transcript`).slice(0, 24)}`],
        });
      }
    }

    /* deterministic outcome */
    const outcome = complete
      ? intent === 'refund_request'
        ? 'TRANSFER_COMPLETED'
        : intent === 'complaint'
          ? 'STAFF_TASK_CREATED'
          : intent === 'booking_enquiry'
            ? 'CALLBACK_REQUESTED'
            : intent === 'group_booking'
              ? 'OFFICIAL_LINK_SENT'
              : intent === 'technical_issue'
                ? 'STAFF_TASK_CREATED'
                : random() < 0.08
                  ? 'UNRESOLVED_KNOWLEDGE_GAP'
                  : 'RESOLVED_BY_AGENT'
      : processingState === 'FAILED_FINAL'
        ? 'TECHNICAL_FAILURE'
        : 'CUSTOMER_DISCONNECTED';

    await db.insert(callOutcomes).values({
      conversationId,
      outcome: outcome as 'RESOLVED_BY_AGENT',
      evidenceIds: [`ev_${sha256(`${conversationId}:outcome`).slice(0, 24)}`],
      policyVersion: 'outcome-policy-v1',
      createdAt: new Date(endedAt.getTime() + 16_000),
    });

    conversationMeta.push({
      id: conversationId,
      intent,
      park,
      language,
      startedAt,
      outcome,
      durationSeconds,
      processingState,
    });

    /* tool invocations */
    if (complete && random() < 0.6) {
      await db.insert(toolInvocations).values({
        conversationId,
        registryKey: pick(['lookup_opening_hours', 'lookup_ticket_pricing', 'create_callback_request']),
        registryVersion: 1,
        providerRequestId: `tool_req_${index}_${between(1000, 9999)}`,
        request: { park, language },
        resultStatus: random() < 0.95 ? 'SUCCESS' : 'FAILED',
        result: { answered: true },
        verificationState: 'NOT_REQUIRED',
        requestedAt: new Date(startedAt.getTime() + 20_000),
        completedAt: new Date(startedAt.getTime() + 20_800),
      });
    }

    /* customer link */
    if (random() < 0.35) {
      await db.insert(customerLinks).values({
        conversationId,
        externalCustomerId: `cust_${between(10_000, 99_999)}`,
        method: pick(['PHONE_MATCH', 'BOOKING_REFERENCE', 'MANUAL']),
        verified: random() < 0.6,
        confidence: (0.5 + random() * 0.5).toFixed(4),
      });
    }

    /* operations records driven by the outcome */
    if (outcome === 'TRANSFER_COMPLETED' || intent === 'refund_request') {
      const failed = random() < 0.25;
      await db.insert(handoffs).values({
        conversationId,
        routeKey: intent === 'refund_request' ? 'payments' : 'guest_relations',
        status: failed ? 'FAILED_NO_ANSWER' : 'COMPLETED',
        approvedContext: { intent, park, language },
        requestedAt: new Date(startedAt.getTime() + 40_000),
        completedAt: failed ? null : new Date(startedAt.getTime() + 62_000),
        providerEvidenceId: `handoff_evidence_${index}`,
      });
    }

    if (outcome === 'CALLBACK_REQUESTED' || (intent === 'booking_enquiry' && random() < 0.8)) {
      const overdue = dayOffset > 2 && random() < 0.35;
      await db.insert(callbackRequests).values({
        conversationId,
        idempotencyKey: `callback_${conversationId}`,
        ownerId: random() < 0.6 ? personId('elena.rocha') : null,
        priority: pick(['LOW', 'NORMAL', 'HIGH']),
        reason: 'Caller requested a booking change that the assistant cannot perform',
        status: overdue ? 'OPEN' : pick(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'] as const),
        dueAt: new Date(startedAt.getTime() + 24 * 3_600_000),
        completedAt: null,
        createdAt: new Date(endedAt.getTime() + 30_000),
      });
    }

    if (outcome === 'STAFF_TASK_CREATED') {
      await db.insert(staffTasks).values({
        conversationId,
        idempotencyKey: `task_${conversationId}`,
        ownerId: random() < 0.5 ? personId('elena.rocha') : null,
        priority: intent === 'complaint' ? 'HIGH' : 'NORMAL',
        reason:
          intent === 'complaint'
            ? 'Complaint requires guest relations review'
            : 'Technical issue reported by caller',
        status: pick(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'] as const),
        dueAt: new Date(startedAt.getTime() + 48 * 3_600_000),
        createdAt: new Date(endedAt.getTime() + 30_000),
      });
    }

    if (outcome === 'OFFICIAL_LINK_SENT') {
      const status = pickWeighted([
        ['DELIVERED', 80],
        ['SENT', 12],
        ['FAILED', 8],
      ] as const);
      await db.insert(messageDeliveries).values({
        conversationId,
        channel: pick(['WHATSAPP', 'SMS', 'EMAIL']),
        templateKey: 'group_enquiry_link',
        idempotencyKey: `message_${conversationId}`,
        providerMessageId: `msg_${index}`,
        status,
        cost: (0.01 + random() * 0.04).toFixed(6),
        sentAt: new Date(endedAt.getTime() + 45_000),
        deliveredAt: status === 'DELIVERED' ? new Date(endedAt.getTime() + 52_000) : null,
      });
    }

    /* quality review on a sample */
    if (complete && random() < 0.12) {
      await db.insert(qualityEvaluations).values({
        conversationId,
        rubricVersion: 'qa-rubric-v1',
        scores: {
          accuracy: between(3, 5),
          tone: between(3, 5),
          compliance: between(4, 5),
          resolution: between(2, 5),
        },
        reviewerId: personId('bruno.castro'),
        evidenceIds: [`ev_${sha256(`${conversationId}:transcript`).slice(0, 24)}`],
      });
    }
  }
  summary.conversations = CONVERSATION_COUNT;

  /* ------------------------------------------------- corrections */

  // A handful of proposed and applied corrections so the correction workflow and
  // its immutable history have real subjects.
  for (let index = 0; index < 8; index += 1) {
    const conversationId = conversationIds[index * 7];
    if (!conversationId) continue;
    const targetRecordId = stableUuid(`revision:${index * 7}:2`);
    const status = index < 3 ? 'PROPOSED' : index < 6 ? 'APPROVED' : 'APPLIED';
    const correctionId = stableUuid(`correction:${index}`);
    await db.insert(corrections).values({
      id: correctionId,
      conversationId,
      targetType: 'REDACTED_TRANSCRIPT',
      targetRecordId,
      revision: 2,
      status: status as 'PROPOSED',
      reason: 'Redaction removed a word that was not personal data',
      proposedValue: { note: 'Restore the park name that was over-redacted' },
      proposedBy: personId('bruno.castro'),
      decidedBy: status === 'PROPOSED' ? null : personId('filipe.sousa'),
      decidedAt: status === 'PROPOSED' ? null : daysAgo(between(1, 8), 15, 0),
      appliedAt: status === 'APPLIED' ? daysAgo(between(1, 5), 16, 0) : null,
      createdAt: daysAgo(between(2, 12), 14, 0),
    });

    await db.insert(correctionHistory).values({
      correctionId,
      eventType: 'PROPOSED',
      toStatus: 'PROPOSED',
      actorId: personId('bruno.castro'),
      reason: 'Redaction removed a word that was not personal data',
      createdAt: daysAgo(between(2, 12), 14, 0),
    });
    if (status !== 'PROPOSED') {
      await db.insert(correctionHistory).values({
        correctionId,
        eventType: 'DECIDED',
        fromStatus: 'PROPOSED',
        toStatus: 'APPROVED',
        actorId: personId('filipe.sousa'),
        reason: 'Reviewed against the canonical revision',
        createdAt: daysAgo(between(1, 8), 15, 0),
      });
    }
  }
  summary.corrections = 8;

  /* ------------------------------------------------ knowledge gaps */

  const gapSeed = [
    ['Do you have electric vehicle charging?', 'en', null, 34],
    ['Is the lantern parade cancelled in rain?', 'en', 'sintra', 27],
    ['Can I bring my own food into the park?', 'en', null, 22],
    ['Qual é o preço do bilhete para bebés?', 'pt', 'porto', 19],
    ['Do annual passes include parking?', 'en', null, 16],
    ['Are lockers available near the water area?', 'en', 'lisboa', 11],
    ['¿Hay descuento para familias numerosas?', 'es', null, 9],
    ['What time does the last shuttle leave?', 'en', 'sintra', 7],
  ] as const;

  for (const [index, [title, language, park, frequency]] of gapSeed.entries()) {
    await db.insert(knowledgeGaps).values({
      title,
      language,
      park,
      frequency,
      evidenceIds: conversationIds.slice(index * 3, index * 3 + 3),
      status: index < 5 ? 'OPEN' : index < 7 ? 'ASSIGNED' : 'IN_PROGRESS',
      ownerId: index < 5 ? null : personId('carla.dias'),
      createdAt: daysAgo(between(5, 40), 9, 0),
    });
  }
  summary.knowledgeGaps = gapSeed.length;

  /* ------------------------------------------------ aggregate facts */

  const factRows: Array<typeof aggregateFacts.$inferInsert> = [];
  const byDay = new Map<string, typeof conversationMeta>();
  for (const meta of conversationMeta) {
    const key = new Date(
      meta.startedAt.getFullYear(),
      meta.startedAt.getMonth(),
      meta.startedAt.getDate(),
    ).toISOString();
    const bucket = byDay.get(key) ?? [];
    bucket.push(meta);
    byDay.set(key, bucket);
  }

  for (const [dayKey, entries] of byDay) {
    const date = new Date(dayKey);
    const push = (dimensionKey: string, dimensionValue: string, metric: string, count: number, sum = 0) => {
      factRows.push({
        date,
        dimensionKey,
        dimensionValue,
        metric,
        count,
        sum: sum.toFixed(4),
      });
    };

    push('total', 'all', 'calls_received', entries.length);
    push(
      'total',
      'all',
      'calls_completed',
      entries.filter((entry) => entry.processingState === 'COMPLETED').length,
    );
    push(
      'total',
      'all',
      'call_duration_seconds',
      entries.length,
      entries.reduce((total, entry) => total + entry.durationSeconds, 0),
    );

    for (const park of PARKS) {
      const parkEntries = entries.filter((entry) => entry.park === park);
      if (parkEntries.length > 0) push('park', park, 'calls_received', parkEntries.length);
    }
    for (const language of LANGUAGES) {
      const languageEntries = entries.filter((entry) => entry.language === language);
      if (languageEntries.length > 0) push('language', language, 'calls_received', languageEntries.length);
    }
    for (const intent of INTENTS) {
      const intentEntries = entries.filter((entry) => entry.intent === intent);
      if (intentEntries.length > 0) push('intent', intent, 'calls_received', intentEntries.length);
    }
    const outcomes = new Set(entries.map((entry) => entry.outcome));
    for (const outcome of outcomes) {
      push('outcome', outcome, 'calls_received', entries.filter((entry) => entry.outcome === outcome).length);
    }
  }
  // Chunked to stay well inside the parameter limit for a single statement.
  for (let offset = 0; offset < factRows.length; offset += 200) {
    await db.insert(aggregateFacts).values(factRows.slice(offset, offset + 200)).onConflictDoNothing();
  }
  summary.aggregateFacts = factRows.length;

  /* -------------------------------------------------------- trends */

  const trendSeed = [
    ['INTENT_GROWTH', { intent: 'group_booking' }, 34.2, 0.82],
    ['INTENT_GROWTH', { intent: 'accessibility_support' }, 18.6, 0.76],
    ['INTENT_DECLINE', { intent: 'opening_hours' }, -12.4, 0.71],
    ['CONTAINMENT', { dimension: 'all' }, 78.3, 0.9],
    ['REPEAT_CONTACT', { dimension: 'all' }, 6.8, 0.64],
  ] as const;
  for (const [trendType, dimensions, metric, confidence] of trendSeed) {
    await db.insert(trends).values({
      trendType,
      periodStart: daysAgo(28, 0, 0),
      periodEnd: daysAgo(0, 0, 0),
      dimensions,
      metric: metric.toFixed(4),
      confidence: confidence.toFixed(4),
      evidence: { method: 'synthetic-aggregate-comparison', windowDays: 28 },
    });
  }
  summary.trends = trendSeed.length;

  /* ------------------------------------------------------- reports */

  const reportSeed = [
    ['weekly-operational', '0 7 * * MON', 'INTERNAL'],
    ['monthly-strategic', '0 7 1 * *', 'CONFIDENTIAL'],
    ['sensitive-case-process', '0 8 * * MON', 'RESTRICTED'],
    ['content-improvement-backlog', '0 9 * * WED', 'INTERNAL'],
    ['agent-release-quality', '0 9 * * FRI', 'INTERNAL'],
  ] as const;

  for (const [index, [key, schedule, classification]] of reportSeed.entries()) {
    const definitionId = stableUuid(`report:${key}`);
    await db
      .insert(reportDefinitions)
      .values({
        id: definitionId,
        key,
        schedule,
        classification: classification as 'INTERNAL',
        configuration: {
          title: key.replaceAll('-', ' '),
          recipients: ['operations@example.invalid'],
          format: 'PDF',
          filters: { parks: PARKS, languages: LANGUAGES },
          masking: classification === 'RESTRICTED' ? 'FULL' : 'STANDARD',
        },
        active: index < 4,
      })
      .onConflictDoNothing();

    for (let runIndex = 0; runIndex < 4; runIndex += 1) {
      const failed = index === 2 && runIndex === 0;
      await db.insert(reportRuns).values({
        definitionId,
        status: failed ? 'FAILED' : 'COMPLETED',
        periodStart: daysAgo(7 * (runIndex + 1), 0, 0),
        periodEnd: daysAgo(7 * runIndex, 0, 0),
        lineage: {
          aggregateFactRows: between(120, 900),
          conversationCount: between(30, 180),
          generatedFrom: 'aggregate_facts',
        },
        artifactObjectKey: failed ? null : `qp-assets/reports/${key}-${runIndex}.pdf`,
        checksum: failed ? null : sha256(`${key}:${runIndex}`),
        createdAt: daysAgo(7 * runIndex, 7, 5),
      });
    }
  }
  summary.reports = reportSeed.length;

  /* -------------------------------------------- retention and flags */

  await db
    .insert(retentionPolicies)
    .values([
      { environment: 'development', dataType: 'RAW_PROVIDER_EVIDENCE', classification: 'RESTRICTED', retentionDays: 30, active: true },
      { environment: 'development', dataType: 'CANONICAL_TRANSCRIPT', classification: 'CONFIDENTIAL', retentionDays: 365, active: true },
      { environment: 'development', dataType: 'REDACTED_TRANSCRIPT', classification: 'INTERNAL', retentionDays: 730, active: true },
      { environment: 'development', dataType: 'AUDIT_EVENTS', classification: 'INTERNAL', retentionDays: 2555, active: true },
      { environment: 'production', dataType: 'RAW_PROVIDER_EVIDENCE', classification: 'RESTRICTED', retentionDays: 30, active: false },
    ])
    .onConflictDoNothing();

  await db
    .insert(featureFlags)
    .values([
      { key: 'AUDIO_INGESTION_ENABLED', environment: 'development', enabled: false, configuration: { reason: 'Transcript-only launch (ADR-0005)' } },
      { key: 'CUSTOM_VOICE_ENABLED', environment: 'development', enabled: false, configuration: { reason: 'Requires separate consent approval' } },
      { key: 'BOOKING_WRITES_ENABLED', environment: 'development', enabled: false, configuration: { reason: 'No capacity-affecting action by default' } },
      { key: 'GROUP_ENQUIRY_FLOW', environment: 'development', enabled: true, configuration: { minimumGroupSize: 20 } },
      { key: 'SEASONAL_VARIATIONS', environment: 'development', enabled: false, configuration: { pendingVersion: 5 } },
    ])
    .onConflictDoNothing();

  /* --------------------------------------------------------- audit */

  // Matches the hash-chain construction in AuditService so the seeded chain
  // verifies alongside events appended by the running application.
  const auditSeed = [
    ['USER', 'ana.ferreira', 'AGENT_VERSION_APPROVED', 'AgentConfigVersion', 3, 'RELEASE_MANAGEMENT'],
    ['USER', 'ana.ferreira', 'AGENT_VERSION_PUBLISHED', 'AgentConfigVersion', 3, 'RELEASE_MANAGEMENT'],
    ['SYSTEM', null, 'PROVIDER_READBACK_COMPLETED', 'AgentDeployment', 3, 'RELEASE_MANAGEMENT'],
    ['SYSTEM', null, 'DRIFT_DETECTED', 'AgentDeployment', 3, 'RELEASE_MANAGEMENT'],
    ['USER', 'diogo.melo', 'KNOWLEDGE_VERSION_APPROVED', 'KnowledgeVersion', 1, 'RELEASE_MANAGEMENT'],
    ['USER', 'carla.dias', 'KNOWLEDGE_VERSION_CREATED', 'KnowledgeVersion', 2, 'RELEASE_MANAGEMENT'],
    ['USER', 'bruno.castro', 'TEST_RUN_STARTED', 'TestRun', 1, 'RELEASE_MANAGEMENT'],
    ['SYSTEM', null, 'TEST_RUN_COMPLETED', 'TestRun', 1, 'RELEASE_MANAGEMENT'],
    ['USER', 'filipe.sousa', 'CORRECTION_APPROVED', 'Correction', 1, 'QUALITY_REVIEW'],
    ['USER', 'elena.rocha', 'CALLBACK_ASSIGNED', 'CallbackRequest', 1, 'OPERATIONS'],
    ['USER', 'ana.ferreira', 'AI_PROVIDER_CONNECTED', 'AiProviderConnection', 1, 'RELEASE_MANAGEMENT'],
    ['USER', 'diogo.melo', 'AI_MODEL_APPROVED', 'AiModel', 1, 'RELEASE_MANAGEMENT'],
    ['USER', 'filipe.sousa', 'RETENTION_POLICY_VIEWED', 'RetentionPolicy', 1, 'PRIVACY_AUDIT'],
    ['SYSTEM', null, 'READINESS_EVALUATED', 'ReadinessEvaluation', 1, 'RELEASE_MANAGEMENT'],
  ] as const;

  const [latest] = await db
    .select({ eventHash: auditEvents.eventHash })
    .from(auditEvents)
    .orderBy(desc(auditEvents.sequence))
    .limit(1);
  let previousHash: string | null = latest?.eventHash ?? null;

  for (const [index, [actorType, actorKey, action, aggregateType, aggregateSuffix, purpose]] of auditSeed.entries()) {
    const eventId = stableUuid(`audit:${index}`);
    const occurredAt = daysAgo(auditSeed.length - index, 11, index);
    const actorId = actorKey ? personId(actorKey) : null;
    const aggregateId = stableUuid(`${aggregateType}:${aggregateSuffix}`);
    const payload = { requestId: null, result: 'SUCCESS', synthetic: true };
    const eventHash = sha256({
      eventId,
      occurredAt: occurredAt.toISOString(),
      actorType,
      actorId,
      action,
      aggregateType,
      aggregateId,
      purpose,
      payload,
      previousHash,
    });
    await db.insert(auditEvents).values({
      eventId,
      occurredAt,
      actorType,
      actorId,
      action,
      aggregateType,
      aggregateId,
      purpose,
      classification: 'INTERNAL',
      payload,
      previousHash,
      eventHash,
    });
    previousHash = eventHash;
  }
  summary.auditEvents = auditSeed.length;

  return { created: true, summary };
}
