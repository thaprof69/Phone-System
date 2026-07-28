import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import {
  encryptedProviderCredentials,
  intelligenceExecutions,
  intelligenceModels,
  intelligenceRoutes,
  providerCredentialReferences,
  providerWorkspaces,
} from '@quantum-parks/db';
import {
  INTELLIGENCE_PROVIDERS,
  PROVIDER_LABELS,
  PROVIDER_MODEL_REGISTRY,
  createIntelligenceAdapter,
  type ErrorCategory,
  type IntelligenceProviderKey,
  type NormalisedError,
} from '@quantum-parks/aios-adapters';
import type { Principal } from '@quantum-parks/auth';
import { SummarySchema, type Summary } from '@quantum-parks/intelligence';
import { DatabaseService } from './database.service.js';
import { AuditService } from './audit.service.js';
import { ProviderCredentialVaultService } from './provider-credential-vault.service.js';
import {
  DOCUMENT_ANALYSIS_SYSTEM_PROMPT,
  FIELD_ENHANCEMENT_SYSTEM_PROMPT,
  parseDocumentAnalysis,
  parseEnhancementResponse,
  type DocumentAnalysis,
  type KnowledgeFieldLabel,
} from './knowledge-copilot.js';
import {
  INTELLIGENCE_ADVICE_SYSTEM_PROMPT,
  parseIntelligenceAdvice,
} from './intelligence-copilot-advice.js';

export { INTELLIGENCE_PROVIDERS };
export type { IntelligenceProviderKey };

export type IntelligenceCapability =
  'TRANSCRIPT_SUMMARY' | 'AI_COPILOT' | 'CONTEXTUAL_GUIDE' | 'KNOWLEDGE_HUB' | 'EMAIL_AND_ALERTS';

export const INTELLIGENCE_CAPABILITIES: readonly IntelligenceCapability[] = [
  'TRANSCRIPT_SUMMARY',
  'AI_COPILOT',
  'CONTEXTUAL_GUIDE',
  'KNOWLEDGE_HUB',
  'EMAIL_AND_ALERTS',
] as const;

export const CAPABILITY_LABELS: Record<IntelligenceCapability, string> = {
  TRANSCRIPT_SUMMARY: 'Transcript Summaries',
  AI_COPILOT: 'AI Copilot',
  CONTEXTUAL_GUIDE: 'Contextual Guide',
  KNOWLEDGE_HUB: 'Knowledge Hub',
  EMAIL_AND_ALERTS: 'Email & Alerts',
};

export const CAPABILITY_DESCRIPTIONS: Record<IntelligenceCapability, string> = {
  TRANSCRIPT_SUMMARY: 'Produces evidence-linked summaries from canonical call transcripts.',
  AI_COPILOT: 'Supports bounded operator assistance inside the cockpit.',
  CONTEXTUAL_GUIDE: 'Generates contextual guidance from approved facts and trusted events.',
  KNOWLEDGE_HUB:
    'Extracts and structures uploaded documents, URLs, and business facts into reviewable knowledge drafts.',
  EMAIL_AND_ALERTS:
    'Drafts governed operational email and alert content from approved facts and trusted events.',
};

export const CAPABILITY_CONSUMER_STATUS: Record<IntelligenceCapability, string | null> = {
  TRANSCRIPT_SUMMARY: null,
  AI_COPILOT: null,
  CONTEXTUAL_GUIDE: 'Configured route · no active consumer yet',
  KNOWLEDGE_HUB: null,
  EMAIL_AND_ALERTS: null,
};

/**
 * Capabilities with no application consumer yet. The route is real and testable, but
 * nothing in the product calls it — surfaced honestly rather than implied to be live.
 */
export const CAPABILITIES_WITHOUT_CONSUMER: readonly IntelligenceCapability[] = [
  'CONTEXTUAL_GUIDE',
] as const;

export type ModelStatus = 'NOT_TESTED' | 'CONNECTED' | 'FAILED' | 'DISABLED';
export type RouteStatus = 'READY' | 'MISSING_MODEL' | 'PROVIDER_UNAVAILABLE' | 'FALLBACK_ACTIVE';

