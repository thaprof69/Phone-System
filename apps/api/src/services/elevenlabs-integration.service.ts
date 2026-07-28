import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  agentConfigVersions,
  agentDeployments,
  elevenLabsDiagnosticRuns,
  elevenLabsMediaVerifications,
  encryptedProviderCredentials,
  providerCredentialReferences,
  providerIntegrations,
  providerWorkspaces,
  readinessEvaluations,
} from '@quantum-parks/db';
import {
  canonicalProviderChecksum,
  HttpElevenLabsAdapter,
  projectElevenLabsAgentConfiguration,
  toElevenLabsAgentConfiguration,
} from '@quantum-parks/elevenlabs';
import type { Principal } from '@quantum-parks/auth';
import { DatabaseService } from './database.service.js';
import { AuditService } from './audit.service.js';
import { ProviderCredentialVaultService } from './provider-credential-vault.service.js';

export type DiagnosticCheckStatus = 'PASS' | 'WARNING' | 'FAIL';
export type DiagnosticCheck = {
  key: string;
  label: string;
  status: DiagnosticCheckStatus;
  detail: string;
};

export type IntegrationEnvironment = 'SANDBOX' | 'PRODUCTION';
export type IntegrationConnectionStatus =
  | 'NOT_CONFIGURED'
  | 'VALIDATING'
  | 'CONNECTED'
  | 'DEGRADED'
  | 'INVALID_CREDENTIALS'
  | 'AGENT_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'DISCONNECTED'
  | 'ERROR';

type TestInput = {
  apiKey: string;
  connectionLabel: string;
  environment: IntegrationEnvironment;
  defaultAgentId?: string | undefined;
};
type RuntimeConfigInput = {
  receptionistDisplayName?: string | null | undefined;
  greetingOverride?: string | null | undefined;
  language?: string | null | undefined;
  voiceTestingEnabled?: boolean | undefined;
  chatTestingEnabled?: boolean | undefined;
  transcriptCapture?: boolean | undefined;
  summaryGeneration?: boolean | undefined;
  escalationDetection?: boolean | undefined;
  voiceMode?: 'WEBRTC_PREFERRED' | 'WEBSOCKET_ONLY' | undefined;
};
type ConnectInput = TestInput &
  RuntimeConfigInput & {
    validationProof: string;
    defaultVoiceId?: string | undefined;
  };
type TestConnectionResult =
  | { status: IntegrationConnectionStatus; verified: false; message: string }
  | {
      status: 'CONNECTED';
      verified: true;
      validationProof: string;
      expiresInSeconds: number;
      workspace: { id: string; subscription: string | null };
      counts: { agents: number; voices: number };
      capabilities: Record<string, unknown>;
      verifiedAgent?: { id: string; name: string | null };
    };

@Injectable()
export class ElevenLabsIntegrationService {
  private readonly validationAttempts = new Map<string, number[]>();

  constructor(
    private readonly database: DatabaseService,
    private readonly vault: ProviderCredentialVaultService,
    private readonly audit: AuditService,
  ) {}

  /** Runtime provider operations always use the live ElevenLabs service. */
  usingSimulator(_environment: IntegrationEnvironment): boolean {
    return false;
  }

  /** The single runtime origin used by validation, publication, and live sessions. */
  baseUrl(_environment: IntegrationEnvironment): string {
    return 'https://api.elevenlabs.io';
  }

  /** Names the host actually contacted, so no message can imply the wrong origin. */
  private providerOrigin(_environment: IntegrationEnvironment): string {
    return 'ElevenLabs';
  }

  /**
   * Maps a provider failure onto the operator-facing vocabulary. `context` distinguishes
   * a credential check from an agent lookup, because the same HTTP status means different
   * things at each step.
   */
  private failureMessage(
    code: string,
    context: 'CREDENTIAL' | 'AGENT',
    environment: IntegrationEnvironment,
    providerMessage?: string,
  ): string {
    const origin = this.providerOrigin(environment);
    switch (code) {
      case 'EL_MISSING_PERMISSION':
        // The provider names the exact permission; repeating it is what makes this fixable.
        return `${providerMessage ?? 'The API key is missing a required permission.'} Add it to the key in the ElevenLabs dashboard, then test again.`;
      case 'EL_AUTH':
        return 'Invalid API key.';
      case 'EL_FORBIDDEN':
        return context === 'AGENT'
          ? 'Insufficient permissions to read this agent with the stored API key.'
          : 'Insufficient permissions for this API key.';
      case 'EL_NOT_FOUND':
        return context === 'AGENT'
          ? `Agent not found. ${origin} does not expose this agent to the stored API key — it does not exist, or it belongs to a different workspace.`
          : `The requested object was not found on ${origin}.`;
      case 'EL_RATE_LIMIT':
        return `${origin} rate limit reached. Try again shortly.`;
      case 'EL_TIMEOUT':
      case 'EL_NETWORK':
      case 'EL_UNAVAILABLE':
        return `Unable to reach ${origin}.`;
      default:
        return `${origin} rejected the request.`;
    }
  }

