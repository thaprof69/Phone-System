'use client';

import { useState, type ReactNode } from 'react';
import styles from './provider-card.module.css';
import {
  agentLabel as deriveAgentLabel,
  formValuesFrom,
  keyLabel as deriveKeyLabel,
  settingsPayload as buildSettingsPayload,
  type ProviderStatus,
} from './provider-card.logic';

export type { ProviderStatus } from './provider-card.logic';

/**
 * The ElevenLabs provider form, ported from the source implementation's `ProviderCard`
 * (Quantum Park Lite — src/app/settings/phone/_components/phone-panels.tsx).
 *
 * Layout, field order, labels, helper text, button text and styling are the source's.
 * The integration boundary is this repository's own ElevenLabs API: the source persists
 * through a Prisma `PhoneSetupConfig`, this app persists through the provider-integration
 * service behind /api/admin/integrations/elevenlabs.
 */

type TestResult = {
  status: string;
  verified: boolean;
  message?: string;
  validationProof?: string;
  verifiedAgent?: { id: string; name: string | null };
};

type ProviderMapping = {
  status: 'IN_SYNC' | 'DRIFTED' | 'PUBLISH_FAILED' | 'NOT_CONFIGURED';
  message?: string;
};

const endpoint = '/api/admin/integrations/elevenlabs';

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    cache: 'no-store',
    credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok)
    throw new Error(data.message ?? `Integration service returned ${response.status}`);
  return data;
}

