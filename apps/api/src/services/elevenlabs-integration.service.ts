import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  encryptedProviderCredentials,
  providerCredentialReferences,
  providerIntegrations,
  providerWorkspaces,
  readinessEvaluations,
} from '@quantum-parks/db';
import { HttpElevenLabsAdapter } from '@quantum-parks/elevenlabs';
import type { Principal } from '@quantum-parks/auth';
import { DatabaseService } from './database.service.js';
import { AuditService } from './audit.service.js';
import { ProviderCredentialVaultService } from './provider-credential-vault.service.js';

export type IntegrationEnvironment = 'SANDBOX' | 'PRODUCTION';
export type IntegrationConnectionStatus =
  | 'NOT_CONFIGURED'
  | 'VALIDATING'
  | 'CONNECTED'
  | 'DEGRADED'
  | 'INVALID_CREDENTIALS'
  | 'DISCONNECTED'
  | 'ERROR';

type TestInput = {
  apiKey: string;
  connectionLabel: string;
  environment: IntegrationEnvironment;
};
type ConnectInput = TestInput & {
  validationProof: string;
  defaultAgentId?: string | undefined;
  defaultVoiceId?: string | undefined;
};

@Injectable()
export class ElevenLabsIntegrationService {
  private readonly validationAttempts = new Map<string, number[]>();

  constructor(
    private readonly database: DatabaseService,
    private readonly vault: ProviderCredentialVaultService,
    private readonly audit: AuditService,
  ) {}

  private baseUrl(environment: IntegrationEnvironment): string {
    if (environment === 'PRODUCTION') return 'https://api.elevenlabs.io';
    if ((process.env.QP_ENVIRONMENT ?? 'development') === 'production')
      return 'https://api.elevenlabs.io';
    return process.env.ELEVENLABS_SANDBOX_BASE_URL ?? 'http://localhost:4100';
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
    if (code === 'EL_AUTH' || code === 'EL_FORBIDDEN') return 'INVALID_CREDENTIALS';
    if (code === 'EL_TIMEOUT' || code === 'EL_NETWORK' || code === 'EL_UNAVAILABLE')
      return 'DEGRADED';
    return 'ERROR';
  }

  async testConnection(input: TestInput, principal: Principal) {
    this.enforceValidationLimit(principal.subject);
    const provider = this.adapter(input.apiKey, input.environment);
    const workspace = await provider.getWorkspace();
    if (workspace.status !== 'SUCCESS') {
      const status = this.providerFailureStatus(workspace.error.code);
      await this.auditAction(principal, 'ELEVENLABS_CONNECTION_TESTED', 'ephemeral', status, {
        environment: input.environment,
        errorCode: workspace.error.code,
      });
      return {
        status,
        verified: false,
        message:
          status === 'INVALID_CREDENTIALS'
            ? 'The credential was rejected or does not have the required scope.'
            : workspace.error.safeMessage,
      };
    }
    const [agents, voices, capabilities] = await Promise.all([
      provider.listAgents(),
      provider.listVoices(),
      provider.getCapabilities(),
    ]);
    const failed = [agents, voices].find((result) => result.status !== 'SUCCESS');
    if (failed) {
      const status = this.providerFailureStatus(failed.error.code);
      await this.auditAction(
        principal,
        'ELEVENLABS_CONNECTION_TESTED',
        workspace.data.workspaceId,
        status,
        {
          environment: input.environment,
          errorCode: failed.error.code,
        },
      );
      return { status, verified: false, message: failed.error.safeMessage };
    }
    const agentCount = agents.status === 'SUCCESS' ? agents.data.length : 0;
    const voiceCount = voices.status === 'SUCCESS' ? voices.data.length : 0;
    await this.auditAction(
      principal,
      'ELEVENLABS_CONNECTION_TESTED',
      workspace.data.workspaceId,
      'CONNECTED',
      { environment: input.environment, agentCount, voiceCount },
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
        id: workspace.data.workspaceId,
        subscription: workspace.data.subscription ?? null,
      },
      counts: { agents: agentCount, voices: voiceCount },
      capabilities,
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
          region: input.environment === 'PRODUCTION' ? 'global' : 'simulator',
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
    return { ...(await this.status()), saved: true };
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
    return {
      provider: 'ELEVENLABS' as const,
      status: integration.status,
      integrationId: integration.id,
      connectionLabel: integration.connectionLabel,
      environment: integration.environment,
      workspace: workspace ? { id: workspace.providerWorkspaceId, subscription: null } : null,
      credentialReference: this.safeCredentialReference(reference?.id),
      defaultAgentId: integration.defaultAgentId,
      defaultVoiceId: integration.defaultVoiceId,
      counts: { agents: integration.agentCount, voices: integration.voiceCount },
      capabilities: integration.capabilitySnapshot,
      lastVerifiedAt: integration.lastVerifiedAt?.toISOString() ?? null,
      lastErrorCode: integration.lastErrorCode,
      productionRoutingEnabled: readiness?.status === 'PRODUCTION_ACTIVE',
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
    input: {
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
    await this.database.db
      .update(providerIntegrations)
      .set({ ...input, updatedBy: principal.subject, updatedAt: new Date() })
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
    if (!resolved) return { status: 'NOT_CONFIGURED' as const, verified: false };
    const test = await this.testConnection(
      {
        apiKey: resolved.apiKey,
        connectionLabel: resolved.integration.connectionLabel,
        environment: resolved.integration.environment,
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
        agentCount: test.counts?.agents ?? resolved.integration.agentCount,
        voiceCount: test.counts?.voices ?? resolved.integration.voiceCount,
        capabilitySnapshot: test.capabilities ?? resolved.integration.capabilitySnapshot,
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
    return { ...(await this.status()), verified: test.verified };
  }

  async rotate(input: TestInput & { validationProof: string }, principal: Principal) {
    const current = await this.database.db.query.providerIntegrations.findFirst({
      where: eq(providerIntegrations.provider, 'ELEVENLABS'),
    });
    if (!current) return { status: 'NOT_CONFIGURED' as const, rotated: false };
    const connected = await this.connect(
      {
        ...input,
        validationProof: input.validationProof,
        ...(current.defaultAgentId ? { defaultAgentId: current.defaultAgentId } : {}),
        ...(current.defaultVoiceId ? { defaultVoiceId: current.defaultVoiceId } : {}),
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
