'use client';

import { useEffect, useState } from 'react';
import styles from './intelligence-models.module.css';

export type ProviderKey = 'OPENAI' | 'ANTHROPIC' | 'DEEPSEEK' | 'KIMI' | 'QWEN' | 'GEMINI';

export const PROVIDERS: Array<{ key: ProviderKey; label: string }> = [
  { key: 'OPENAI', label: 'OpenAI' },
  { key: 'ANTHROPIC', label: 'Anthropic' },
  { key: 'DEEPSEEK', label: 'DeepSeek' },
  { key: 'KIMI', label: 'Kimi' },
  { key: 'QWEN', label: 'Qwen' },
  { key: 'GEMINI', label: 'Gemini' },
];

export type ConfiguredModel = {
  id: string;
  provider: ProviderKey;
  providerLabel: string;
  submodel: string;
  credentialReference: string;
  enabled: boolean;
  status: 'NOT_TESTED' | 'CONNECTED' | 'FAILED' | 'DISABLED';
  lastSuccessfulTestAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
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

/** Green only after a live test passed; amber for saved-but-unproven. */
function light(status: ConfiguredModel['status']) {
  if (status === 'CONNECTED') return { className: styles.dotGreen, text: 'Connected' };
  if (status === 'FAILED') return { className: styles.dotRed, text: 'Connection failed' };
  if (status === 'DISABLED') return { className: styles.dotGrey, text: 'Disabled' };
  return { className: styles.dotAmber, text: 'Saved, not tested' };
}

function initials(provider: ProviderKey) {
  return provider.slice(0, 2);
}

function formatWhen(value: string | null) {
  if (!value) return 'Never tested';
  return `Tested ${new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))}`;
}

export function IntelligenceModels({ initialModels }: { initialModels: ConfiguredModel[] }) {
  const [models, setModels] = useState(initialModels);
  const [editing, setEditing] = useState<ConfiguredModel | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<ConfiguredModel | null>(null);
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);

  async function refresh() {
    setModels(await request<ConfiguredModel[]>('/models', 'GET'));
  }

  async function testModel(model: ConfiguredModel) {
    setBusyId(model.id);
    setNotice(null);
    try {
      const result = await request<{ verified: boolean; message: string }>(
        `/models/${model.id}/test`,
        'POST',
      );
      setNotice({ text: result.message, failed: !result.verified });
      await refresh();
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : 'The test failed.',
        failed: true,
      });
    } finally {
      setBusyId(null);
    }
  }

  async function removeModel(model: ConfiguredModel) {
    setBusyId(model.id);
    setNotice(null);
    try {
      const result = await request<{ affectedCapabilities: string[] }>(
        `/models/${model.id}`,
        'DELETE',
      );
      setConfirmRemove(null);
      await refresh();
      setNotice({
        text: result.affectedCapabilities.length
          ? `Removed. These routes now have no model and will not run: ${result.affectedCapabilities.join(', ')}.`
          : 'Model removed.',
        failed: result.affectedCapabilities.length > 0,
      });
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : 'The model could not be removed.',
        failed: true,
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className={styles.toolbar}>
        <button className={styles.primaryButton} onClick={() => setAdding(true)} type="button">
          + Add Model
        </button>
      </div>

      {notice ? (
        <p
          aria-live="polite"
          className={`${styles.notice} ${notice.failed ? styles.noticeError : ''}`}
          role="status"
        >
          {notice.text}
        </p>
      ) : null}

      {models.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No intelligence models configured.</p>
          <p className={styles.emptyBody}>Add a model to make it available for routing.</p>
          <button className={styles.primaryButton} onClick={() => setAdding(true)} type="button">
            Add Model
          </button>
        </div>
      ) : (
        <ul className={styles.list}>
          {models.map((model) => {
            const state = light(model.status);
            return (
              <li className={styles.row} key={model.id}>
                <span aria-hidden="true" className={styles.badge}>
                  {initials(model.provider)}
                </span>
                <div className={styles.identity}>
                  <p className={styles.provider}>{model.providerLabel}</p>
                  <p className={styles.submodel}>{model.submodel}</p>
                </div>
                <div className={styles.meta}>
                  <p className={styles.status}>
                    <span aria-hidden="true" className={`${styles.dot} ${state.className}`} />
                    {state.text}
                  </p>
                  <p className={styles.subtle}>
                    {model.credentialReference} · {formatWhen(model.lastSuccessfulTestAt)}
                  </p>
                  {model.status === 'FAILED' && model.lastFailureReason ? (
                    <p className={styles.failure}>{model.lastFailureReason}</p>
                  ) : null}
                </div>
                <div className={styles.actions}>
                  <button
                    className={styles.ghostButton}
                    disabled={busyId === model.id}
                    onClick={() => void testModel(model)}
                    type="button"
                  >
                    {busyId === model.id ? 'Testing…' : 'Test'}
                  </button>
                  <button
                    className={styles.ghostButton}
                    onClick={() => setEditing(model)}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    className={styles.dangerButton}
                    onClick={() => setConfirmRemove(model)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {adding || editing ? (
        <ModelDialog
          existing={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={async (message) => {
            setAdding(false);
            setEditing(null);
            await refresh();
            setNotice({ text: message, failed: false });
          }}
        />
      ) : null}

      {confirmRemove ? (
        <div className={styles.backdrop} role="dialog" aria-modal="true">
          <div className={styles.dialog}>
            <h2 className={styles.dialogTitle}>Remove this model?</h2>
            <p className={styles.dialogBody}>
              {confirmRemove.providerLabel} · {confirmRemove.submodel} will be removed and its
              stored credential revoked. Any route using it will stop running until you choose a
              replacement — it will not be swapped automatically.
            </p>
            <div className={styles.dialogActions}>
              <button
                className={styles.ghostButton}
                onClick={() => setConfirmRemove(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={styles.dangerButton}
                disabled={busyId === confirmRemove.id}
                onClick={() => void removeModel(confirmRemove)}
                type="button"
              >
                {busyId === confirmRemove.id ? 'Removing…' : 'Remove model'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModelDialog({
  existing,
  onClose,
  onSaved,
}: {
  existing: ConfiguredModel | null;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [provider, setProvider] = useState<ProviderKey>(existing?.provider ?? 'OPENAI');
  const [apiKey, setApiKey] = useState('');
  const [submodel, setSubmodel] = useState(existing?.submodel ?? '');
  const [options, setOptions] = useState<Array<{ id: string; displayName?: string }>>([]);
  const [source, setSource] = useState<'PROVIDER' | 'REGISTRY' | null>(null);
  const [sourceReason, setSourceReason] = useState<string | null>(null);
  const [busy, setBusy] = useState<'load' | 'test' | 'save' | null>(null);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);

  // Submodels always come from the server — the browser never invents model names.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setBusy('load');
      try {
        // POST, not GET: an unsaved key must never travel in a query string.
        const result = await request<{
          models: Array<{ id: string; displayName?: string }>;
          source: 'PROVIDER' | 'REGISTRY';
          reason?: string;
        }>('/submodels', 'POST', {
          provider,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          ...(existing ? { modelId: existing.id } : {}),
        });
        if (cancelled) return;
        setOptions(result.models);
        setSource(result.source);
        setSourceReason(result.reason ?? null);
        setSubmodel((current) =>
          current && result.models.some((model) => model.id === current)
            ? current
            : (result.models[0]?.id ?? ''),
        );
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setBusy(null);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // Re-resolve when the provider changes, or once a key is supplied.
  }, [provider, apiKey, existing]);

  async function save(thenTest: boolean) {
    setBusy(thenTest ? 'test' : 'save');
    setMessage(null);
    try {
      const saved = existing
        ? await request<ConfiguredModel>(`/models/${existing.id}`, 'PATCH', {
            submodel,
            ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          })
        : await request<ConfiguredModel>('/models', 'POST', {
            provider,
            submodel,
            apiKey: apiKey.trim(),
          });
      if (!thenTest) {
        await onSaved(`${saved.providerLabel} · ${saved.submodel} saved. Run a test to verify it.`);
        return;
      }
      const tested = await request<{ verified: boolean; message: string }>(
        `/models/${saved.id}/test`,
        'POST',
      );
      if (tested.verified) {
        await onSaved(tested.message);
        return;
      }
      setMessage({ text: tested.message, failed: true });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'The model could not be saved.',
        failed: true,
      });
    } finally {
      setBusy(null);
    }
  }

  const canSave = Boolean(submodel) && (existing ? true : apiKey.trim().length >= 8);

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <div className={styles.dialog}>
        <h2 className={styles.dialogTitle}>{existing ? 'Edit model' : 'Add model'}</h2>

        <label className={styles.field}>
          <span className={styles.label}>Provider</span>
          <select
            className={styles.input}
            disabled={Boolean(existing)}
            onChange={(event) => setProvider(event.target.value as ProviderKey)}
            value={provider}
          >
            {PROVIDERS.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>API Key</span>
          <input
            autoComplete="new-password"
            className={styles.input}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={
              existing ? 'Leave blank to keep current key' : 'Paste the provider API key'
            }
            spellCheck={false}
            type="password"
            value={apiKey}
          />
          <span className={styles.help}>
            Encrypted on the server. It is never returned to this page after saving.
          </span>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Submodel</span>
          <select
            className={styles.input}
            disabled={busy === 'load' || options.length === 0}
            onChange={(event) => setSubmodel(event.target.value)}
            value={submodel}
          >
            {options.length === 0 ? <option value="">No models available</option> : null}
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.displayName ? `${option.displayName} (${option.id})` : option.id}
              </option>
            ))}
          </select>
          <span className={styles.help}>
            {busy === 'load'
              ? 'Loading models…'
              : source === 'PROVIDER'
                ? 'Loaded live from the provider.'
                : source === 'REGISTRY'
                  ? `From the maintained registry. ${sourceReason ?? ''}`.trim()
                  : ''}
          </span>
        </label>

        {message ? (
          <p
            aria-live="polite"
            className={`${styles.notice} ${message.failed ? styles.noticeError : ''}`}
            role="status"
          >
            {message.text}
          </p>
        ) : null}

        <div className={styles.dialogActions}>
          <button className={styles.ghostButton} onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className={styles.ghostButton}
            disabled={!canSave || busy !== null}
            onClick={() => void save(true)}
            type="button"
          >
            {busy === 'test' ? 'Testing…' : 'Test Connection'}
          </button>
          <button
            className={styles.primaryButton}
            disabled={!canSave || busy !== null}
            onClick={() => void save(false)}
            type="button"
          >
            {busy === 'save' ? 'Saving…' : 'Save Model'}
          </button>
        </div>
      </div>
    </div>
  );
}