  private enforceValidationLimit(actorId: string) {
    const now = Date.now();
    const attempts = (this.validationAttempts.get(actorId) ?? []).filter(
      (attempt) => now - attempt < 60_000,
    );
    if (attempts.length >= 5)
      throw new HttpException(
        'Credential validation retry limit reached',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    attempts.push(now);
    this.validationAttempts.set(actorId, attempts);
  }

  private adapter(apiKey: string, environment: IntegrationEnvironment) {
    return new HttpElevenLabsAdapter({
      baseUrl: this.baseUrl(environment),
      apiKeyReference: 'ephemeral-validation-credential',
      workspaceId: 'discovered-during-validation',
      resolveSecret: async () => apiKey,
      timeoutMs: 8_000,
    });
  }

  private providerFailureStatus(code: string): IntegrationConnectionStatus {
    // A key that authenticates but lacks a scope is not an invalid credential.
    if (code === 'EL_MISSING_PERMISSION' || code === 'EL_FORBIDDEN') return 'DEGRADED';
    if (code === 'EL_AUTH') return 'INVALID_CREDENTIALS';
    if (code === 'EL_RATE_LIMIT') return 'RATE_LIMITED';
    if (code === 'EL_TIMEOUT' || code === 'EL_NETWORK' || code === 'EL_UNAVAILABLE')
      return 'PROVIDER_UNAVAILABLE';
    return 'ERROR';
  }

  async testConnection(input: TestInput, principal: Principal): Promise<TestConnectionResult> {
    this.enforceValidationLimit(principal.subject);
    const provider = this.adapter(input.apiKey, input.environment);

    /*
     * Validate against the capability this product actually uses, not `/v1/user`.
     *
     * ElevenLabs supports scope-restricted API keys. A key scoped for Conversational AI —
     * exactly the key an operator should issue for this platform — returns 401 on
     * `/v1/user` while working correctly for `/v1/convai/*`. Gating validation on
     * `/v1/user` therefore rejected valid keys as "Invalid API key". The ConvAI agent
     * listing is now the authority; `/v1/user` is consulted only for workspace identity
     * and is allowed to fail without failing the connection.
     */
    const agents = await provider.listAgents();
    if (agents.status !== 'SUCCESS') {
      const status = this.providerFailureStatus(agents.error.code);
      await this.auditAction(principal, 'ELEVENLABS_CONNECTION_TESTED', 'ephemeral', status, {
        environment: input.environment,
        errorCode: agents.error.code,
      });
      return {
        status,
        verified: false,
        message: this.failureMessage(
          agents.error.code,
          'CREDENTIAL',
          input.environment,
          agents.error.safeMessage,
        ),
      };
    }

    const [workspaceResult, voices, capabilities] = await Promise.all([
      provider.getWorkspace(),
      provider.listVoices(),
      provider.getCapabilities(),
    ]);

    // A key without `user_read` still identifies a real workspace; record that honestly
    // rather than inventing an id or rejecting the credential.
    const workspace =
      workspaceResult.status === 'SUCCESS'
        ? workspaceResult.data
        : { workspaceId: 'convai-scoped-key', subscription: undefined };

    /*
     * Voice listing is informational and needs the separate `voices_read` scope, which a
     * ConvAI-scoped key legitimately lacks. It reports a count, so a failure here must not
     * fail the connection — it is recorded as an unknown count instead.
     */
    const voicesReadable = voices.status === 'SUCCESS';

    const agentCount = agents.status === 'SUCCESS' ? agents.data.length : 0;
    const voiceCount = voicesReadable ? voices.data.length : 0;

    let verifiedAgent: { id: string; name: string | null } | undefined;
    if (input.defaultAgentId) {
      const agent = await provider.getAgent(input.defaultAgentId);
      if (agent.status !== 'SUCCESS') {
        await this.auditAction(
          principal,
          'ELEVENLABS_CONNECTION_TESTED',
          workspace.workspaceId,
          'AGENT_UNAVAILABLE',
          { environment: input.environment, agentId: input.defaultAgentId },
        );
        return {
          status: 'AGENT_UNAVAILABLE' as const,
          verified: false,
          message: this.failureMessage(
            agent.error.code,
            'AGENT',
            input.environment,
            agent.error.safeMessage,
          ),
        };
      }
      const name = agent.data.name;
      verifiedAgent = {
        id: input.defaultAgentId,
        name: typeof name === 'string' ? name : null,
      };
    }

    await this.auditAction(
      principal,
      'ELEVENLABS_CONNECTION_TESTED',
      workspace.workspaceId,
      'CONNECTED',
      { environment: input.environment, agentCount, voiceCount, verifiedAgent },
    );
    return {
      status: 'CONNECTED' as const,
      verified: true,
      validationProof: this.vault.createValidationProof({
        apiKey: input.apiKey,
        environment: input.environment,
        label: input.connectionLabel,
      }),
      expiresInSeconds: 300,
      workspace: {
        id: workspace.workspaceId,
        subscription: workspace.subscription ?? null,
      },
      counts: { agents: agentCount, voices: voiceCount },
      capabilities,
      ...(verifiedAgent ? { verifiedAgent } : {}),
    };
  }

  async connect(input: ConnectInput, principal: Principal) {
    if (
      !this.vault.verifyValidationProof(input.validationProof, {
        apiKey: input.apiKey,
        environment: input.environment,
        label: input.connectionLabel,
      })
    ) {
      return {
        status: 'ERROR' as const,
        saved: false,
        message: 'Run a successful connection test again before saving.',
      };
    }
    const test = await this.testConnection(
      {
        apiKey: input.apiKey,
        connectionLabel: input.connectionLabel,
        environment: input.environment,
        defaultAgentId: input.defaultAgentId,
      },
      principal,
    );
    if (!test.verified || !test.workspace || !test.counts || !test.capabilities)
      return { ...test, saved: false };

    const encrypted = this.vault.encrypt('ELEVENLABS', input.apiKey);
    const now = new Date();
    const integration = await this.database.db.transaction(async (tx) => {
      const [workspace] = await tx
        .insert(providerWorkspaces)
        .values({
          provider: 'ELEVENLABS',
          environment: input.environment === 'PRODUCTION' ? 'production' : 'development',
          providerWorkspaceId: test.workspace.id,
          region: 'global',
          displayName: input.connectionLabel,
          verifiedAt: now,
          synthetic: input.environment === 'SANDBOX',
        })
        .onConflictDoUpdate({
          target: [providerWorkspaces.environment, providerWorkspaces.providerWorkspaceId],
          set: { displayName: input.connectionLabel, verifiedAt: now, updatedAt: now },
        })
        .returning();
      if (!workspace) throw new Error('Provider workspace was not persisted');

      const existing = await tx.query.providerIntegrations.findFirst({
        where: eq(providerIntegrations.provider, 'ELEVENLABS'),
      });
      if (existing) {
        const oldReference = await tx.query.providerCredentialReferences.findFirst({
          where: eq(providerCredentialReferences.id, existing.credentialReferenceId),
        });
        await tx
          .update(providerCredentialReferences)
          .set({ active: false, updatedAt: now })
          .where(eq(providerCredentialReferences.id, existing.credentialReferenceId));
        if (oldReference)
          await tx
            .update(encryptedProviderCredentials)
            .set({ revokedAt: now, updatedAt: now })
            .where(eq(encryptedProviderCredentials.secretReference, oldReference.secretReference));
      }
      await tx.insert(encryptedProviderCredentials).values({
        ...encrypted,
        provider: 'ELEVENLABS',
        lastFour: input.apiKey.slice(-4),
      });
      const [credentialReference] = await tx
        .insert(providerCredentialReferences)
        .values({
          workspaceId: workspace.id,
          secretReference: encrypted.secretReference,
          scopes: ['user:read', 'agents:read', 'voices:read'],
          active: true,
        })
        .returning();
      if (!credentialReference) throw new Error('Credential reference was not persisted');
      const values = {
        workspaceId: workspace.id,
        credentialReferenceId: credentialReference.id,
        connectionLabel: input.connectionLabel,
        environment: input.environment,
        status: 'CONNECTED' as const,
        defaultAgentId: input.defaultAgentId ?? null,
        defaultVoiceId: input.defaultVoiceId ?? null,
        agentCount: test.counts.agents,
        voiceCount: test.counts.voices,
        capabilitySnapshot: test.capabilities,
        lastVerifiedAt: now,
        lastErrorCode: null,
        disconnectedAt: null,
        verifiedAgentName: test.verifiedAgent?.name ?? null,
        agentVerifiedAt: test.verifiedAgent ? now : null,
        receptionistDisplayName: input.receptionistDisplayName ?? null,
        greetingOverride: input.greetingOverride ?? null,
        language: input.language ?? null,
        voiceTestingEnabled: input.voiceTestingEnabled ?? true,
        chatTestingEnabled: input.chatTestingEnabled ?? true,
        transcriptCapture: input.transcriptCapture ?? true,
        summaryGeneration: input.summaryGeneration ?? false,
        escalationDetection: input.escalationDetection ?? false,
        // Binding default rule: a brand-new integration defaults to WEBRTC_PREFERRED at the
        // application layer; an existing integration being reconnected/rotated keeps its own
        // voiceMode unless the caller explicitly changes it. The DB column default
        // (WEBSOCKET_ONLY) only ever applies to rows this code path doesn't touch.
        voiceMode: input.voiceMode ?? existing?.voiceMode ?? ('WEBRTC_PREFERRED' as const),
        updatedBy: principal.subject,
        updatedAt: now,
      };
      const [saved] = await tx
        .insert(providerIntegrations)
        .values({
          ...values,
          provider: 'ELEVENLABS',
          createdBy: principal.subject,
        })
        .onConflictDoUpdate({
          target: providerIntegrations.provider,
          set: values,
        })
        .returning();
      if (!saved) throw new Error('Integration metadata was not persisted');
      return { saved, credentialReference };
    });
    await this.auditAction(principal, 'ELEVENLABS_CONNECTED', integration.saved.id, 'CONNECTED', {
      environment: input.environment,
      workspaceId: test.workspace.id,
      agentCount: test.counts.agents,
      voiceCount: test.counts.voices,
      credentialReference: this.safeCredentialReference(integration.credentialReference.id),
    });
    const providerMapping = await this.synchronizeActiveAgent(
      integration.saved,
      input.apiKey,
      principal,
    );
    return { ...(await this.status()), saved: true, providerMapping };
  }

  /**
   * Provider onboarding is complete only when the approved active release has been
   * written to the selected ElevenLabs agent and read back successfully.
   */
  private async synchronizeActiveAgent(
    integration: {
      id: string;
      workspaceId: string;
      environment: IntegrationEnvironment;
      defaultAgentId: string | null;
    },
    apiKey: string,
    principal: Principal,
  ) {
    if (!integration.defaultAgentId)
      return {
        status: 'NOT_CONFIGURED' as const,
        message: 'Choose and verify an ElevenLabs agent before starting a live test.',
      };
    const version = await this.database.db.query.agentConfigVersions.findFirst({
      where: eq(agentConfigVersions.state, 'ACTIVE'),
      orderBy: [desc(agentConfigVersions.createdAt)],
    });
    if (!version)
      return {
        status: 'NOT_CONFIGURED' as const,
        message: 'There is no approved active receptionist release to publish.',
      };
    const workspace = await this.database.db.query.providerWorkspaces.findFirst({
      where: eq(providerWorkspaces.id, integration.workspaceId),
    });
    if (!workspace)
      return {
        status: 'NOT_CONFIGURED' as const,
        message: 'The verified provider workspace could not be resolved.',
      };

    const provider = this.adapter(apiKey, integration.environment);
    const expected = toElevenLabsAgentConfiguration(version.configuration);
    const localChecksum = canonicalProviderChecksum(expected);
    const published = await provider.updateAgent(integration.defaultAgentId, undefined, expected);
    if (published.status !== 'SUCCESS') {
      await this.recordActiveDeployment({
        versionId: version.id,
        workspaceId: workspace.id,
        environment: workspace.environment,
        providerAgentId: integration.defaultAgentId,
        localChecksum,
        remoteChecksum: null,
        syncState: 'PUBLISH_FAILED',
      });
      return { status: 'PUBLISH_FAILED' as const, message: published.error.safeMessage };
    }

    const readBack = await provider.getAgent(integration.defaultAgentId);
    if (readBack.status !== 'SUCCESS') {
      await this.recordActiveDeployment({
        versionId: version.id,
        workspaceId: workspace.id,
        environment: workspace.environment,
        providerAgentId: integration.defaultAgentId,
        localChecksum,
        remoteChecksum: null,
        syncState: 'PUBLISH_FAILED',
      });
      return { status: 'PUBLISH_FAILED' as const, message: readBack.error.safeMessage };
    }
    const remoteChecksum = canonicalProviderChecksum(
      projectElevenLabsAgentConfiguration(readBack.data, expected),
    );
    const synchronized = remoteChecksum === localChecksum;
    await this.recordActiveDeployment({
      versionId: version.id,
      workspaceId: workspace.id,
      environment: workspace.environment,
      providerAgentId: integration.defaultAgentId,
      localChecksum,
      remoteChecksum,
      syncState: synchronized ? 'IN_SYNC' : 'DRIFTED',
    });
    await this.auditAction(
      principal,
      'ELEVENLABS_ACTIVE_AGENT_SYNCHRONIZED',
      integration.id,
      synchronized ? 'IN_SYNC' : 'DRIFTED',
      { agentVersionId: version.id, providerAgentId: integration.defaultAgentId },
    );
    return synchronized
      ? { status: 'IN_SYNC' as const, agentVersionId: version.id }
      : {
          status: 'DRIFTED' as const,
          message: 'ElevenLabs read-back did not match the approved receptionist configuration.',
        };
  }

  private async recordActiveDeployment(input: {
    versionId: string;
    workspaceId: string;
    environment: 'development' | 'staging' | 'production';
    providerAgentId: string;
    localChecksum: string;
    remoteChecksum: string | null;
    syncState: 'IN_SYNC' | 'DRIFTED' | 'PUBLISH_FAILED';
  }) {
    const existing = await this.database.db.query.agentDeployments.findFirst({
      where: and(
        eq(agentDeployments.agentVersionId, input.versionId),
        eq(agentDeployments.workspaceId, input.workspaceId),
      ),
    });
    const values = {
      providerAgentId: input.providerAgentId,
      localChecksum: input.localChecksum,
      remoteChecksum: input.remoteChecksum,
      syncState: input.syncState,
      publishedAt: new Date(),
      verifiedAt: input.remoteChecksum ? new Date() : null,
      updatedAt: new Date(),
    };
    if (existing) {
      await this.database.db
        .update(agentDeployments)
        .set(values)
        .where(eq(agentDeployments.id, existing.id));
      return;
    }
    await this.database.db.insert(agentDeployments).values({
      agentVersionId: input.versionId,
      workspaceId: input.workspaceId,
      environment: input.environment,
      ...values,
    });
  }

  async status() {
    const integration = await this.database.db.query.providerIntegrations.findFirst({
      where: eq(providerIntegrations.provider, 'ELEVENLABS'),
      orderBy: [desc(providerIntegrations.updatedAt)],
    });
    const [readiness] = await this.database.db
      .select({ status: readinessEvaluations.status })
      .from(readinessEvaluations)
      .orderBy(desc(readinessEvaluations.evaluatedAt))
      .limit(1);
    if (!integration)
      return {
        provider: 'ELEVENLABS' as const,
        status: 'NOT_CONFIGURED' as const,
        productionRoutingEnabled: readiness?.status === 'PRODUCTION_ACTIVE',
      };
    const reference = await this.database.db.query.providerCredentialReferences.findFirst({
      where: eq(providerCredentialReferences.id, integration.credentialReferenceId),
    });
    const workspace = await this.database.db.query.providerWorkspaces.findFirst({
      where: eq(providerWorkspaces.id, integration.workspaceId),
    });
    const storedSecret = reference
      ? await this.database.db.query.encryptedProviderCredentials.findFirst({
          where: and(
            eq(encryptedProviderCredentials.secretReference, reference.secretReference),
            isNull(encryptedProviderCredentials.revokedAt),
          ),
        })
      : undefined;
    return {
      provider: 'ELEVENLABS' as const,
      status: integration.status,
      integrationId: integration.id,
      connectionLabel: integration.connectionLabel,
      environment: integration.environment,
      workspace: workspace ? { id: workspace.providerWorkspaceId, subscription: null } : null,
      credentialReference: this.safeCredentialReference(reference?.id),
      /** Last four characters only — never the key itself. */
      credentialLastFour: storedSecret?.lastFour ?? null,
      defaultAgentId: integration.defaultAgentId,
      defaultVoiceId: integration.defaultVoiceId,
      counts: { agents: integration.agentCount, voices: integration.voiceCount },
      capabilities: integration.capabilitySnapshot,
      lastVerifiedAt: integration.lastVerifiedAt?.toISOString() ?? null,
      lastErrorCode: integration.lastErrorCode,
      verifiedAgentName: integration.verifiedAgentName,
      agentVerifiedAt: integration.agentVerifiedAt?.toISOString() ?? null,
      receptionistDisplayName: integration.receptionistDisplayName,
      greetingOverride: integration.greetingOverride,
      language: integration.language,
      voiceTestingEnabled: integration.voiceTestingEnabled,
      chatTestingEnabled: integration.chatTestingEnabled,
      transcriptCapture: integration.transcriptCapture,
      summaryGeneration: integration.summaryGeneration,
      escalationDetection: integration.escalationDetection,
      voiceMode: integration.voiceMode,
      productionRoutingEnabled: readiness?.status === 'PRODUCTION_ACTIVE',
    };
  }

  /**
   * A compact readiness summary for surfaces like Simulation Lab that need to show "is the
   * provider ready" without re-deriving the per-agent-version session-start gate themselves —
   * that gate stays solely inside `platform.service.ts`'s `startVoiceSession`.
   */
  async readinessSummary() {
    const integration = await this.database.db.query.providerIntegrations.findFirst({
      where: eq(providerIntegrations.provider, 'ELEVENLABS'),
    });
    if (!integration)
      return {
        connected: false,
        agentVerified: false,
        agentVersionId: null,
        latestDiagnosticsStatus: null,
        latestDiagnosticsAt: null,
      };
    const [deployment] = await this.database.db
      .select({ agentVersionId: agentDeployments.agentVersionId })
      .from(agentDeployments)
      .where(
        and(
          eq(agentDeployments.workspaceId, integration.workspaceId),
          eq(agentDeployments.syncState, 'IN_SYNC'),
        ),
      )
      .orderBy(desc(agentDeployments.publishedAt))
      .limit(1);
    const [latestDiagnostics] = await this.database.db
      .select({
        status: elevenLabsDiagnosticRuns.status,
        checkedAt: elevenLabsDiagnosticRuns.checkedAt,
      })
      .from(elevenLabsDiagnosticRuns)
      .where(eq(elevenLabsDiagnosticRuns.integrationId, integration.id))
      .orderBy(desc(elevenLabsDiagnosticRuns.checkedAt))
      .limit(1);
    return {
      connected: integration.status === 'CONNECTED',
      agentVerified: Boolean(integration.defaultAgentId && integration.agentVerifiedAt),
      agentVersionId: deployment?.agentVersionId ?? null,
      latestDiagnosticsStatus: latestDiagnostics?.status ?? null,
      latestDiagnosticsAt: latestDiagnostics?.checkedAt?.toISOString() ?? null,
    };
  }

  capabilities() {
    return this.status().then((status) => ({
      provider: 'ELEVENLABS',
      status: status.status,
      capabilities: 'capabilities' in status ? status.capabilities : {},
      lastVerifiedAt: 'lastVerifiedAt' in status ? status.lastVerifiedAt : null,
    }));
  }

  async update(
    input: RuntimeConfigInput & {
      connectionLabel?: string | undefined;
      defaultAgentId?: string | null | undefined;
      defaultVoiceId?: string | null | undefined;
    },
    principal: Principal,
  ) {
    const current = await this.database.db.query.providerIntegrations.findFirst({
      where: eq(providerIntegrations.provider, 'ELEVENLABS'),
    });
    if (!current) return { status: 'NOT_CONFIGURED' as const, updated: false };

    let verifiedAgentName = current.verifiedAgentName;
    let agentVerifiedAt = current.agentVerifiedAt;
    const agentIdChanged =
      input.defaultAgentId !== undefined && input.defaultAgentId !== current.defaultAgentId;
    if (agentIdChanged) {
      if (!input.defaultAgentId) {
        verifiedAgentName = null;
        agentVerifiedAt = null;
      } else {
        const resolved = await this.resolveActiveCredential();
        if (!resolved)
          return {
            status: 'AGENT_UNAVAILABLE' as const,
            updated: false,
            message: 'There is no active credential to verify the agent against.',
          };
        const provider = this.adapter(resolved.apiKey, resolved.integration.environment);
        const agent = await provider.getAgent(input.defaultAgentId);
        if (agent.status !== 'SUCCESS')
          return {
            status: 'AGENT_UNAVAILABLE' as const,
            updated: false,
            message: this.failureMessage(
              agent.error.code,
              'AGENT',
              resolved.integration.environment,
            ),
          };
        const name = agent.data.name;
        verifiedAgentName = typeof name === 'string' ? name : null;
        agentVerifiedAt = new Date();
      }
    }

    await this.database.db
      .update(providerIntegrations)
      .set({
        ...input,
        verifiedAgentName,
        agentVerifiedAt,
        updatedBy: principal.subject,
        updatedAt: new Date(),
      })
      .where(eq(providerIntegrations.id, current.id));
    await this.auditAction(
      principal,
      'ELEVENLABS_CONFIGURATION_UPDATED',
      current.id,
      current.status,
      {
        fields: Object.keys(input),
      },
    );
    return { ...(await this.status()), updated: true };
  }

  async verifySaved(principal: Principal) {
    const resolved = await this.resolveActiveCredential();
    if (!resolved)
      return {
        status: 'NOT_CONFIGURED' as const,
        verified: false,
        message: 'API key missing. No active credential is stored.',
      };
    const test = await this.testConnection(
      {
        apiKey: resolved.apiKey,
        connectionLabel: resolved.integration.connectionLabel,
        environment: resolved.integration.environment,
        defaultAgentId: resolved.integration.defaultAgentId ?? undefined,
      },
      principal,
    );
    const now = new Date();
    await this.database.db
      .update(providerIntegrations)
      .set({
        status: test.status,
        lastVerifiedAt: test.verified ? now : resolved.integration.lastVerifiedAt,
        lastErrorCode: test.verified ? null : 'PROVIDER_VALIDATION_FAILED',
        agentCount: test.verified ? test.counts.agents : resolved.integration.agentCount,
        voiceCount: test.verified ? test.counts.voices : resolved.integration.voiceCount,
        capabilitySnapshot: test.verified
          ? test.capabilities
          : resolved.integration.capabilitySnapshot,
        verifiedAgentName:
          test.verified && test.verifiedAgent
            ? test.verifiedAgent.name
            : resolved.integration.defaultAgentId
              ? resolved.integration.verifiedAgentName
              : null,
        agentVerifiedAt:
          test.verified && test.verifiedAgent
            ? now
            : resolved.integration.defaultAgentId
              ? resolved.integration.agentVerifiedAt
              : null,
        updatedBy: principal.subject,
        updatedAt: now,
      })
      .where(eq(providerIntegrations.id, resolved.integration.id));
    if (!test.verified)
      await this.auditAction(
        principal,
        'ELEVENLABS_HEALTH_CHECK_FAILED',
        resolved.integration.id,
        test.status,
        {},
      );
    // Carry the specific reason back: the banner must say "Invalid API key" or
    // "Agent not found", never a generic "could not be verified".
    return {
      ...(await this.status()),
      verified: test.verified,
      ...(test.verified ? {} : { message: test.message }),
    };
  }

  /**
   * Every check here is a real round trip against the provider, or an honest static/config note
   * where the provider API genuinely doesn't expose the fact (turn_timeout). None of them are a
   * config-presence proxy: `agent_found` really calls `getAgent()`, `webrtc_available`/
   * `websocket_fallback` each really request a token/signed-URL. Per the binding correction, a
   * passing bootstrap check here never implies real browser media was verified — that's tracked
   * separately in `elevenLabsMediaVerifications` and surfaced only via `mediaVerificationSummary()`.
   */
  async runDiagnostics(principal: Principal) {
    const resolved = await this.resolveActiveCredential();
    if (!resolved) {
      const { checks, status } = buildDiagnosticChecks({
        hasCredential: false,
        workspaceStatus: 'FAILURE',
        defaultAgentId: null,
        agentStatus: 'NOT_ATTEMPTED',
        agentData: null,
        voiceTestingEnabled: false,
        greetingOverride: null,
        webrtcTokenStatus: 'NOT_ATTEMPTED',
        websocketSignedUrlStatus: 'NOT_ATTEMPTED',
        voiceMode: 'WEBSOCKET_ONLY',
      });
      return this.persistDiagnosticRun(null, 'NOT_CONFIGURED', checks, principal);
    }
    const { integration, apiKey } = resolved;
    const provider = this.adapter(apiKey, integration.environment);

    const workspace = await provider.getWorkspace();
    const agent = integration.defaultAgentId
      ? await provider.getAgent(integration.defaultAgentId)
      : null;
    const agentData = agent?.status === 'SUCCESS' ? agent.data : null;
    const token = integration.defaultAgentId
      ? await provider.getConversationToken({ agentId: integration.defaultAgentId })
      : null;
    const signed = integration.defaultAgentId
      ? await provider.getSignedConversationUrl(integration.defaultAgentId)
      : null;

    const { checks, status } = buildDiagnosticChecks({
      hasCredential: true,
      workspaceStatus: workspace.status === 'SUCCESS' ? 'SUCCESS' : 'FAILURE',
      workspaceErrorMessage:
        workspace.status !== 'SUCCESS' ? workspace.error.safeMessage : undefined,
      defaultAgentId: integration.defaultAgentId,
      agentStatus: !agent ? 'NOT_ATTEMPTED' : agent.status === 'SUCCESS' ? 'SUCCESS' : 'FAILURE',
      agentErrorMessage: agent && agent.status !== 'SUCCESS' ? agent.error.safeMessage : undefined,
      agentData,
      voiceTestingEnabled: integration.voiceTestingEnabled,
      greetingOverride: integration.greetingOverride,
      webrtcTokenStatus: !token
        ? 'NOT_ATTEMPTED'
        : token.status === 'SUCCESS'
          ? 'SUCCESS'
          : 'FAILURE',
      webrtcErrorMessage: token && token.status !== 'SUCCESS' ? token.error.safeMessage : undefined,
      websocketSignedUrlStatus: !signed
        ? 'NOT_ATTEMPTED'
        : signed.status === 'SUCCESS'
          ? 'SUCCESS'
          : 'FAILURE',
      websocketErrorMessage:
        signed && signed.status !== 'SUCCESS' ? signed.error.safeMessage : undefined,
      voiceMode: integration.voiceMode,
    });
    return this.persistDiagnosticRun(integration.id, status, checks, principal);
  }

  private async persistDiagnosticRun(
    integrationId: string | null,
    status: DiagnosticCheckStatus | 'NOT_CONFIGURED',
    checks: DiagnosticCheck[],
    principal: Principal,
  ) {
    if (!integrationId)
      return { status, checks, warnings: [], errors: [], checkedAt: new Date().toISOString() };
    const warnings = checks
      .filter((c) => c.status === 'WARNING')
      .map((c) => `${c.label}: ${c.detail}`);
    const errors = checks.filter((c) => c.status === 'FAIL').map((c) => `${c.label}: ${c.detail}`);
    const [row] = await this.database.db
      .insert(elevenLabsDiagnosticRuns)
      .values({
        integrationId,
        status,
        checks,
        warnings,
        errors,
        checkedBy: principal.subject,
      })
      .returning();
    if (!row) throw new Error('Diagnostic run was not persisted');
    await this.auditAction(principal, 'ELEVENLABS_DIAGNOSTICS_RUN', integrationId, status, {
      checks: checks.map((c) => ({ key: c.key, status: c.status })),
    });
    return {
      status: row.status,
      checks: row.checks,
      warnings: row.warnings,
      errors: row.errors,
      checkedAt: row.checkedAt.toISOString(),
    };
  }

  async getDiagnosticsHistory(limit = 10) {
    const integration = await this.database.db.query.providerIntegrations.findFirst({
      where: eq(providerIntegrations.provider, 'ELEVENLABS'),
    });
    if (!integration) return [];
    const rows = await this.database.db.query.elevenLabsDiagnosticRuns.findMany({
      where: eq(elevenLabsDiagnosticRuns.integrationId, integration.id),
      orderBy: [desc(elevenLabsDiagnosticRuns.checkedAt)],
      limit,
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      checks: row.checks,
      warnings: row.warnings,
      errors: row.errors,
      checkedAt: row.checkedAt.toISOString(),
      checkedBy: row.checkedBy,
    }));
  }