export type ConfiguredModelView = {
  id: string;
  provider: IntelligenceProviderKey;
  providerLabel: string;
  submodel: string;
  /** A stable, non-reversible reference. The key itself never leaves the server. */
  credentialReference: string;
  enabled: boolean;
  status: ModelStatus;
  lastSuccessfulTestAt: string | null;
  lastFailureAt: string | null;
  lastFailureCategory: ErrorCategory | null;
  lastFailureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RouteView = {
  capability: IntelligenceCapability;
  capabilityLabel: string;
  capabilityDescription: string;
  consumerStatusLabel: string | null;
  primaryModelId: string | null;
  fallbackModelId: string | null;
  status: RouteStatus;
  statusDetail: string;
  hasConsumer: boolean;
  lastTestedAt: string | null;
};

export type ExecutionOutcome =
  | {
      ok: true;
      text: string;
      provider: IntelligenceProviderKey;
      submodel: string;
      usedFallback: boolean;
      executionId: string;
    }
  | { ok: false; error: NormalisedError; executionId: string | null; usedFallback: boolean };

/**
 * The summary contract is evidence-bound on purpose: every claim must cite transcript
 * turn ids, and the model is forbidden from asserting completed business actions —
 * `SummarySchema` rejects any `confirmed_actions` entry, so a model that invents one
 * fails validation rather than having its claim persisted.
 */
const TRANSCRIPT_SUMMARY_SYSTEM_PROMPT = `You summarise a customer service phone call for Quantum Parks.

Return ONLY a JSON object, with no markdown fence and no commentary, matching exactly:
{
  "purpose": { "text": string, "evidence_ids": string[] },
  "caller_requests": [{ "text": string, "evidence_ids": string[] }],
  "information_provided": [{ "text": string, "evidence_ids": string[] }],
  "confirmed_actions": [],
  "unconfirmed_requests": [{ "text": string, "evidence_ids": string[] }],
  "unresolved_items": [{ "text": string, "evidence_ids": string[] }],
  "handoff": null | { "status": "REQUESTED" | "COMPLETED" | "FAILED" | "CALLBACK_CREATED", "evidence_ids": string[] },
  "quality_flags": string[],
  "evidence_coverage": number between 0 and 1
}

Rules:
- Every evidence_ids entry must be a transcript turn id given to you in square brackets.
- Never invent an id. Never cite an id you were not given.
- "confirmed_actions" must always be an empty array. You cannot establish that a business action completed.
- Anything the caller asked for that was not verifiably completed belongs in "unconfirmed_requests".
- "evidence_coverage" is your honest estimate of how much of the transcript your claims cite.`;

/** Extract a JSON object from a model response, tolerating a markdown fence. */
export function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(withoutFence.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

class RoutingError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

export function isIntelligenceProvider(value: unknown): value is IntelligenceProviderKey {
  return typeof value === 'string' && (INTELLIGENCE_PROVIDERS as readonly string[]).includes(value);
}

export function isIntelligenceCapability(value: unknown): value is IntelligenceCapability {
  return (
    typeof value === 'string' && (INTELLIGENCE_CAPABILITIES as readonly string[]).includes(value)
  );
}

/**
 * A route is Ready only when its primary model exists, is enabled and its most recent
 * live test passed. A usable fallback keeps the capability serviceable, reported
 * distinctly as Fallback active rather than as healthy.
 */
export function deriveRouteStatus(
  primary: Pick<ConfiguredModelView, 'enabled' | 'status'> | undefined,
  fallback: Pick<ConfiguredModelView, 'enabled' | 'status'> | undefined,
): { status: RouteStatus; detail: string } {
  const usable = (model: Pick<ConfiguredModelView, 'enabled' | 'status'> | undefined) =>
    Boolean(model && model.enabled && model.status === 'CONNECTED');

  if (!primary) {
    if (usable(fallback))
      return {
        status: 'FALLBACK_ACTIVE',
        detail: 'No primary model is configured; the fallback would handle requests.',
      };
    return { status: 'MISSING_MODEL', detail: 'No primary model is configured.' };
  }
  if (usable(primary)) return { status: 'READY', detail: 'Primary model verified and available.' };
  if (usable(fallback))
    return {
      status: 'FALLBACK_ACTIVE',
      detail: !primary.enabled
        ? 'The primary model is disabled; the fallback would handle requests.'
        : 'The primary model has not passed a live test; the fallback would handle requests.',
    };
  return {
    status: 'PROVIDER_UNAVAILABLE',
    detail: !primary.enabled
      ? 'The primary model is disabled and no usable fallback is configured.'
      : 'The primary model has not passed a live test and no usable fallback is configured.',
  };
}

/**
 * The single authority for which real provider answers a given intelligence capability.
 *
 * Every intelligence feature goes through `executeCapability`; no feature constructs a
 * provider adapter itself. Credentials are decrypted here, immediately before the call,
 * and never returned to any caller.
 */
@Injectable()
export class IntelligenceRoutingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly vault: ProviderCredentialVaultService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- models

  async listModels(): Promise<ConfiguredModelView[]> {
    const rows = await this.database.db
      .select()
      .from(intelligenceModels)
      .orderBy(desc(intelligenceModels.createdAt));
    return rows.map((row) => this.toModelView(row));
  }

  private toModelView(row: typeof intelligenceModels.$inferSelect): ConfiguredModelView {
    return {
      id: row.id,
      provider: row.provider as IntelligenceProviderKey,
      providerLabel: PROVIDER_LABELS[row.provider as IntelligenceProviderKey],
      submodel: row.submodel,
      credentialReference: this.safeCredentialReference(row.credentialReferenceId),
      enabled: row.enabled,
      status: row.enabled ? (row.status as ModelStatus) : 'DISABLED',
      lastSuccessfulTestAt: row.lastSuccessfulTestAt?.toISOString() ?? null,
      lastFailureAt: row.lastFailureAt?.toISOString() ?? null,
      lastFailureCategory: (row.lastFailureCategory as ErrorCategory | null) ?? null,
      lastFailureReason: row.lastFailureReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private safeCredentialReference(id: string) {
    return `IM-${id.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  }

  /**
   * Resolve the submodels an operator may choose. The provider's live list is
   * authoritative; the server-side registry is used only when discovery is
   * unavailable. The browser never contributes model names.
   */
  async listSubmodels(
    provider: IntelligenceProviderKey,
    apiKey?: string,
    existingModelId?: string,
  ): Promise<{
    models: Array<{ id: string; displayName?: string }>;
    source: 'PROVIDER' | 'REGISTRY';
    reason?: string;
  }> {
    const key = apiKey?.trim() ? apiKey.trim() : await this.resolveKeyForModelId(existingModelId);
    if (!key)
      return {
        models: PROVIDER_MODEL_REGISTRY[provider].map((id) => ({ id })),
        source: 'REGISTRY',
        reason: 'No credential available yet, so the maintained registry is shown.',
      };

    const adapter = createIntelligenceAdapter(provider);
    const discovered = await adapter.discoverModels(key);
    if (!discovered.ok)
      return {
        models: PROVIDER_MODEL_REGISTRY[provider].map((id) => ({ id })),
        source: 'REGISTRY',
        reason: discovered.error.message,
      };
    if (discovered.models.length === 0)
      return {
        models: PROVIDER_MODEL_REGISTRY[provider].map((id) => ({ id })),
        source: 'REGISTRY',
        reason: 'The provider returned no models.',
      };
    return { models: discovered.models, source: 'PROVIDER' };
  }

  private async resolveKeyForModelId(modelId?: string) {
    if (!modelId) return undefined;
    const row = await this.database.db.query.intelligenceModels.findFirst({
      where: eq(intelligenceModels.id, modelId),
    });
    if (!row) return undefined;
    return this.decryptCredential(row.credentialReferenceId);
  }

  /** Server-side decryption, used only immediately before a provider call. */
  private async decryptCredential(credentialReferenceId: string): Promise<string | undefined> {
    const reference = await this.database.db.query.providerCredentialReferences.findFirst({
      where: eq(providerCredentialReferences.id, credentialReferenceId),
    });
    if (!reference) return undefined;
    const encrypted = await this.database.db.query.encryptedProviderCredentials.findFirst({
      where: and(
        eq(encryptedProviderCredentials.secretReference, reference.secretReference),
        isNull(encryptedProviderCredentials.revokedAt),
      ),
    });
    if (!encrypted) return undefined;
    return this.vault.decrypt(encrypted.provider, encrypted);
  }

  /**
   * Validate a submodel against the provider before it is ever persisted. Falls back to
   * the maintained registry only when the provider itself cannot be reached, so a
   * transient outage does not block configuration.
   */
  private async assertSubmodelValid(
    provider: IntelligenceProviderKey,
    submodel: string,
    apiKey: string,
  ) {
    const adapter = createIntelligenceAdapter(provider);
    const validated = await adapter.validateModel(apiKey, submodel);
    if (validated.ok) return;
    if (validated.error.category === 'MODEL_NOT_FOUND')
      throw new RoutingError(
        `"${submodel}" is not a model this ${PROVIDER_LABELS[provider]} credential can use.`,
        'INVALID_SUBMODEL',
      );
    if (
      validated.error.category === 'AUTHENTICATION' ||
      validated.error.category === 'AUTHORIZATION'
    )
      throw new RoutingError(validated.error.message, 'INVALID_CREDENTIAL');
    // Provider unreachable: accept only a model the server itself recognises.
    if (!PROVIDER_MODEL_REGISTRY[provider].includes(submodel))
      throw new RoutingError(
        `The provider could not be reached to confirm "${submodel}", and it is not in the maintained registry.`,
        'INVALID_SUBMODEL',
      );
  }

  async createModel(
    principal: Principal,
    input: { provider: IntelligenceProviderKey; submodel: string; apiKey: string },
  ): Promise<ConfiguredModelView> {
    const submodel = input.submodel.trim();
    const apiKey = input.apiKey.trim();
    if (!apiKey) throw new RoutingError('An API key is required to add a model.', 'MISSING_KEY');
    if (!submodel) throw new RoutingError('A submodel must be selected.', 'MISSING_SUBMODEL');

    const adapter = createIntelligenceAdapter(input.provider);
    const credentialOk = await adapter.validateCredential(apiKey);
    if (!credentialOk.ok) throw new RoutingError(credentialOk.error.message, 'INVALID_CREDENTIAL');
    await this.assertSubmodelValid(input.provider, submodel, apiKey);

    const existing = await this.database.db.query.intelligenceModels.findFirst({
      where: and(
        eq(intelligenceModels.provider, input.provider),
        eq(intelligenceModels.submodel, submodel),
      ),
    });
    if (existing)
      throw new RoutingError(
        `${PROVIDER_LABELS[input.provider]} · ${submodel} is already configured.`,
        'DUPLICATE_MODEL',
      );

    const encrypted = this.vault.encrypt(input.provider, apiKey);
    const now = new Date();
    const created = await this.database.db.transaction(async (tx) => {
      const [workspace] = await tx
        .insert(providerWorkspaces)
        .values({
          provider: input.provider,
          environment: 'production',
          providerWorkspaceId: `intelligence:${input.provider}`,
          region: 'global',
          displayName: PROVIDER_LABELS[input.provider],
          verifiedAt: now,
          synthetic: false,
        })
        .onConflictDoUpdate({
          target: [providerWorkspaces.environment, providerWorkspaces.providerWorkspaceId],
          set: { verifiedAt: now, updatedAt: now },
        })
        .returning();
      if (!workspace) throw new Error('Provider workspace was not persisted');

      await tx.insert(encryptedProviderCredentials).values({
        ...encrypted,
        provider: input.provider,
        lastFour: apiKey.slice(-4),
      });
      const [reference] = await tx
        .insert(providerCredentialReferences)
        .values({
          workspaceId: workspace.id,
          secretReference: encrypted.secretReference,
          scopes: ['models:read', 'completions:write'],
          active: true,
        })
        .returning();
      if (!reference) throw new Error('Credential reference was not persisted');

      const [model] = await tx
        .insert(intelligenceModels)
        .values({
          provider: input.provider,
          submodel,
          credentialReferenceId: reference.id,
          enabled: true,
          status: 'NOT_TESTED',
        })
        .returning();
      if (!model) throw new Error('Intelligence model was not persisted');
      return model;
    });

    await this.audit.append({
      actorType: 'USER',
      actorId: principal.subject,
      action: 'intelligence.model_created',
      aggregateType: 'IntelligenceModel',
      aggregateId: created.id,
      purpose: 'RELEASE_MANAGEMENT',
      payload: { provider: input.provider, submodel, secretExposed: false },
    });
    return this.toModelView(created);
  }

  async updateModel(
    principal: Principal,
    id: string,
    input: {
      submodel?: string | undefined;
      apiKey?: string | undefined;
      enabled?: boolean | undefined;
    },
  ): Promise<ConfiguredModelView> {
    const current = await this.database.db.query.intelligenceModels.findFirst({
      where: eq(intelligenceModels.id, id),
    });
    if (!current) throw new RoutingError('That model is not configured.', 'NOT_FOUND');

    const provider = current.provider as IntelligenceProviderKey;
    const newKey = input.apiKey?.trim();
    // A blank key means "keep the stored secret" — never a request to clear it.
    const effectiveKey = newKey
      ? newKey
      : await this.decryptCredential(current.credentialReferenceId);
    if (!effectiveKey)
      throw new RoutingError('No usable credential is stored for this model.', 'MISSING_KEY');

    const submodel = input.submodel?.trim() || current.submodel;
    if (newKey) {
      const adapter = createIntelligenceAdapter(provider);
      const credentialOk = await adapter.validateCredential(newKey);
      if (!credentialOk.ok)
        throw new RoutingError(credentialOk.error.message, 'INVALID_CREDENTIAL');
    }
    if (submodel !== current.submodel || newKey)
      await this.assertSubmodelValid(provider, submodel, effectiveKey);

    const now = new Date();
    const updated = await this.database.db.transaction(async (tx) => {
      if (newKey) {
        // Rotate: revoke the old secret, store the new one under the same reference.
        const reference = await tx.query.providerCredentialReferences.findFirst({
          where: eq(providerCredentialReferences.id, current.credentialReferenceId),
        });
        if (reference) {
          await tx
            .update(encryptedProviderCredentials)
            .set({ revokedAt: now, updatedAt: now })
            .where(eq(encryptedProviderCredentials.secretReference, reference.secretReference));
          const encrypted = this.vault.encrypt(provider, newKey);
          await tx.insert(encryptedProviderCredentials).values({
            ...encrypted,
            provider,
            lastFour: newKey.slice(-4),
          });
          await tx
            .update(providerCredentialReferences)
            .set({ secretReference: encrypted.secretReference, rotatedAt: now, updatedAt: now })
            .where(eq(providerCredentialReferences.id, reference.id));
        }
      }
      const [row] = await tx
        .update(intelligenceModels)
        .set({
          submodel,
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
          // Any credential or model change invalidates the previous green light.
          ...(newKey || submodel !== current.submodel
            ? { status: 'NOT_TESTED' as const, lastSuccessfulTestAt: null }
            : {}),
          updatedAt: now,
        })
        .where(eq(intelligenceModels.id, id))
        .returning();
      if (!row) throw new Error('Intelligence model was not updated');
      return row;
    });

    await this.audit.append({
      actorType: 'USER',
      actorId: principal.subject,
      action: 'intelligence.model_updated',
      aggregateType: 'IntelligenceModel',
      aggregateId: id,
      purpose: 'RELEASE_MANAGEMENT',
      payload: {
        provider,
        submodel,
        credentialReplaced: Boolean(newKey),
        enabled: updated.enabled,
        secretExposed: false,
      },
    });
    await this.refreshRouteStatuses();
    return this.toModelView(updated);
  }

  async removeModel(principal: Principal, id: string): Promise<{ affectedCapabilities: string[] }> {
    const current = await this.database.db.query.intelligenceModels.findFirst({
      where: eq(intelligenceModels.id, id),
    });
    if (!current) throw new RoutingError('That model is not configured.', 'NOT_FOUND');

    const routes = await this.database.db
      .select()
      .from(intelligenceRoutes)
      .where(
        or(eq(intelligenceRoutes.primaryModelId, id), eq(intelligenceRoutes.fallbackModelId, id)),
      );

    const now = new Date();
    await this.database.db.transaction(async (tx) => {
      // Detach rather than substitute — a removed model is never silently replaced.
      await tx
        .update(intelligenceRoutes)
        .set({ primaryModelId: null, updatedAt: now })
        .where(eq(intelligenceRoutes.primaryModelId, id));
      await tx
        .update(intelligenceRoutes)
        .set({ fallbackModelId: null, updatedAt: now })
        .where(eq(intelligenceRoutes.fallbackModelId, id));
      const reference = await tx.query.providerCredentialReferences.findFirst({
        where: eq(providerCredentialReferences.id, current.credentialReferenceId),
      });
      // Execution evidence outlives the model it refers to. Provider and submodel are
      // already denormalised onto each row, so detaching the id keeps the audit trail
      // intact instead of cascading the history away with the configuration.
      await tx
        .update(intelligenceExecutions)
        .set({ configuredModelId: null })
        .where(eq(intelligenceExecutions.configuredModelId, id));
      await tx.delete(intelligenceModels).where(eq(intelligenceModels.id, id));
      if (reference) {
        await tx
          .update(encryptedProviderCredentials)
          .set({ revokedAt: now, updatedAt: now })
          .where(eq(encryptedProviderCredentials.secretReference, reference.secretReference));
        await tx
          .update(providerCredentialReferences)
          .set({ active: false, updatedAt: now })
          .where(eq(providerCredentialReferences.id, reference.id));
      }
    });

    const affectedCapabilities = routes.map((route) => route.capability);
    await this.audit.append({
      actorType: 'USER',
      actorId: principal.subject,
      action: 'intelligence.model_removed',
      aggregateType: 'IntelligenceModel',
      aggregateId: id,
      purpose: 'RELEASE_MANAGEMENT',
      payload: { provider: current.provider, submodel: current.submodel, affectedCapabilities },
    });
    await this.refreshRouteStatuses();
    return { affectedCapabilities };
  }

  /** A real provider round trip. Only a success may produce a green status. */
  async testModel(
    principal: Principal,
    id: string,
  ): Promise<{ model: ConfiguredModelView; verified: boolean; message: string }> {
    const current = await this.database.db.query.intelligenceModels.findFirst({
      where: eq(intelligenceModels.id, id),
    });
    if (!current) throw new RoutingError('That model is not configured.', 'NOT_FOUND');

    const provider = current.provider as IntelligenceProviderKey;
    const apiKey = await this.decryptCredential(current.credentialReferenceId);
    const now = new Date();
    if (!apiKey) {
      const updated = await this.markModelFailure(
        id,
        'AUTHENTICATION',
        'No stored credential.',
        now,
      );
      return { model: updated, verified: false, message: 'No stored credential could be read.' };
    }

    const adapter = createIntelligenceAdapter(provider);
    const health = await adapter.healthCheck(apiKey, current.submodel);
    if (!health.ok) {
      const updated = await this.markModelFailure(
        id,
        health.error.category,
        health.error.message,
        now,
      );
      await this.refreshRouteStatuses();
      return { model: updated, verified: false, message: health.error.message };
    }

    const [row] = await this.database.db
      .update(intelligenceModels)
      .set({
        status: 'CONNECTED',
        lastSuccessfulTestAt: now,
        lastFailureAt: null,
        lastFailureCategory: null,
        lastFailureReason: null,
        updatedAt: now,
      })
      .where(eq(intelligenceModels.id, id))
      .returning();
    if (!row) throw new Error('Intelligence model status was not updated');

    await this.audit.append({
      actorType: 'USER',
      actorId: principal.subject,
      action: 'intelligence.model_tested',
      aggregateType: 'IntelligenceModel',
      aggregateId: id,
      purpose: 'RELEASE_MANAGEMENT',
      payload: { provider, submodel: current.submodel, verified: true },
    });
    await this.refreshRouteStatuses();
    return {
      model: this.toModelView(row),
      verified: true,
      message: `${PROVIDER_LABELS[provider]} responded using ${current.submodel}.`,
    };
  }

  private async markModelFailure(
    id: string,
    category: ErrorCategory,
    reason: string,
    now: Date,
  ): Promise<ConfiguredModelView> {
    const [row] = await this.database.db
      .update(intelligenceModels)
      .set({
        status: 'FAILED',
        lastFailureAt: now,
        lastFailureCategory: category,
        lastFailureReason: reason,
        updatedAt: now,
      })
      .where(eq(intelligenceModels.id, id))
      .returning();
    if (!row) throw new Error('Intelligence model status was not updated');
    return this.toModelView(row);
  }

  // ---------------------------------------------------------------- routes

  async listRoutes(): Promise<RouteView[]> {
    const [routes, models] = await Promise.all([
      this.database.db.select().from(intelligenceRoutes),
      this.listModels(),
    ]);
    const byId = new Map(models.map((model) => [model.id, model]));
    return INTELLIGENCE_CAPABILITIES.map((capability) => {
      const row = routes.find((route) => route.capability === capability);
      const primary = row?.primaryModelId ? byId.get(row.primaryModelId) : undefined;
      const fallback = row?.fallbackModelId ? byId.get(row.fallbackModelId) : undefined;
      const { status, detail } = deriveRouteStatus(primary, fallback);
      return {
        capability,
        capabilityLabel: CAPABILITY_LABELS[capability],
        capabilityDescription: CAPABILITY_DESCRIPTIONS[capability],
        consumerStatusLabel: CAPABILITY_CONSUMER_STATUS[capability],
        primaryModelId: row?.primaryModelId ?? null,
        fallbackModelId: row?.fallbackModelId ?? null,
        status,
        statusDetail: detail,
        hasConsumer: !CAPABILITIES_WITHOUT_CONSUMER.includes(capability),
        lastTestedAt: row?.lastTestedAt?.toISOString() ?? null,
      };
    });
  }

  private async refreshRouteStatuses() {
    const routes = await this.listRoutes();
    const now = new Date();
    for (const route of routes) {
      await this.database.db
        .update(intelligenceRoutes)
        .set({ status: route.status, updatedAt: now })
        .where(eq(intelligenceRoutes.capability, route.capability));
    }
  }

  async saveRoute(
    principal: Principal,
    capability: IntelligenceCapability,
    input: { primaryModelId: string | null; fallbackModelId: string | null },
  ): Promise<RouteView> {
    if (input.primaryModelId && input.primaryModelId === input.fallbackModelId)
      throw new RoutingError(
        'The fallback model must be different from the primary model.',
        'DUPLICATE_ROUTE_MODEL',
      );

    const models = await this.listModels();
    const byId = new Map(models.map((model) => [model.id, model]));
    for (const id of [input.primaryModelId, input.fallbackModelId])
      if (id && !byId.has(id))
        throw new RoutingError('That model is not configured.', 'UNKNOWN_MODEL');

    const now = new Date();
    await this.database.db
      .insert(intelligenceRoutes)
      .values({
        capability,
        primaryModelId: input.primaryModelId,
        fallbackModelId: input.fallbackModelId,
        status: 'MISSING_MODEL',
      })
      .onConflictDoUpdate({
        target: [intelligenceRoutes.capability],
        set: {
          primaryModelId: input.primaryModelId,
          fallbackModelId: input.fallbackModelId,
          updatedAt: now,
        },
      });
    await this.refreshRouteStatuses();

    await this.audit.append({
      actorType: 'USER',
      actorId: principal.subject,
      action: 'intelligence.route_saved',
      aggregateType: 'IntelligenceRoute',
      aggregateId: capability,
      purpose: 'RELEASE_MANAGEMENT',
      payload: {
        capability,
        primaryModelId: input.primaryModelId,
        fallbackModelId: input.fallbackModelId,
      },
    });
    const routes = await this.listRoutes();
    const saved = routes.find((route) => route.capability === capability);
    if (!saved) throw new Error('Route was not persisted');
    return saved;
  }

  /** Sends a real minimal request through the route, honouring fallback rules. */
  async testRoute(
    capability: IntelligenceCapability,
  ): Promise<ExecutionOutcome & { capability: IntelligenceCapability }> {
    const outcome = await this.executeCapability(capability, {
      system: 'You are a connectivity probe. Answer with a single word.',
      prompt: 'Reply with the single word: ok',
      maxOutputTokens: 16,
    });
    const now = new Date();
    await this.database.db
      .update(intelligenceRoutes)
      .set({ lastTestedAt: now, updatedAt: now })
      .where(eq(intelligenceRoutes.capability, capability));
    return { ...outcome, capability };
  }

  // ------------------------------------------------------------- execution

  /**
   * The one execution path for every intelligence feature.
   *
   * Resolves the saved route, runs the primary, and only on a fallback-eligible
   * failure tries the configured fallback. Both attempts are recorded as evidence.
   */
  async executeCapability(
    capability: IntelligenceCapability,
    input: { system?: string; prompt: string; maxOutputTokens?: number; temperature?: number },
  ): Promise<ExecutionOutcome> {
    const routeRow = await this.database.db.query.intelligenceRoutes.findFirst({
      where: eq(intelligenceRoutes.capability, capability),
    });
    const models = await this.listModels();
    const byId = new Map(models.map((model) => [model.id, model]));
    const primary = routeRow?.primaryModelId ? byId.get(routeRow.primaryModelId) : undefined;
    const fallback = routeRow?.fallbackModelId ? byId.get(routeRow.fallbackModelId) : undefined;

    const attempt = async (
      model: ConfiguredModelView | undefined,
      tier: 'PRIMARY' | 'FALLBACK',
    ): Promise<ExecutionOutcome | null> => {
      if (!model) return null;
      if (!model.enabled) return null;
      const apiKey = await this.decryptCredential(
        (await this.database.db.query.intelligenceModels.findFirst({
          where: eq(intelligenceModels.id, model.id),
        }))!.credentialReferenceId,
      );
      const startedAt = new Date();
      if (!apiKey) {
        const executionId = await this.recordExecution({
          capability,
          routeId: routeRow?.id ?? null,
          model,
          tier,
          startedAt,
          completedAt: new Date(),
          outcome: 'FAILURE',
          errorCategory: 'AUTHENTICATION',
          errorMessage: 'No stored credential could be read.',
        });
        return {
          ok: false,
          error: {
            category: 'AUTHENTICATION',
            message: 'No stored credential could be read.',
            retryable: false,
            fallbackEligible: true,
          },
          executionId,
          usedFallback: tier === 'FALLBACK',
        };
      }

      const adapter = createIntelligenceAdapter(model.provider);
      const result = await adapter.execute(apiKey, {
        submodel: model.submodel,
        ...(input.system ? { system: input.system } : {}),
        prompt: input.prompt,
        ...(input.maxOutputTokens ? { maxOutputTokens: input.maxOutputTokens } : {}),
        ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
      });
      const completedAt = new Date();

      if (!result.ok) {
        const executionId = await this.recordExecution({
          capability,
          routeId: routeRow?.id ?? null,
          model,
          tier,
          startedAt,
          completedAt,
          outcome: 'FAILURE',
          errorCategory: result.error.category,
          errorMessage: result.error.message,
          ...(result.error.providerRequestId
            ? { providerRequestId: result.error.providerRequestId }
            : {}),
        });
        return { ok: false, error: result.error, executionId, usedFallback: tier === 'FALLBACK' };
      }

      const executionId = await this.recordExecution({
        capability,
        routeId: routeRow?.id ?? null,
        model,
        tier,
        startedAt,
        completedAt,
        outcome: 'SUCCESS',
        ...(result.result.providerRequestId
          ? { providerRequestId: result.result.providerRequestId }
          : {}),
        ...(result.result.usage?.promptTokens === undefined
          ? {}
          : { promptTokens: result.result.usage.promptTokens }),
        ...(result.result.usage?.completionTokens === undefined
          ? {}
          : { completionTokens: result.result.usage.completionTokens }),
      });
      return {
        ok: true,
        text: result.result.text,
        provider: model.provider,
        submodel: model.submodel,
        usedFallback: tier === 'FALLBACK',
        executionId,
      };
    };

    const primaryOutcome = await attempt(primary, 'PRIMARY');
    if (primaryOutcome?.ok) return primaryOutcome;

    // Only a fallback-eligible primary failure may reach the fallback.
    const mayFallback = primaryOutcome === null || primaryOutcome.error.fallbackEligible;
    if (mayFallback) {
      const fallbackOutcome = await attempt(fallback, 'FALLBACK');
      if (fallbackOutcome) return fallbackOutcome;
    }

    if (primaryOutcome) return primaryOutcome;
    return {
      ok: false,
      error: {
        category: 'INVALID_REQUEST',
        message: `No usable model is configured for ${CAPABILITY_LABELS[capability]}.`,
        retryable: false,
        fallbackEligible: false,
      },
      executionId: null,
      usedFallback: false,
    };
  }

  async enhanceKnowledgeField(input: {
    fieldLabel: KnowledgeFieldLabel;
    currentText: string;
    context: Array<{ label: string; value: string }>;
  }): Promise<
    | {
        ok: true;
        suggestion: string;
        executionId: string;
        usedFallback: boolean;
      }
    | { ok: false; message: string; category: ErrorCategory }
  > {
    const outcome = await this.executeCapability('AI_COPILOT', {
      system: FIELD_ENHANCEMENT_SYSTEM_PROMPT,
      prompt: JSON.stringify({
        fieldLabel: input.fieldLabel,
        currentText: input.currentText,
        neighbouringCompanyFacts: input.context,
      }),
      maxOutputTokens: 1_500,
      temperature: 0.2,
    });
    if (!outcome.ok)
      return { ok: false, message: outcome.error.message, category: outcome.error.category };

    const parsed = parseEnhancementResponse(outcome.text);
    if (!parsed.success)
      return {
        ok: false,
        message: 'The configured AI returned an invalid enhancement response.',
        category: 'INVALID_RESPONSE',
      };

    return {
      ok: true,
      suggestion: parsed.data.enhancedText,
      executionId: outcome.executionId,
      usedFallback: outcome.usedFallback,
    };
  }

  async adviseOperator(input: {
    question: string;
    cohort: {
      period: string;
      calls: number;
      completed: number;
      contained: number;
      unresolved: number;
      negative: number;
      averageDurationSeconds: number;
    };
    signals: Array<{ id: string; label: string; evidenceCallIds: string[] }>;
  }): Promise<
    | {
        ok: true;
        answer: string;
        citedSignalIds: string[];
        executionId: string;
        usedFallback: boolean;
      }
    | { ok: false; message: string; category: ErrorCategory }
  > {
    const outcome = await this.executeCapability('AI_COPILOT', {
      system: INTELLIGENCE_ADVICE_SYSTEM_PROMPT,
      prompt: JSON.stringify(input),
      maxOutputTokens: 700,
      temperature: 0.1,
    });
    if (!outcome.ok)
      return { ok: false, message: outcome.error.message, category: outcome.error.category };

    const parsed = parseIntelligenceAdvice(
      outcome.text,
      input.signals.map((signal) => signal.id),
    );
    if (!parsed.success)
      return {
        ok: false,
        message: 'The configured AI returned advice without valid evidence citations.',
        category: 'INVALID_RESPONSE',
      };

    return {
      ok: true,
      answer: parsed.data.answer,
      citedSignalIds: parsed.data.citedSignalIds,
      executionId: outcome.executionId,
      usedFallback: outcome.usedFallback,
    };
  }

  async analyseKnowledgeDocument(input: {
    title: string;
    kind: string;
    sourceText: string;
  }): Promise<
    | {
        ok: true;
        analysis: DocumentAnalysis;
        executionId: string;
        usedFallback: boolean;
      }
    | { ok: false; message: string; category: ErrorCategory }
  > {
    const outcome = await this.executeCapability('KNOWLEDGE_HUB', {
      system: DOCUMENT_ANALYSIS_SYSTEM_PROMPT,
      prompt: `Document title: ${input.title}
Document type: ${input.kind}

<extracted-source>
${input.sourceText}
</extracted-source>`,
      maxOutputTokens: 3_500,
      temperature: 0,
    });
    if (!outcome.ok)
      return { ok: false, message: outcome.error.message, category: outcome.error.category };

    const parsed = parseDocumentAnalysis(outcome.text, input.sourceText);
    if (!parsed.success)
      return {
        ok: false,
        message:
          'The configured AI returned an invalid document analysis or cited evidence that was not present in the source.',
        category: 'INVALID_RESPONSE',
      };

    return {
      ok: true,
      analysis: parsed.data,
      executionId: outcome.executionId,
      usedFallback: outcome.usedFallback,
    };
  }

  private async recordExecution(input: {
    capability: IntelligenceCapability;
    routeId: string | null;
    model: ConfiguredModelView;
    tier: 'PRIMARY' | 'FALLBACK';
    startedAt: Date;
    completedAt: Date;
    outcome: 'SUCCESS' | 'FAILURE';
    errorCategory?: ErrorCategory;
    errorMessage?: string;
    providerRequestId?: string;
    promptTokens?: number;
    completionTokens?: number;
  }): Promise<string> {
    const [row] = await this.database.db
      .insert(intelligenceExecutions)
      .values({
        capability: input.capability,
        routeId: input.routeId,
        configuredModelId: input.model.id,
        provider: input.model.provider,
        submodel: input.model.submodel,
        tier: input.tier,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        latencyMs: input.completedAt.getTime() - input.startedAt.getTime(),
        outcome: input.outcome,
        ...(input.errorCategory ? { errorCategory: input.errorCategory } : {}),
        ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
        ...(input.providerRequestId ? { providerRequestId: input.providerRequestId } : {}),
        ...(input.promptTokens === undefined ? {} : { promptTokens: input.promptTokens }),
        ...(input.completionTokens === undefined
          ? {}
          : { completionTokens: input.completionTokens }),
      })
      .returning();
    if (!row) throw new Error('Execution evidence was not recorded');
    return row.id;
  }

  /**
   * The TRANSCRIPT_SUMMARY consumer.
   *
   * Sends the real transcript to whichever provider the operator routed, and requires
   * the response to satisfy `SummarySchema` before it is accepted. A model that returns
   * prose, invalid JSON or an unsupported claim shape fails the request rather than
   * producing a summary the platform cannot stand behind.
   */
  async summariseTranscript(
    turns: Array<{ id: string; speaker: string; content: string }>,
  ): Promise<
    | {
        ok: true;
        summary: Summary;
        provider: IntelligenceProviderKey;
        submodel: string;
        usedFallback: boolean;
        executionId: string;
      }
    | { ok: false; message: string; category: ErrorCategory }
  > {
    if (turns.length === 0)
      return {
        ok: false,
        message: 'The transcript has no turns to summarise.',
        category: 'INVALID_REQUEST',
      };

    const transcript = turns
      .map((turn) => `[${turn.id}] ${turn.speaker}: ${turn.content}`)
      .join('\n');

    const outcome = await this.executeCapability('TRANSCRIPT_SUMMARY', {
      system: TRANSCRIPT_SUMMARY_SYSTEM_PROMPT,
      prompt: `Transcript turns (each prefixed with its evidence id):\n\n${transcript}`,
      maxOutputTokens: 2_000,
      temperature: 0,
    });
    if (!outcome.ok)
      return { ok: false, message: outcome.error.message, category: outcome.error.category };

    const parsed = parseJsonObject(outcome.text);
    if (!parsed)
      return {
        ok: false,
        message: `${PROVIDER_LABELS[outcome.provider]} did not return readable JSON.`,
        category: 'INVALID_RESPONSE',
      };

    const summary = SummarySchema.safeParse(parsed);
    if (!summary.success)
      return {
        ok: false,
        message: `${PROVIDER_LABELS[outcome.provider]} returned a summary that failed validation: ${summary.error.issues[0]?.message ?? 'unknown schema error'}`,
        category: 'INVALID_RESPONSE',
      };

    return {
      ok: true,
      summary: summary.data,
      provider: outcome.provider,
      submodel: outcome.submodel,
      usedFallback: outcome.usedFallback,
      executionId: outcome.executionId,
    };
  }

  async recentExecutions(capability?: IntelligenceCapability, limit = 20) {
    const rows = await this.database.db
      .select()
      .from(intelligenceExecutions)
      .where(capability ? eq(intelligenceExecutions.capability, capability) : undefined)
      .orderBy(desc(intelligenceExecutions.startedAt))
      .limit(limit);
    return rows.map((row) => ({
      id: row.id,
      capability: row.capability,
      provider: row.provider,
      submodel: row.submodel,
      tier: row.tier,
      outcome: row.outcome,
      latencyMs: row.latencyMs,
      errorCategory: row.errorCategory,
      errorMessage: row.errorMessage,
      providerRequestId: row.providerRequestId,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      startedAt: row.startedAt.toISOString(),
    }));
  }
}

export { RoutingError };
