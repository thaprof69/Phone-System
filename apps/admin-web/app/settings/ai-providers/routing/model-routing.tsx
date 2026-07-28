'use client';

import { useState } from 'react';
import styles from '../models/intelligence-models.module.css';
import routing from './model-routing.module.css';
import type { ConfiguredModel } from '../models/intelligence-models';

export type Capability =
  'TRANSCRIPT_SUMMARY' | 'AI_COPILOT' | 'CONTEXTUAL_GUIDE' | 'KNOWLEDGE_HUB' | 'EMAIL_AND_ALERTS';

export type RouteView = {
  capability: Capability;
  capabilityLabel: string;
  capabilityDescription: string;
  consumerStatusLabel: string | null;
  primaryModelId: string | null;
  fallbackModelId: string | null;
  status: 'READY' | 'MISSING_MODEL' | 'PROVIDER_UNAVAILABLE' | 'FALLBACK_ACTIVE';
  statusDetail: string;
  hasConsumer: boolean;
  lastTestedAt: string | null;
};

const endpoint = '/api/admin/ai/intelligence';

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    cache: 'no-store',
    credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Error(data.message ?? `The service returned ${response.status}`);
  return data;
}

function light(status: RouteView['status']) {
  if (status === 'READY') return { className: styles.dotGreen, text: 'Ready' };
  if (status === 'FALLBACK_ACTIVE') return { className: styles.dotAmber, text: 'Fallback active' };
  if (status === 'PROVIDER_UNAVAILABLE')
    return { className: styles.dotRed, text: 'Provider unavailable' };
  return { className: styles.dotGrey, text: 'Missing model' };
}

function describe(model: ConfiguredModel | undefined) {
  return model ? `${model.providerLabel} · ${model.submodel}` : 'Not set';
}

function formatWhen(value: string | null) {
  if (!value) return 'Never tested';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function ModelRouting({
  initialRoutes,
  models,
}: {
  initialRoutes: RouteView[];
  models: ConfiguredModel[];
}) {
  const [routes, setRoutes] = useState(initialRoutes);

  async function refresh() {
    setRoutes(await request<RouteView[]>('/routes', 'GET'));
  }

  if (models.length === 0)
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No intelligence models configured.</p>
        <p className={styles.emptyBody}>
          Add a model on the Intelligence Models page before assigning routes.
        </p>
      </div>
    );

  return (
    <div className={routing.grid}>
      {routes.map((route) => (
        <RouteCard key={route.capability} models={models} onChanged={refresh} route={route} />
      ))}
    </div>
  );
}

function RouteCard({
  route,
  models,
  onChanged,
}: {
  route: RouteView;
  models: ConfiguredModel[];
  onChanged: () => Promise<void>;
}) {
  const [primaryModelId, setPrimaryModelId] = useState(route.primaryModelId ?? '');
  const [fallbackModelId, setFallbackModelId] = useState(route.fallbackModelId ?? '');
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);

  const byId = new Map(models.map((model) => [model.id, model]));
  const state = light(route.status);

  async function save() {
    setBusy('save');
    setMessage(null);
    try {
      await request<RouteView>(`/routes/${route.capability}`, 'PUT', {
        primaryModelId: primaryModelId || null,
        fallbackModelId: fallbackModelId || null,
      });
      await onChanged();
      setMessage({ text: 'Route saved.', failed: false });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'The route could not be saved.',
        failed: true,
      });
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy('test');
    setMessage(null);
    try {
      const result = await request<
        | { ok: true; provider: string; submodel: string; usedFallback: boolean }
        | { ok: false; error: { message: string } }
      >(`/routes/${route.capability}/test`, 'POST');
      await onChanged();
      if (result.ok) {
        setMessage({
          text: `${result.usedFallback ? 'Fallback' : 'Primary'} model answered: ${result.provider} · ${result.submodel}.`,
          failed: false,
        });
      } else {
        setMessage({ text: result.error.message, failed: true });
      }
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'The route test failed.',
        failed: true,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={routing.card}>
      <div className={routing.head}>
        <div>
          <h2 className={routing.title}>{route.capabilityLabel}</h2>
          <p className={styles.status}>
            <span aria-hidden="true" className={`${styles.dot} ${state.className}`} />
            {state.text}
          </p>
        </div>
        {route.consumerStatusLabel ? (
          <span className={routing.pill}>{route.consumerStatusLabel}</span>
        ) : null}
      </div>

      <p className={routing.purpose}>{route.capabilityDescription}</p>
      <p className={routing.detail}>{route.statusDetail}</p>

      <label className={styles.field}>
        <span className={styles.label}>Primary Model</span>
        <select
          className={styles.input}
          onChange={(event) => setPrimaryModelId(event.target.value)}
          value={primaryModelId}
        >
          <option value="">Not set</option>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {describe(model)}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Fallback Model (optional)</span>
        <select
          className={styles.input}
          onChange={(event) => setFallbackModelId(event.target.value)}
          value={fallbackModelId}
        >
          <option value="">Not set</option>
          {models
            // The same model cannot be both primary and fallback.
            .filter((model) => model.id !== primaryModelId)
            .map((model) => (
              <option key={model.id} value={model.id}>
                {describe(model)}
              </option>
            ))}
        </select>
      </label>

      <p className={styles.subtle}>Last tested {formatWhen(route.lastTestedAt)}</p>

      {message ? (
        <p
          aria-live="polite"
          className={`${styles.notice} ${message.failed ? styles.noticeError : ''}`}
          role="status"
        >
          {message.text}
        </p>
      ) : null}

      <div className={routing.actions}>
        <button
          className={styles.primaryButton}
          disabled={busy !== null}
          onClick={() => void save()}
          type="button"
        >
          {busy === 'save' ? 'Saving…' : 'Save Route'}
        </button>
        <button
          className={styles.ghostButton}
          disabled={busy !== null || !route.primaryModelId}
          onClick={() => void test()}
          type="button"
        >
          {busy === 'test' ? 'Testing…' : 'Test Route'}
        </button>
      </div>
    </section>
  );
}