export function ProviderCard({ initialStatus }: { initialStatus: ProviderStatus }) {
  const loaded = formValuesFrom(initialStatus);
  const [status, setStatus] = useState(initialStatus);
  const [apiKey, setApiKey] = useState('');
  const [agentId, setAgentId] = useState(loaded.agentId);
  const [voiceMode, setVoiceMode] = useState(loaded.voiceMode);
  const [language, setLanguage] = useState(loaded.language);
  const [receptionistDisplayName, setReceptionistDisplayName] = useState(
    loaded.receptionistDisplayName,
  );
  const [greetingOverride, setGreetingOverride] = useState(loaded.greetingOverride);
  const [enableVoiceTest, setEnableVoiceTest] = useState(loaded.enableVoiceTest);
  const [captureTranscripts, setCaptureTranscripts] = useState(loaded.captureTranscripts);
  const [detectEscalations, setDetectEscalations] = useState(loaded.detectEscalations);
  const [enableChatTest, setEnableChatTest] = useState(loaded.enableChatTest);
  const [generateSummaries, setGenerateSummaries] = useState(loaded.generateSummaries);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  const hasCredential = Boolean(status.credentialReference);
  const keyLabel = deriveKeyLabel(status);
  const agentLabel = deriveAgentLabel(status);

  function settingsPayload() {
    return buildSettingsPayload(status, {
      agentId,
      voiceMode,
      language,
      receptionistDisplayName,
      greetingOverride,
      enableVoiceTest,
      captureTranscripts,
      detectEscalations,
      enableChatTest,
      generateSummaries,
    });
  }

  function report(text: string, isFailure = false) {
    setMessage(text);
    setFailed(isFailure);
  }

  /**
   * "Save ElevenLabs" — persist the form.
   *
   * A newly entered key is stored, not discarded. The credential store requires a
   * validation proof before it will accept a secret, so supplying a key necessarily
   * performs the provider round trip; previously this silently dropped the key and told
   * the operator to press the other button.
   */
  async function save() {
    setBusy('save');
    report('');
    try {
      if (apiKey) {
        await storeNewKey();
        return;
      }
      const updated = await request<ProviderStatus>('', 'PATCH', settingsPayload());
      setStatus(updated);
      report('Provider settings saved. The API key was encrypted and masked.');
    } catch (error) {
      report(error instanceof Error ? error.message : 'Settings could not be saved.', true);
    } finally {
      setBusy(null);
    }
  }

  /**
   * Verifies a newly entered key against the provider and, only if it is accepted,
   * stores it and persists the rest of the form. Shared by both buttons so a key is
   * never accepted without proof and never dropped after being entered.
   */
  async function storeNewKey() {
    const tested = await request<TestResult>('/test', 'POST', {
      apiKey,
      connectionLabel: status.connectionLabel ?? 'Quantum Parks',
      environment: status.environment ?? 'PRODUCTION',
      ...(agentId.trim() ? { defaultAgentId: agentId.trim() } : {}),
    });
    if (!tested.verified) {
      report(tested.message ?? 'Connection validation failed.', true);
      return;
    }
    const saved = await request<
      ProviderStatus & {
        saved?: boolean;
        rotated?: boolean;
        providerMapping?: ProviderMapping;
      }
    >(hasCredential ? '/rotate' : '/connect', 'POST', {
      apiKey,
      connectionLabel: status.connectionLabel ?? 'Quantum Parks',
      environment: status.environment ?? 'PRODUCTION',
      validationProof: tested.validationProof,
      // Carry the agent being configured, so rotation validates the new agent rather
      // than the previously stored one.
      ...(agentId.trim() ? { defaultAgentId: agentId.trim() } : {}),
      ...(hasCredential
        ? {}
        : {
            ...settingsPayload(),
            // The strict connect contract accepts a real voice id or omission.
            // `null` is only valid on later PATCH updates where it means clear.
            defaultVoiceId: status.defaultVoiceId ?? undefined,
          }),
    });
    // The persist endpoints report failure in the body, not the HTTP status. Without this
    // check a failed save was reported as "Provider saved" while nothing was stored.
    const persisted = hasCredential ? saved.rotated !== false : saved.saved !== false;
    if (!persisted) {
      setStatus(saved);
      report(
        (saved as { message?: string }).message ??
          'The credential was verified but could not be saved.',
        true,
      );
      return;
    }
    // Rotation only replaces the secret, so the settings still need persisting.
    const updated = hasCredential
      ? await request<ProviderStatus>('', 'PATCH', settingsPayload())
      : saved;
    setStatus(updated);
    setApiKey('');
    if (saved.providerMapping && saved.providerMapping.status !== 'IN_SYNC') {
      report(
        `Provider saved, but the live receptionist could not be synchronized: ${
          saved.providerMapping.message ?? saved.providerMapping.status
        }`,
        true,
      );
      return;
    }
    report(
      tested.verifiedAgent
        ? `Provider saved, verified agent "${
            tested.verifiedAgent.name ?? tested.verifiedAgent.id
          }", and synchronized the live receptionist.`
        : 'Provider saved and the connection was verified.',
    );
  }

  /** "Save & test provider" — a real ElevenLabs credential and agent verification. */
  async function saveAndTest() {
    setBusy('test');
    report('');
    try {
      if (!apiKey && hasCredential) {
        const verified = await request<ProviderStatus & { verified: boolean; message?: string }>(
          '/verify',
          'POST',
        );
        setStatus(verified);
        if (!verified.verified) {
          report(
            verified.message ??
              'The stored credential could not be verified — settings were not saved.',
            true,
          );
          return;
        }
        const updated = await request<ProviderStatus>('', 'PATCH', settingsPayload());
        setStatus(updated);
        report('The stored connection is healthy and settings were saved.');
        return;
      }

      if (!apiKey) {
        report('Enter an ElevenLabs API key to test the connection.', true);
        return;
      }

      await storeNewKey();
    } catch (error) {
      report(error instanceof Error ? error.message : 'Connection could not be saved.', true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={styles.card} id="provider">
      <div className={styles.cardGlow} />
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div>
          <h2 className={styles.title}>ElevenLabs Provider</h2>
          <p className={styles.summary}>
            {keyLabel} · {agentLabel}
          </p>
          <button
            className={styles.topButton}
            disabled={busy !== null}
            onClick={() => void saveAndTest()}
            type="button"
          >
            {busy === 'test' ? 'Saving & testing…' : 'Save & test provider'}
          </button>
        </div>

        <div className={styles.explainer}>
          <p className={styles.explainerTitle}>How Voice Works</p>
          <p className={styles.explainerBody}>
            ElevenLabs gives the browser voice and chat interface. Quantum keeps the business brain:
            company memory, safety policy, booking logic, escalation, audit logs, and Mission
            Control events.
          </p>
        </div>

        <div className={styles.grid}>
          <div className={styles.column}>
            <Field label="ElevenLabs API Key">
              <input
                autoComplete="new-password"
                className={styles.input}
                name="apiKey"
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={hasCredential ? 'Leave blank to keep current key' : 'sk_...'}
                spellCheck={false}
                type="password"
                value={apiKey}
              />
              <p className={styles.help}>
                Stored securely on the server. Used only to validate ElevenLabs and create
                short-lived voice sessions. Never exposed to the browser.
              </p>
            </Field>

            <Field label="Voice Mode" withInfo>
              <div className={styles.selectWrap}>
                <select
                  className={`${styles.input} ${styles.select}`}
                  name="voiceMode"
                  onChange={(event) =>
                    setVoiceMode(event.target.value as 'WEBRTC_PREFERRED' | 'WEBSOCKET_ONLY')
                  }
                  value={voiceMode}
                >
                  <option value="WEBRTC_PREFERRED">WebRTC preferred</option>
                  <option value="WEBSOCKET_ONLY">WebSocket fallback</option>
                </select>
                <span className={styles.selectChevron} />
              </div>
            </Field>

            <Field label="Receptionist display name">
              <input
                className={styles.input}
                name="receptionistDisplayName"
                onChange={(event) => setReceptionistDisplayName(event.target.value)}
                value={receptionistDisplayName}
              />
            </Field>

            <div className={styles.toggleGroup}>
              <Toggle
                checked={enableVoiceTest}
                label="Enable voice test"
                name="enableVoiceTest"
                onChange={setEnableVoiceTest}
              />
              <Toggle
                checked={captureTranscripts}
                label="Capture transcripts"
                name="captureTranscripts"
                onChange={setCaptureTranscripts}
              />
              <Toggle
                checked={detectEscalations}
                label="Detect escalations"
                name="detectEscalations"
                onChange={setDetectEscalations}
              />
            </div>
          </div>

          <div className={styles.column}>
            <Field label="ElevenLabs Agent ID">
              <input
                autoComplete="off"
                className={styles.input}
                name="agentId"
                onChange={(event) => setAgentId(event.target.value)}
                placeholder="agent_..."
                spellCheck={false}
                value={agentId}
              />
              <p className={styles.help}>
                The ElevenLabs agent Quantum uses as the voice interface. Quantum still provides
                business memory, policies, booking logic, and escalation decisions.
              </p>
            </Field>

            <Field label="Language" withInfo>
              <input
                className={styles.input}
                name="language"
                onChange={(event) => setLanguage(event.target.value)}
                value={language}
              />
            </Field>

            <Field label="Greeting override">
              <input
                className={styles.input}
                name="greetingOverride"
                onChange={(event) => setGreetingOverride(event.target.value)}
                value={greetingOverride}
              />
              <p className={styles.help}>
                The first thing the AI receptionist says in a voice session. Keep it short, natural,
                and on-brand.
              </p>
            </Field>

            <div className={styles.toggleGroup}>
              <Toggle
                checked={enableChatTest}
                label="Enable chat test"
                name="enableChatTest"
                onChange={setEnableChatTest}
              />
              <Toggle
                checked={generateSummaries}
                label="Generate summaries"
                name="generateSummaries"
                onChange={setGenerateSummaries}
              />
            </div>
          </div>
        </div>

        {message ? (
          <p
            aria-live="polite"
            className={`${styles.notice} ${failed ? styles.noticeError : ''}`}
            role="status"
          >
            {message}
          </p>
        ) : null}

        <div className={styles.footer}>
          <button className={styles.footerButton} disabled={busy !== null} type="submit">
            {busy === 'save' ? 'Saving…' : 'Save ElevenLabs'}
          </button>
        </div>
      </form>
    </section>
  );
}

/** Source: `CinematicField`. */
function Field({
  children,
  label,
  withInfo = false,
}: {
  children: ReactNode;
  label: string;
  withInfo?: boolean;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>
        {label}
        {withInfo ? <InfoDot /> : null}
      </span>
      {children}
    </label>
  );
}

/** Source: `CinematicToggle`. */
function Toggle({
  checked,
  label,
  name,
  onChange,
}: {
  checked: boolean;
  label: string;
  name: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className={styles.toggle}>
      <span className={styles.toggleLabel}>
        <span>{label}</span>
        <InfoDot />
      </span>
      <span className={styles.toggleBox}>
        <input
          checked={checked}
          className={styles.toggleInput}
          name={name}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span className={styles.toggleMark} />
        <span className={styles.toggleCheck}>✓</span>
      </span>
    </label>
  );
}

/** Source: `InfoDot`. */
function InfoDot() {
  return <span className={styles.infoDot}>i</span>;
}