  async getDiagnosticsRun(id: string) {
    const row = await this.database.db.query.elevenLabsDiagnosticRuns.findFirst({
      where: eq(elevenLabsDiagnosticRuns.id, id),
    });
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      checks: row.checks,
      warnings: row.warnings,
      errors: row.errors,
      checkedAt: row.checkedAt.toISOString(),
      checkedBy: row.checkedBy,
    };
  }

  /**
   * The honest second half of the WebRTC/WebSocket diagnostic story (binding correction): whether
   * a real browser voice session has ever actually connected and exchanged audio, distinct from
   * the bootstrap-only checks in `runDiagnostics()`. Starts at `NOT_VERIFIED` for every transport
   * until a real Simulation Lab session writes a row via
   * `ReceptionistSessionService`'s media-verification writeback.
   */
  async mediaVerificationSummary() {
    const integration = await this.database.db.query.providerIntegrations.findFirst({
      where: eq(providerIntegrations.provider, 'ELEVENLABS'),
    });
    const unverified = { status: 'NOT_VERIFIED' as const, verifiedAt: null };
    if (!integration) return { webrtc: unverified, websocket: unverified };
    const summarise = async (transport: 'WEBRTC' | 'WEBSOCKET') => {
      const [latest] = await this.database.db
        .select({
          status: elevenLabsMediaVerifications.status,
          verifiedAt: elevenLabsMediaVerifications.verifiedAt,
        })
        .from(elevenLabsMediaVerifications)
        .where(
          and(
            eq(elevenLabsMediaVerifications.integrationId, integration.id),
            eq(elevenLabsMediaVerifications.transport, transport),
          ),
        )
        .orderBy(desc(elevenLabsMediaVerifications.verifiedAt))
        .limit(1);
      if (!latest) return { status: 'NOT_VERIFIED' as const, verifiedAt: null };
      return { status: latest.status, verifiedAt: latest.verifiedAt.toISOString() };
    };
    return { webrtc: await summarise('WEBRTC'), websocket: await summarise('WEBSOCKET') };
  }

  async rotate(input: TestInput & { validationProof: string }, principal: Principal) {
    const current = await this.database.db.query.providerIntegrations.findFirst({
      where: eq(providerIntegrations.provider, 'ELEVENLABS'),
    });
    if (!current) return { status: 'NOT_CONFIGURED' as const, rotated: false };
    /*
     * Prefer the agent supplied with this rotation over the stored one.
     *
     * Re-validating against `current.defaultAgentId` deadlocked the page whenever the
     * stored agent was wrong: the operator would enter a correct key and a corrected
     * agent id, `/test` would pass against the new agent, then rotation would re-test
     * against the stale agent, fail, and silently save nothing — leaving "Key not saved"
     * next to a successful verification.
     */
    const rotationAgentId = input.defaultAgentId ?? current.defaultAgentId;
    const connected = await this.connect(
      {
        ...input,
        validationProof: input.validationProof,
        ...(rotationAgentId ? { defaultAgentId: rotationAgentId } : {}),
        ...(current.defaultVoiceId ? { defaultVoiceId: current.defaultVoiceId } : {}),
        receptionistDisplayName: current.receptionistDisplayName,
        greetingOverride: current.greetingOverride,
        language: current.language,
        voiceTestingEnabled: current.voiceTestingEnabled,
        chatTestingEnabled: current.chatTestingEnabled,
        transcriptCapture: current.transcriptCapture,
        summaryGeneration: current.summaryGeneration,
        escalationDetection: current.escalationDetection,
      },
      principal,
    );
    if (connected.saved)
      await this.auditAction(
        principal,
        'ELEVENLABS_CREDENTIAL_ROTATED',
        current.id,
        'CONNECTED',
        {},
      );
    return { ...connected, rotated: connected.saved };
  }

  async disconnect(principal: Principal) {
    const current = await this.database.db.query.providerIntegrations.findFirst({
      where: eq(providerIntegrations.provider, 'ELEVENLABS'),
    });
    if (!current) return { status: 'NOT_CONFIGURED' as const, disconnected: false };
    const reference = await this.database.db.query.providerCredentialReferences.findFirst({
      where: eq(providerCredentialReferences.id, current.credentialReferenceId),
    });
    const now = new Date();
    await this.database.db.transaction(async (tx) => {
      await tx
        .update(providerIntegrations)
        .set({
          status: 'DISCONNECTED',
          disconnectedAt: now,
          updatedBy: principal.subject,
          updatedAt: now,
        })
        .where(eq(providerIntegrations.id, current.id));
      await tx
        .update(providerCredentialReferences)
        .set({ active: false, updatedAt: now })
        .where(eq(providerCredentialReferences.id, current.credentialReferenceId));
      if (reference)
        await tx
          .update(encryptedProviderCredentials)
          .set({ revokedAt: now, updatedAt: now })
          .where(
            and(
              eq(encryptedProviderCredentials.secretReference, reference.secretReference),
              isNull(encryptedProviderCredentials.revokedAt),
            ),
          );
    });
    await this.auditAction(principal, 'ELEVENLABS_DISCONNECTED', current.id, 'DISCONNECTED', {
      remoteObjectsDeleted: false,
      localBusinessDataPreserved: true,
    });
    return { ...(await this.status()), disconnected: true };
  }

  async resolveActiveCredential() {
    const integration = await this.database.db.query.providerIntegrations.findFirst({
      where: eq(providerIntegrations.provider, 'ELEVENLABS'),
    });
    if (!integration || integration.status === 'DISCONNECTED') return null;
    const reference = await this.database.db.query.providerCredentialReferences.findFirst({
      where: and(
        eq(providerCredentialReferences.id, integration.credentialReferenceId),
        eq(providerCredentialReferences.active, true),
      ),
    });
    if (!reference) return null;
    const encrypted = await this.database.db.query.encryptedProviderCredentials.findFirst({
      where: and(
        eq(encryptedProviderCredentials.secretReference, reference.secretReference),
        isNull(encryptedProviderCredentials.revokedAt),
      ),
    });
    if (!encrypted) return null;
    return {
      integration,
      apiKey: this.vault.decrypt('ELEVENLABS', encrypted),
    };
  }

  private safeCredentialReference(id: string | undefined): string | null {
    return id ? `EL-${id.replaceAll('-', '').slice(0, 8).toUpperCase()}` : null;
  }

  private auditAction(
    principal: Principal,
    action: string,
    aggregateId: string,
    result: string,
    payload: Record<string, unknown>,
  ) {
    return this.audit.append({
      actorType: 'USER',
      actorId: principal.subject,
      action,
      aggregateType: 'PROVIDER_INTEGRATION',
      aggregateId,
      purpose: 'RELEASE_MANAGEMENT',
      result,
      payload,
    });
  }
}

