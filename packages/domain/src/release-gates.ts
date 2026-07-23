import type { ProviderCapabilityState, ReadinessState, SyncState } from './states.js';

export interface ReleaseDependency {
  id: string;
  kind: 'AGENT' | 'KNOWLEDGE' | 'VOICE' | 'TOOL' | 'TRANSFER' | 'TEST' | 'LANGUAGE';
  approved: boolean;
  active: boolean;
  synthetic: boolean;
  expired: boolean;
  syncState: SyncState;
}

export interface ReleaseGateInput {
  environment: 'development' | 'staging' | 'production';
  capabilities: Record<string, ProviderCapabilityState>;
  requiredCapabilities: string[];
  dependencies: ReleaseDependency[];
  criticalTestsPassed: boolean;
  approvalsComplete: boolean;
  privacyApproved: boolean;
  retentionApproved: boolean;
  disclosureApproved: boolean;
  developmentIdentity: boolean;
  fakeAdapters: string[];
  securityHighOrCriticalFindings: number;
}

export interface ReleaseGateResult {
  allowed: boolean;
  readiness: ReadinessState;
  blockers: string[];
}

export function evaluateReleaseGate(input: ReleaseGateInput): ReleaseGateResult {
  const blockers: string[] = [];

  for (const capability of input.requiredCapabilities) {
    if (input.capabilities[capability] !== 'SUPPORTED') {
      blockers.push(
        `Required provider capability ${capability} is ${input.capabilities[capability] ?? 'NOT_CONFIGURED'}`,
      );
    }
  }
  for (const dependency of input.dependencies) {
    if (!dependency.approved) blockers.push(`${dependency.kind} ${dependency.id} is unapproved`);
    if (!dependency.active) blockers.push(`${dependency.kind} ${dependency.id} is inactive`);
    if (dependency.expired) blockers.push(`${dependency.kind} ${dependency.id} is expired`);
    if (dependency.syncState !== 'IN_SYNC') {
      blockers.push(`${dependency.kind} ${dependency.id} is ${dependency.syncState}`);
    }
    if (input.environment === 'production' && dependency.synthetic) {
      blockers.push(`${dependency.kind} ${dependency.id} is synthetic`);
    }
  }
  if (!input.criticalTestsPassed) blockers.push('Mandatory critical tests have not passed');
  if (!input.approvalsComplete) blockers.push('Required approvals are incomplete');
  if (input.securityHighOrCriticalFindings > 0)
    blockers.push('High or critical security findings remain');

  if (input.environment === 'production') {
    if (!input.privacyApproved) blockers.push('Provider privacy posture is not approved');
    if (!input.retentionApproved) blockers.push('Retention policy is not approved');
    if (!input.disclosureApproved) blockers.push('Caller disclosure is not approved');
    if (input.developmentIdentity) blockers.push('Development identity provider is active');
    if (input.fakeAdapters.length > 0)
      blockers.push(`Fake adapters active: ${input.fakeAdapters.join(', ')}`);
  }

  return {
    allowed: blockers.length === 0,
    readiness: blockers.length === 0 ? 'PRODUCTION_DEPLOYMENT_READY' : 'EXTERNALLY_BLOCKED',
    blockers,
  };
}
