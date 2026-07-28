/**
 * Response shapes for the control-plane API.
 *
 * Declared here rather than inline per page so that a field rename surfaces as a
 * type error in every screen that reads it, instead of silently rendering `undefined`.
 */

export type ReadinessDomains = {
  voiceRuntime: string;
  aios: string;
  platform: string;
  productionRouting: string;
};

export type Readiness = {
  state: string;
  readiness?: string;
  allowed: boolean;
  blockers: string[];
  domains: ReadinessDomains;
};

export type RecentCall = {
  id: string;
  startedAt: string | null;
  park: string | null;
  language: string | null;
  processingState: string;
  durationSeconds: number | null;
  intent: string | null;
  outcome: string | null;
  synthetic: boolean;
};

export type AttentionItem = {
  id: string;
  severity: 'critical' | 'high' | 'medium';
  title: string;
  detail: string;
  href: string;
  count: number;
};

export type MissionControl = {
  generatedAt: string;
  receptionist: {
    agentId: string | null;
    name: string;
    synthetic: boolean;
    activeVersion: { id: string; version: number; state: string } | null;
    draftVersion: { id: string; version: number; state: string } | null;
    awaitingPublication: { id: string; version: number; state: string } | null;
    languages: string[];
    syncState: string;
    publishedAt: string | null;
    verifiedAt: string | null;
    voiceAssignments: Array<{
      language: string;
      fallback: boolean;
      voiceName: string | null;
      available: boolean;
    }>;
  };
  runtime: {
    provider: string;
    status: string;
    capabilityMode: string;
    productionRoutingEnabled: boolean;
    environment: string;
  };
  today: {
    callsReceived: number;
    callsCompleted: number;
    failedProcessing: number;
    partialProcessing: number;
    transfers: number;
    transferRate: number | null;
    unresolved: number;
    knowledgeAnswerRate: number | null;
    callbacksDue: number;
    callbacksOpen: number;
    openTasks: number;
    testStatus: string;
    testFailures: number;
  };
  attention: AttentionItem[];
  recentCalls: RecentCall[];
  insight: {
    evidenceCalls: number;
    topIntents: Array<{ intent: string; count: number }>;
    knowledgeGap: { title: string; frequency: number; language: string } | null;
  } | null;
  readiness: Readiness;
};

/* --------------------------------------------------------------- agents */

export type AgentListRow = {
  id: string;
  name: string;
  purpose: string;
  synthetic: boolean;
  versionId: string | null;
  version: number | null;
  state: string | null;
  checksum: string | null;
  createdAt: string | null;
};

/* ------------------------------------------------------------ knowledge */

export type KnowledgeRow = {
  id: string;
  title: string;
  category: string;
  park: string | null;
  language: string;
  riskClass: string;
  synthetic: boolean;
  createdAt: string;
  versionId: string | null;
  version: number | null;
  state: string | null;
  effectiveAt: string | null;
  expiresAt: string | null;
};

/* --------------------------------------------------------------- voices */

export type VoiceRow = {
  id: string;
  providerVoiceId: string;
  name: string;
  metadata: Record<string, unknown>;
  available: boolean;
  approved: boolean;
  custom: boolean;
  lastVerifiedAt: string | null;
  preview: { objectKey: string; checksum: string; expiresAt: string | null } | null;
  consent: {
    permittedUse: string;
    validUntil: string;
    revokedAt: string | null;
    valid: boolean;
  } | null;
  assignments: Array<{
    agentVersionId: string;
    language: string;
    environment: string;
    fallback: boolean;
  }>;
};

/* ---------------------------------------------------------------- tests */

export type TestRow = {
  id: string;
  name: string;
  ownerId: string;
  testType: string;
  riskLevel: string;
  archived: boolean;
  createdAt: string;
  latestVersionId: string | null;
  latestVersion: number | null;
};

export type TestRunRow = {
  id: string;
  agentVersionId: string;
  providerRunId: string | null;
  status: string;
  repeatCount: number;
  passCount: number;
  failCount: number;
  startedAt: string;
  completedAt: string | null;
};

/* ----------------------------------------------------------------- calls */

export type CallRow = {
  id: string;
  providerConversationId: string;
  providerAgentId: string;
  processingState: string;
  language: string | null;
  park: string | null;
  sensitive: boolean;
  synthetic: boolean;
  receivedAt: string | null;
  intent: string | null;
  summary: string | null;
  callStatus: 'COMPLETED' | 'FAILED';
  origin: 'LIVE' | 'SIMULATION' | 'SYNTHETIC';
  mode: 'VOICE' | 'TEXT' | null;
  agentVersion: number | null;
};

/* ----------------------------------------------------------- operations */

export type WorkItem = {
  id: string;
  conversationId: string;
  ownerId: string | null;
  priority: string;
  reason: string;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type HandoffRow = {
  id: string;
  conversationId: string;
  routeKey: string;
  status: string;
  requestedAt: string;
  completedAt: string | null;
  providerEvidenceId: string | null;
};

export type DeliveryRow = {
  id: string;
  conversationId: string;
  channel: string;
  templateKey: string;
  status: string;
  cost: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
};

export type Operations = {
  transfers: HandoffRow[];
  callbacks: WorkItem[];
  tasks: WorkItem[];
  deliveries: DeliveryRow[];
};