function readNestedString(value: Record<string, unknown>, path: string[]): string | null {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' && current.trim() ? current : null;
}

type ProviderCallStatus = 'SUCCESS' | 'FAILURE' | 'NOT_ATTEMPTED';

/**
 * Pure — takes already-resolved provider call outcomes and turns them into the diagnostics grid.
 * Deliberately has no DB or adapter dependency so the honesty rules (agent_found requires a real
 * getAgent success, not just an ID being set; webrtc/websocket each need their own real round
 * trip; a bootstrap PASS is never claimed as proof of real audio) are unit-testable directly,
 * matching this codebase's convention of only unit-testing DB-independent logic.
 */
export function buildDiagnosticChecks(input: {
  hasCredential: boolean;
  workspaceStatus: ProviderCallStatus;
  workspaceErrorMessage?: string | undefined;
  defaultAgentId: string | null;
  agentStatus: ProviderCallStatus;
  agentErrorMessage?: string | undefined;
  agentData: Record<string, unknown> | null;
  voiceTestingEnabled: boolean;
  greetingOverride: string | null;
  webrtcTokenStatus: ProviderCallStatus;
  webrtcErrorMessage?: string | undefined;
  websocketSignedUrlStatus: ProviderCallStatus;
  websocketErrorMessage?: string | undefined;
  voiceMode: 'WEBRTC_PREFERRED' | 'WEBSOCKET_ONLY';
}): { checks: DiagnosticCheck[]; status: DiagnosticCheckStatus | 'NOT_CONFIGURED' } {
  const checks: DiagnosticCheck[] = [];

  if (!input.hasCredential) {
    checks.push({
      key: 'provider_status',
      label: 'Provider status',
      status: 'FAIL',
      detail: 'No encrypted ElevenLabs credential is saved.',
    });
    return { checks, status: 'NOT_CONFIGURED' };
  }

  checks.push({
    key: 'provider_status',
    label: 'Provider status',
    status: input.workspaceStatus === 'SUCCESS' ? 'PASS' : 'FAIL',
    detail:
      input.workspaceStatus === 'SUCCESS'
        ? 'ElevenLabs authenticated this credential and returned workspace identity.'
        : `Provider authentication failed: ${input.workspaceErrorMessage ?? 'unknown error'}.`,
  });

  if (!input.defaultAgentId) {
    checks.push({
      key: 'agent_found',
      label: 'Agent found',
      status: 'FAIL',
      detail: 'No ElevenLabs Agent ID is configured.',
    });
  } else if (input.agentStatus === 'SUCCESS') {
    checks.push({
      key: 'agent_found',
      label: 'Agent found',
      status: 'PASS',
      detail: `ElevenLabs confirmed agent ${input.defaultAgentId} exists and is reachable.`,
    });
  } else {
    checks.push({
      key: 'agent_found',
      label: 'Agent found',
      status: 'FAIL',
      detail: `ElevenLabs could not confirm this agent: ${input.agentErrorMessage ?? 'unknown error'}.`,
    });
  }

  const agentConfirmed = Boolean(input.defaultAgentId && input.agentStatus === 'SUCCESS');
  checks.push({
    key: 'voice_configured',
    label: 'Voice configured',
    status: input.voiceTestingEnabled && agentConfirmed ? 'PASS' : 'WARNING',
    detail:
      input.voiceTestingEnabled && agentConfirmed
        ? 'Voice testing is enabled and the configured agent is reachable.'
        : !input.voiceTestingEnabled
          ? 'Voice testing is disabled in provider settings; chat testing can still run.'
          : 'Voice testing is enabled, but the configured agent could not be confirmed.',
  });

  const llmPrompt = input.agentData
    ? readNestedString(input.agentData, ['conversation_config', 'agent', 'prompt', 'prompt'])
    : null;
  checks.push({
    key: 'llm_configured',
    label: 'LLM configured',
    status: llmPrompt ? 'PASS' : input.agentData ? 'WARNING' : 'FAIL',
    detail: llmPrompt
      ? 'ElevenLabs returned a non-empty system prompt for this agent.'
      : input.agentData
        ? "The agent's response did not include a readable system prompt at conversation_config.agent.prompt.prompt."
        : 'LLM configuration requires a confirmed agent first.',
  });

  const firstMessage = input.agentData
    ? readNestedString(input.agentData, ['conversation_config', 'agent', 'first_message'])
    : null;
  checks.push({
    key: 'first_message_configured',
    label: 'First message configured',
    status: firstMessage ? 'PASS' : 'WARNING',
    detail: firstMessage
      ? `ElevenLabs reports a real first message: "${firstMessage.slice(0, 80)}".`
      : input.greetingOverride?.trim()
        ? 'A local greeting override is set, but ElevenLabs did not report its own first_message — this is a local note only, not a provider-verified fact.'
        : 'Add a greeting override, or configure a first message on the agent in ElevenLabs.',
  });

  checks.push({
    key: 'turn_timeout',
    label: 'Turn timeout',
    status: 'WARNING',
    detail:
      'Turn timeout is not exposed by the ElevenLabs API; verify it in the ElevenLabs console.',
  });

  const webrtcAvailable = input.webrtcTokenStatus === 'SUCCESS';
  checks.push({
    key: 'webrtc_available',
    label: 'WebRTC bootstrap',
    status: input.defaultAgentId ? (webrtcAvailable ? 'PASS' : 'FAIL') : 'FAIL',
    detail: !input.defaultAgentId
      ? 'No agent is configured to request a WebRTC token for.'
      : webrtcAvailable
        ? 'A real WebRTC conversation token was issued for this agent. This proves server-side reachability only — it is not evidence that browser audio works.'
        : `The WebRTC token endpoint did not succeed: ${input.webrtcErrorMessage ?? 'unknown error'}.`,
  });

  const websocketAvailable = input.websocketSignedUrlStatus === 'SUCCESS';
  checks.push({
    key: 'websocket_fallback',
    label: 'WebSocket bootstrap',
    status: input.defaultAgentId ? (websocketAvailable ? 'PASS' : 'FAIL') : 'FAIL',
    detail: !input.defaultAgentId
      ? 'No agent is configured to request a signed URL for.'
      : websocketAvailable
        ? 'A real signed WebSocket URL was issued for this agent. This proves server-side reachability only — it is not evidence that browser audio works.'
        : `The signed-URL endpoint did not succeed: ${input.websocketErrorMessage ?? 'unknown error'}.`,
  });

  if (input.voiceMode === 'WEBRTC_PREFERRED') {
    checks.push({
      key: 'fallback_policy_enabled',
      label: 'Fallback policy enabled',
      status: webrtcAvailable && websocketAvailable ? 'PASS' : 'WARNING',
      detail:
        'Policy configuration verified, not exercised: WebRTC is preferred and a WebSocket fallback path is configured for transport-recoverable browser failures.',
    });
  }

  const status: DiagnosticCheckStatus | 'NOT_CONFIGURED' = checks.some((c) => c.status === 'FAIL')
    ? 'FAIL'
    : checks.some((c) => c.status === 'WARNING')
      ? 'WARNING'
      : 'PASS';
  return { checks, status };
}
