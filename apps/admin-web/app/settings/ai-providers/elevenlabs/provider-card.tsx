'use client';

import { useId, useState, type ReactNode } from 'react';
import styles from './provider-card.module.css';
import {
  agentLabel as deriveAgentLabel,
  formValuesFrom,
  keyLabel as deriveKeyLabel,
  normaliseTransferConfiguration,
  settingsPayload as buildSettingsPayload,
  type ProviderStatus,
  type TransferConfiguration,
  type TransferDestination,
  type TransferDestinationType,
  type TransferFallbackType,
  type TransferRule,
  type TransferType,
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
const transferTypeOptions: Array<{ value: TransferType; label: string }> = [
  { value: 'provider_default', label: 'Provider default' },
  { value: 'conference', label: 'Conference' },
  { value: 'blind', label: 'Blind' },
  { value: 'sip_refer', label: 'SIP REFER' },
];
const destinationTypeOptions: Array<{ value: TransferDestinationType; label: string }> = [
  { value: 'alias', label: 'Provider alias' },
  { value: 'phone', label: 'Phone number' },
  { value: 'sip_uri', label: 'SIP URI' },
];
const fallbackTypeOptions: Array<{ value: TransferFallbackType; label: string }> = [
  { value: 'callback', label: 'Callback task' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'message_only', label: 'Message only' },
];

type GuideContent = {
  title: string;
  what: string;
  why: string;
  how: string;
};

const guideContent = {
  apiKey: {
    title: 'ElevenLabs API Key',
    what: 'Stores the server-side credential used to validate ElevenLabs and create voice sessions.',
    why: 'The browser must never receive permanent provider credentials, so the app keeps this encrypted behind the integration service.',
    how: 'Paste a valid ElevenLabs key when connecting or rotating. Leave the field blank when saving ordinary settings.',
  },
  voiceMode: {
    title: 'Voice Mode',
    what: 'Controls the preferred browser transport for voice test sessions.',
    why: 'WebRTC gives the best live voice path when available. WebSocket mode keeps testing available when WebRTC is not suitable.',
    how: 'Use WebRTC preferred for normal operation. Switch to WebSocket fallback only when browser, network, or environment constraints require it.',
  },
  receptionistDisplayName: {
    title: 'Receptionist Display Name',
    what: 'Names the AI receptionist inside the Phone System App experience.',
    why: 'Operators need to recognize which configured voice experience they are testing, reviewing, or approving.',
    how: 'Use a short operational name such as “Quantum Parks Receptionist”. Keep brand wording consistent with the live agent.',
  },
  enableVoiceTest: {
    title: 'Enable Voice Test',
    what: 'Allows the settings page to start controlled voice test sessions.',
    why: 'Testing should be explicit so production operators do not accidentally exercise live voice flows.',
    how: 'Turn this on when validating a configured agent. Turn it off when voice testing should be unavailable in this workspace.',
  },
  captureTranscripts: {
    title: 'Capture Transcripts',
    what: 'Saves provider transcript evidence for later review and summarisation.',
    why: 'Transcripts support audit trails, summaries, corrections, and escalation review.',
    how: 'Keep enabled for normal operations unless retention policy or incident response requires disabling transcript capture.',
  },
  detectEscalations: {
    title: 'Detect Escalations',
    what: 'Flags conversations where the caller asks for a person or the AI reaches a policy boundary.',
    why: 'Escalation detection is the bridge between the live voice runtime and human handoff policy.',
    how: 'Keep enabled when handoff rules are active. Tune rules below to decide which situations should transfer and where.',
  },
  agentId: {
    title: 'ElevenLabs Agent ID',
    what: 'Identifies the ElevenLabs voice agent that handles live calls.',
    why: 'Quantum Parks owns policy and intelligence, while the selected ElevenLabs agent executes the live voice interaction.',
    how: 'Paste the approved agent id from ElevenLabs. Save and test to verify the credential can access that agent.',
  },
  language: {
    title: 'Language',
    what: 'Sets the default language hint for this receptionist configuration.',
    why: 'A consistent language setting helps testing, summaries, and operator expectations stay aligned.',
    how: 'Use a clear locale or language name that matches the deployed agent, for example “en-GB” or “English”.',
  },
  greetingOverride: {
    title: 'Greeting Override',
    what: 'Defines the opening phrase the AI receptionist should use.',
    why: 'The greeting is the first caller-facing signal and should match brand, venue, and safety expectations.',
    how: 'Keep it brief, natural, and non-committal. Avoid promises about bookings, payments, or protected information.',
  },
  enableChatTest: {
    title: 'Enable Chat Test',
    what: 'Allows text-based testing of the configured receptionist flow.',
    why: 'Chat testing is faster for policy checks before running a live voice test.',
    how: 'Turn it on while drafting or reviewing rules. Turn it off when only approved voice testing should be exposed.',
  },
  generateSummaries: {
    title: 'Generate Summaries',
    what: 'Creates call summaries from accepted transcript evidence.',
    why: 'Summaries help operators review outcomes without reading every transcript line.',
    how: 'Keep enabled for operational workflows. Summaries should remain distinct from raw transcripts and audit evidence.',
  },
  transferEnabled: {
    title: 'Enable Human Transfer',
    what: 'Allows ElevenLabs to transfer qualifying calls to an approved human destination.',
    why: 'Some callers require a physical operator, and some policy boundaries must leave the AI flow.',
    how: 'Turn this on after destinations and rules have been reviewed. ElevenLabs routes through the connected SIP or phone provider.',
  },
  warmHandoffPreferred: {
    title: 'Prefer Warm Handoff',
    what: 'Requests a transfer style where context can be prepared before the operator takes over.',
    why: 'Warm handoff reduces repeated questions and gives the operator the reason for escalation.',
    how: 'Enable when the connected provider and workflow support it. The app records the preference; capability still depends on the live provider path.',
  },
  preserveCallerIdPreferred: {
    title: 'Prefer Caller ID Preservation',
    what: 'Requests that the caller identity be preserved during transfer when supported.',
    why: 'Operators can respond faster when they see the original caller rather than only the provider bridge.',
    how: 'Keep enabled as a preference. Confirm support with the connected SIP or telephony provider before treating it as guaranteed.',
  },
  passConversationContext: {
    title: 'Pass Conversation Context',
    what: 'Includes the transcript summary, reason code, and operator instructions in handoff preparation.',
    why: 'Operators need context, but they should not rely on unreviewed caller claims as trusted facts.',
    how: 'Keep enabled for physical operator handoff. Write operator messages that separate caller statements from verified system facts.',
  },
  defaultTransferMode: {
    title: 'Default Transfer Mode',
    what: 'Chooses the transfer method used when a rule does not override it.',
    why: 'Different SIP and telephony providers support different transfer styles.',
    how: 'Use Provider default for portability. Choose SIP REFER, conference, or blind transfer only when the connected provider path supports it.',
  },
  fallback: {
    title: 'Fallback If Transfer Fails',
    what: 'Defines what the caller hears and where the task goes if a live transfer cannot complete.',
    why: 'Failed transfers must still produce a controlled outcome instead of leaving the caller stranded.',
    how: 'Select a fallback action and destination, then write concise instructions for the receptionist to follow.',
  },
  copilotGoal: {
    title: 'Drafting Goal',
    what: 'Tells the contextual copilot what kind of handoff rule you want drafted.',
    why: 'A specific goal produces a safer draft than a generic escalation instruction.',
    how: 'Describe the caller situation, desired destination, and any policy limits. Review the draft before adding it as a rule.',
  },
  copilotContext: {
    title: 'Copilot Context',
    what: 'Gives the copilot extra local guidance for drafting handoff policy.',
    why: 'The copilot should use approved operational context, not invent destinations, entitlements, or provider behaviour.',
    how: 'Add venue-specific instructions, operator coverage, and escalation standards. Keep sensitive or unverified caller data out.',
  },
  destinationSection: {
    title: 'Approved Destinations',
    what: 'Lists the only human endpoints rules are allowed to transfer calls to.',
    why: 'Keeping destinations approved in the app prevents rule drafts from sending callers to unknown numbers.',
    how: 'Add each operator, queue, SIP URI, or provider alias before referencing it in a handoff rule.',
  },
  destinationLabel: {
    title: 'Destination Label',
    what: 'Names the operator, queue, or team shown to admins.',
    why: 'Readable names make escalation routing easier to review and audit.',
    how: 'Use a stable operational name such as “Main operator” or “Duty manager”.',
  },
  destinationType: {
    title: 'Destination Type',
    what: 'Defines whether the destination is a provider alias, phone number, or SIP URI.',
    why: 'This keeps the app generic so a future SIP provider swap does not rewrite business rules.',
    how: 'Use alias for provider-managed targets, phone for E.164 numbers, and SIP URI for direct SIP routes.',
  },
  destinationValue: {
    title: 'Destination Value',
    what: 'Stores the actual alias, number, or SIP URI ElevenLabs should route toward.',
    why: 'Rules need a stable endpoint while the provider adapter handles runtime details.',
    how: 'Enter the exact approved value, for example “main_operator”, “+441234567890”, or “sip:ops@example.com”.',
  },
  destinationAvailability: {
    title: 'Destination Availability',
    what: 'Documents when this destination should be considered suitable.',
    why: 'Availability notes help reviewers understand routing intent without hard-coding a schedule engine here.',
    how: 'Write plain rules such as “office hours only” or “24/7 urgent cover”.',
  },
  ruleLabel: {
    title: 'Rule Label',
    what: 'Names the handoff rule for operators and reviewers.',
    why: 'Clear labels make it easier to understand why a call transferred.',
    how: 'Use outcome-focused names like “Caller insists on human” or “Safety-sensitive issue”.',
  },
  reasonCode: {
    title: 'Reason Code',
    what: 'Stores a compact audit code for why the handoff rule fired.',
    why: 'Reason codes support reporting, transcript review, and deterministic tests.',
    how: 'Use uppercase codes with underscores, for example “HUMAN_REQUEST” or “UNANSWERABLE_POLICY”.',
  },
  ruleDestination: {
    title: 'Rule Destination',
    what: 'Selects the approved endpoint for this rule.',
    why: 'Rules should only reference destinations that have already been approved on this page.',
    how: 'Choose the most specific human route for the condition, or use the default operator for general requests.',
  },
  ruleTransferType: {
    title: 'Rule Transfer Type',
    what: 'Overrides the default transfer mode for this one rule.',
    why: 'Some routes may need a different provider capability than the default.',
    how: 'Keep it aligned with default unless this destination has a confirmed transfer requirement.',
  },
  ruleCondition: {
    title: 'Condition',
    what: 'Describes when ElevenLabs should stop trying to answer and transfer the caller.',
    why: 'The condition is the core policy that prevents the AI from overreaching.',
    how: 'Write observable triggers: caller insists on a person, answer is unknown, protected disclosure is requested, or physical operator action is required.',
  },
  callerMessage: {
    title: 'Caller Message',
    what: 'Sets what the receptionist says before initiating transfer.',
    why: 'The caller should understand what is happening without receiving unsupported guarantees.',
    how: 'Keep it short and calm. Avoid promising that a specific person is immediately available unless that is verified.',
  },
  operatorContext: {
    title: 'Operator Context',
    what: 'Prepares the human operator with the transfer reason and review instructions.',
    why: 'Good context reduces friction while preserving the boundary between caller claims and trusted facts.',
    how: 'Tell the operator what to review, what the caller asked for, and which actions still need verification.',
  },
  ruleEnabled: {
    title: 'Rule Enabled',
    what: 'Controls whether this rule participates in handoff decisions.',
    why: 'Draft rules should be reviewable without becoming active immediately.',
    how: 'Enable only after the condition, destination, messages, and provider capability assumptions have been approved.',
  },
} satisfies Record<string, GuideContent>;

type GuideKey = keyof typeof guideContent;

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
  const [transferConfiguration, setTransferConfiguration] = useState(loaded.transferConfiguration);
  const [copilotGoal, setCopilotGoal] = useState(
    'Draft a rule for callers who insist on speaking to a physical operator.',
  );
  const [copilotSuggestion, setCopilotSuggestion] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [activeGuide, setActiveGuide] = useState<GuideKey | null>(null);

  const hasCredential = Boolean(status.credentialReference);
  const keyLabel = deriveKeyLabel(status);
  const agentLabel = deriveAgentLabel(status);
  const guide = (guideKey: GuideKey) => ({
    activeGuide,
    guideKey,
    onGuideOpen: setActiveGuide,
  });

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
      transferConfiguration,
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

  function updateTransfer(updater: (current: TransferConfiguration) => TransferConfiguration) {
    setTransferConfiguration((current) => normaliseTransferConfiguration(updater(current)));
  }

  function updateDestination(id: string, patch: Partial<TransferDestination>) {
    updateTransfer((current) => ({
      ...current,
      destinations: current.destinations.map((destination) =>
        destination.id === id ? { ...destination, ...patch } : destination,
      ),
    }));
  }

  function updateRule(id: string, patch: Partial<TransferRule>) {
    updateTransfer((current) => ({
      ...current,
      rules: current.rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    }));
  }

  function addDestination() {
    updateTransfer((current) => {
      const next = current.destinations.length + 1;
      return {
        ...current,
        destinations: [
          ...current.destinations,
          {
            id: `operator_${next}`,
            label: `Operator ${next}`,
            type: 'alias',
            value: `operator_${next}`,
            availability: 'Availability to be approved',
            priority: next,
            notes: '',
          },
        ],
      };
    });
  }

  function removeDestination(id: string) {
    updateTransfer((current) => {
      if (current.destinations.length <= 1) return current;
      const destinations = current.destinations.filter((destination) => destination.id !== id);
      const replacement = destinations[0]?.id ?? '';
      return {
        ...current,
        destinations,
        rules: current.rules.map((rule) =>
          rule.destinationId === id ? { ...rule, destinationId: replacement } : rule,
        ),
        fallback: {
          ...current.fallback,
          destinationId:
            current.fallback.destinationId === id ? replacement : current.fallback.destinationId,
        },
      };
    });
  }

  function addRule() {
    updateTransfer((current) => {
      const next = current.rules.length + 1;
      const destinationId = current.destinations[0]?.id ?? '';
      return {
        ...current,
        rules: [
          ...current.rules,
          {
            id: `handoff_rule_${next}`,
            label: `Handoff rule ${next}`,
            enabled: true,
            priority: next,
            destinationId,
            transferType: current.defaultTransferType,
            reasonCode: 'HUMAN_HANDOFF',
            condition: 'Describe when ElevenLabs should transfer this caller to a human.',
            clientMessage: "I'll connect you with someone who can help.",
            operatorMessage:
              'Review the Quantum Parks transcript and summary before taking any action.',
          },
        ],
      };
    });
  }

  function removeRule(id: string) {
    updateTransfer((current) => {
      if (current.rules.length <= 1) return current;
      return { ...current, rules: current.rules.filter((rule) => rule.id !== id) };
    });
  }

  async function draftTransferRule() {
    setCopilotBusy(true);
    setCopilotSuggestion('');
    report('');
    try {
      const payload = {
        fieldLabel: 'Escalation contacts',
        currentText: copilotGoal.trim(),
        context: [
          { label: 'Policy owner', value: 'Quantum Parks Phone System App' },
          { label: 'Execution owner', value: 'ElevenLabs transfer_to_number system tool' },
          {
            label: 'Provider posture',
            value:
              'Provider-neutral. The connected SIP or phone provider completes the route selected by ElevenLabs.',
          },
          {
            label: 'Current destinations',
            value: transferConfiguration.destinations
              .map(
                (destination) => `${destination.label}: ${destination.type} ${destination.value}`,
              )
              .join('; '),
          },
          {
            label: 'Current rules',
            value: transferConfiguration.rules
              .map((rule) => `${rule.label}: ${rule.condition}`)
              .join('; '),
          },
          { label: 'Operator guidance', value: transferConfiguration.copilotContext },
        ],
      };
      const response = await fetch('/api/admin/ai/intelligence/copilot/enhance', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        suggestion?: string;
      };
      if (!response.ok || !result.suggestion) {
        throw new Error(result.message ?? `The copilot returned ${response.status}`);
      }
      setCopilotSuggestion(result.suggestion);
    } catch (error) {
      report(
        error instanceof Error ? error.message : 'The copilot could not draft a suggestion.',
        true,
      );
    } finally {
      setCopilotBusy(false);
    }
  }

  function applyCopilotSuggestion() {
    if (!copilotSuggestion.trim()) return;
    updateTransfer((current) => {
      const destinationId = current.destinations[0]?.id ?? '';
      return {
        ...current,
        enabled: true,
        rules: [
          ...current.rules,
          {
            id: `copilot_rule_${Date.now()}`,
            label: 'Copilot drafted handoff',
            enabled: true,
            priority: current.rules.length + 1,
            destinationId,
            transferType: current.defaultTransferType,
            reasonCode: 'COPILOT_DRAFT_HANDOFF',
            condition: copilotSuggestion,
            clientMessage: "I'll connect you with a member of the team who can help from here.",
            operatorMessage:
              'Caller meets a drafted escalation condition. Review the Quantum Parks transcript and summary before taking action.',
          },
        ],
      };
    });
    setCopilotSuggestion('');
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
            <Field label="ElevenLabs API Key" {...guide('apiKey')}>
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

            <Field label="Voice Mode" {...guide('voiceMode')}>
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

            <Field label="Receptionist display name" {...guide('receptionistDisplayName')}>
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
                guideKey="enableVoiceTest"
                label="Enable voice test"
                name="enableVoiceTest"
                activeGuide={activeGuide}
                onChange={setEnableVoiceTest}
                onGuideOpen={setActiveGuide}
              />
              <Toggle
                checked={captureTranscripts}
                guideKey="captureTranscripts"
                label="Capture transcripts"
                name="captureTranscripts"
                activeGuide={activeGuide}
                onChange={setCaptureTranscripts}
                onGuideOpen={setActiveGuide}
              />
              <Toggle
                checked={detectEscalations}
                guideKey="detectEscalations"
                label="Detect escalations"
                name="detectEscalations"
                activeGuide={activeGuide}
                onChange={setDetectEscalations}
                onGuideOpen={setActiveGuide}
              />
            </div>
          </div>

          <div className={styles.column}>
            <Field label="ElevenLabs Agent ID" {...guide('agentId')}>
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

            <Field label="Language" {...guide('language')}>
              <input
                className={styles.input}
                name="language"
                onChange={(event) => setLanguage(event.target.value)}
                value={language}
              />
            </Field>

            <Field label="Greeting override" {...guide('greetingOverride')}>
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
                guideKey="enableChatTest"
                label="Enable chat test"
                name="enableChatTest"
                activeGuide={activeGuide}
                onChange={setEnableChatTest}
                onGuideOpen={setActiveGuide}
              />
              <Toggle
                checked={generateSummaries}
                guideKey="generateSummaries"
                label="Generate summaries"
                name="generateSummaries"
                activeGuide={activeGuide}
                onChange={setGenerateSummaries}
                onGuideOpen={setActiveGuide}
              />
            </div>
          </div>
        </div>

        <section className={styles.handoffSection} aria-labelledby="human-handoff-title">
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle} id="human-handoff-title">
                Human Handoff Rules
              </h3>
              <p className={styles.sectionSummary}>
                Quantum owns the approved policy. ElevenLabs executes the transfer through the
                connected telephony provider.
              </p>
            </div>
            <button className={styles.secondaryButton} onClick={addRule} type="button">
              Add rule
            </button>
          </div>

          <div className={styles.handoffGrid}>
            <div className={styles.policyColumn}>
              <div className={styles.toggleGroup}>
                <Toggle
                  checked={transferConfiguration.enabled}
                  guideKey="transferEnabled"
                  label="Enable human transfer"
                  name="transferEnabled"
                  activeGuide={activeGuide}
                  onChange={(enabled) => updateTransfer((current) => ({ ...current, enabled }))}
                  onGuideOpen={setActiveGuide}
                />
                <Toggle
                  checked={transferConfiguration.warmHandoffPreferred}
                  guideKey="warmHandoffPreferred"
                  label="Prefer warm handoff"
                  name="warmHandoffPreferred"
                  activeGuide={activeGuide}
                  onChange={(warmHandoffPreferred) =>
                    updateTransfer((current) => ({ ...current, warmHandoffPreferred }))
                  }
                  onGuideOpen={setActiveGuide}
                />
                <Toggle
                  checked={transferConfiguration.preserveCallerIdPreferred}
                  guideKey="preserveCallerIdPreferred"
                  label="Prefer caller ID preservation"
                  name="preserveCallerIdPreferred"
                  activeGuide={activeGuide}
                  onChange={(preserveCallerIdPreferred) =>
                    updateTransfer((current) => ({ ...current, preserveCallerIdPreferred }))
                  }
                  onGuideOpen={setActiveGuide}
                />
                <Toggle
                  checked={transferConfiguration.passConversationContext}
                  guideKey="passConversationContext"
                  label="Pass conversation context"
                  name="passConversationContext"
                  activeGuide={activeGuide}
                  onChange={(passConversationContext) =>
                    updateTransfer((current) => ({ ...current, passConversationContext }))
                  }
                  onGuideOpen={setActiveGuide}
                />
              </div>

              <Field label="Default transfer mode" {...guide('defaultTransferMode')}>
                <div className={styles.selectWrap}>
                  <select
                    className={`${styles.input} ${styles.select}`}
                    onChange={(event) =>
                      updateTransfer((current) => ({
                        ...current,
                        defaultTransferType: event.target.value as TransferType,
                      }))
                    }
                    value={transferConfiguration.defaultTransferType}
                  >
                    {transferTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span className={styles.selectChevron} />
                </div>
                <p className={styles.help}>
                  SIP REFER is portable for SIP providers. Conference and blind transfer depend on
                  connected-provider capability.
                </p>
              </Field>

              <Field label="Fallback if transfer fails" {...guide('fallback')}>
                <div className={styles.compactGrid}>
                  <div className={styles.selectWrap}>
                    <select
                      className={`${styles.input} ${styles.select}`}
                      onChange={(event) =>
                        updateTransfer((current) => ({
                          ...current,
                          fallback: {
                            ...current.fallback,
                            type: event.target.value as TransferFallbackType,
                          },
                        }))
                      }
                      value={transferConfiguration.fallback.type}
                    >
                      {fallbackTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <span className={styles.selectChevron} />
                  </div>
                  <div className={styles.selectWrap}>
                    <select
                      className={`${styles.input} ${styles.select}`}
                      onChange={(event) =>
                        updateTransfer((current) => ({
                          ...current,
                          fallback: {
                            ...current.fallback,
                            destinationId: event.target.value || null,
                          },
                        }))
                      }
                      value={transferConfiguration.fallback.destinationId ?? ''}
                    >
                      {transferConfiguration.destinations.map((destination) => (
                        <option key={destination.id} value={destination.id}>
                          {destination.label}
                        </option>
                      ))}
                    </select>
                    <span className={styles.selectChevron} />
                  </div>
                </div>
                <textarea
                  className={`${styles.input} ${styles.textarea}`}
                  onChange={(event) =>
                    updateTransfer((current) => ({
                      ...current,
                      fallback: { ...current.fallback, instructions: event.target.value },
                    }))
                  }
                  value={transferConfiguration.fallback.instructions}
                />
              </Field>
            </div>

            <div className={styles.copilotPanel}>
              <p className={styles.panelEyebrow}>Contextual AI copilot</p>
              <Field label="Drafting goal" {...guide('copilotGoal')}>
                <textarea
                  className={`${styles.input} ${styles.textarea}`}
                  onChange={(event) => setCopilotGoal(event.target.value)}
                  value={copilotGoal}
                />
              </Field>
              <Field label="Copilot context" {...guide('copilotContext')}>
                <textarea
                  className={`${styles.input} ${styles.textarea}`}
                  onChange={(event) =>
                    updateTransfer((current) => ({
                      ...current,
                      copilotContext: event.target.value,
                    }))
                  }
                  value={transferConfiguration.copilotContext}
                />
              </Field>
              <div className={styles.inlineActions}>
                <button
                  className={styles.secondaryButton}
                  disabled={copilotBusy || copilotGoal.trim().length < 3}
                  onClick={() => void draftTransferRule()}
                  type="button"
                >
                  {copilotBusy ? 'Drafting...' : 'Draft with copilot'}
                </button>
              </div>
              {copilotSuggestion ? (
                <div className={styles.suggestion} role="status">
                  <span>Copilot suggestion</span>
                  <p>{copilotSuggestion}</p>
                  <div className={styles.inlineActions}>
                    <button
                      className={styles.secondaryButton}
                      onClick={applyCopilotSuggestion}
                      type="button"
                    >
                      Add as rule
                    </button>
                    <button
                      className={styles.ghostButton}
                      onClick={() => setCopilotSuggestion('')}
                      type="button"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className={styles.listSection}>
            <div className={styles.listHeader}>
              <p className={styles.panelEyebrow}>
                Approved destinations
                <GuideButton
                  activeGuide={activeGuide}
                  guideKey="destinationSection"
                  onGuideOpen={setActiveGuide}
                />
              </p>
              <button className={styles.secondaryButton} onClick={addDestination} type="button">
                Add destination
              </button>
            </div>
            <div className={styles.destinationList}>
              {transferConfiguration.destinations.map((destination) => (
                <div className={styles.destinationRow} key={destination.id}>
                  <MiniField label="Label" {...guide('destinationLabel')}>
                    <input
                      className={styles.input}
                      onChange={(event) =>
                        updateDestination(destination.id, { label: event.target.value })
                      }
                      value={destination.label}
                    />
                  </MiniField>
                  <MiniField label="Type" {...guide('destinationType')}>
                    <div className={styles.selectWrap}>
                      <select
                        className={`${styles.input} ${styles.select}`}
                        onChange={(event) =>
                          updateDestination(destination.id, {
                            type: event.target.value as TransferDestinationType,
                          })
                        }
                        value={destination.type}
                      >
                        {destinationTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span className={styles.selectChevron} />
                    </div>
                  </MiniField>
                  <MiniField label="Value" {...guide('destinationValue')}>
                    <input
                      className={styles.input}
                      onChange={(event) =>
                        updateDestination(destination.id, { value: event.target.value })
                      }
                      placeholder="main_operator, +441234567890, or sip:ops@example.com"
                      value={destination.value}
                    />
                  </MiniField>
                  <MiniField label="Availability" {...guide('destinationAvailability')}>
                    <input
                      className={styles.input}
                      onChange={(event) =>
                        updateDestination(destination.id, { availability: event.target.value })
                      }
                      value={destination.availability}
                    />
                  </MiniField>
                  <button
                    className={styles.ghostButton}
                    disabled={transferConfiguration.destinations.length <= 1}
                    onClick={() => removeDestination(destination.id)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.ruleList}>
            {transferConfiguration.rules.map((rule) => (
              <article className={styles.ruleRow} key={rule.id}>
                <div className={styles.ruleTopline}>
                  <MiniField label="Rule label" {...guide('ruleLabel')}>
                    <input
                      className={styles.input}
                      onChange={(event) => updateRule(rule.id, { label: event.target.value })}
                      value={rule.label}
                    />
                  </MiniField>
                  <MiniField label="Reason code" {...guide('reasonCode')}>
                    <input
                      className={styles.input}
                      onChange={(event) =>
                        updateRule(rule.id, { reasonCode: event.target.value.toUpperCase() })
                      }
                      value={rule.reasonCode}
                    />
                  </MiniField>
                  <MiniField label="Destination" {...guide('ruleDestination')}>
                    <div className={styles.selectWrap}>
                      <select
                        className={`${styles.input} ${styles.select}`}
                        onChange={(event) =>
                          updateRule(rule.id, { destinationId: event.target.value })
                        }
                        value={rule.destinationId}
                      >
                        {transferConfiguration.destinations.map((destination) => (
                          <option key={destination.id} value={destination.id}>
                            {destination.label}
                          </option>
                        ))}
                      </select>
                      <span className={styles.selectChevron} />
                    </div>
                  </MiniField>
                  <MiniField label="Transfer type" {...guide('ruleTransferType')}>
                    <div className={styles.selectWrap}>
                      <select
                        className={`${styles.input} ${styles.select}`}
                        onChange={(event) =>
                          updateRule(rule.id, { transferType: event.target.value as TransferType })
                        }
                        value={rule.transferType}
                      >
                        {transferTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span className={styles.selectChevron} />
                    </div>
                  </MiniField>
                </div>
                <div className={styles.ruleBody}>
                  <Field label="Condition" {...guide('ruleCondition')}>
                    <textarea
                      className={`${styles.input} ${styles.textarea}`}
                      onChange={(event) => updateRule(rule.id, { condition: event.target.value })}
                      value={rule.condition}
                    />
                  </Field>
                  <Field label="Caller message" {...guide('callerMessage')}>
                    <textarea
                      className={`${styles.input} ${styles.textarea}`}
                      onChange={(event) =>
                        updateRule(rule.id, { clientMessage: event.target.value })
                      }
                      value={rule.clientMessage}
                    />
                  </Field>
                  <Field label="Operator context" {...guide('operatorContext')}>
                    <textarea
                      className={`${styles.input} ${styles.textarea}`}
                      onChange={(event) =>
                        updateRule(rule.id, { operatorMessage: event.target.value })
                      }
                      value={rule.operatorMessage}
                    />
                  </Field>
                </div>
                <div className={styles.ruleActions}>
                  <Toggle
                    checked={rule.enabled}
                    guideKey="ruleEnabled"
                    label="Rule enabled"
                    name={`${rule.id}-enabled`}
                    activeGuide={activeGuide}
                    onChange={(enabled) => updateRule(rule.id, { enabled })}
                    onGuideOpen={setActiveGuide}
                  />
                  <button
                    className={styles.ghostButton}
                    disabled={transferConfiguration.rules.length <= 1}
                    onClick={() => removeRule(rule.id)}
                    type="button"
                  >
                    Remove rule
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        {activeGuide ? (
          <GuidePanel guideKey={activeGuide} onClose={() => setActiveGuide(null)} />
        ) : null}

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
  activeGuide,
  guideKey,
  label,
  onGuideOpen,
}: {
  children: ReactNode;
  activeGuide?: GuideKey | null;
  guideKey?: GuideKey;
  label: string;
  onGuideOpen?: (guideKey: GuideKey | null) => void;
}) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldLabel}>
        {label}
        {guideKey && onGuideOpen ? (
          <GuideButton
            activeGuide={activeGuide ?? null}
            guideKey={guideKey}
            onGuideOpen={onGuideOpen}
          />
        ) : null}
      </div>
      {children}
    </div>
  );
}

function MiniField({
  children,
  activeGuide,
  guideKey,
  label,
  onGuideOpen,
}: {
  children: ReactNode;
  activeGuide?: GuideKey | null;
  guideKey: GuideKey;
  label: string;
  onGuideOpen: (guideKey: GuideKey | null) => void;
}) {
  return (
    <div className={styles.miniField}>
      <div className={styles.miniFieldLabel}>
        {label}
        <GuideButton
          activeGuide={activeGuide ?? null}
          guideKey={guideKey}
          onGuideOpen={onGuideOpen}
        />
      </div>
      {children}
    </div>
  );
}

/** Source: `CinematicToggle`. */
function Toggle({
  activeGuide,
  checked,
  guideKey,
  label,
  name,
  onChange,
  onGuideOpen,
}: {
  activeGuide?: GuideKey | null;
  checked: boolean;
  guideKey: GuideKey;
  label: string;
  name: string;
  onChange: (next: boolean) => void;
  onGuideOpen: (guideKey: GuideKey | null) => void;
}) {
  const inputId = useId();

  return (
    <div className={styles.toggle}>
      <span className={styles.toggleLabel}>
        <label htmlFor={inputId}>{label}</label>
        <GuideButton
          activeGuide={activeGuide ?? null}
          guideKey={guideKey}
          onGuideOpen={onGuideOpen}
        />
      </span>
      <span className={styles.toggleBox}>
        <input
          checked={checked}
          className={styles.toggleInput}
          name={name}
          id={inputId}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span className={styles.toggleMark} />
        <span className={styles.toggleCheck}>✓</span>
      </span>
    </div>
  );
}

function GuideButton({
  activeGuide,
  guideKey,
  onGuideOpen,
}: {
  activeGuide: GuideKey | null;
  guideKey: GuideKey;
  onGuideOpen: (guideKey: GuideKey | null) => void;
}) {
  const isActive = activeGuide === guideKey;
  const content = guideContent[guideKey];
  return (
    <button
      aria-expanded={isActive}
      aria-label={`Open guide for ${content.title}`}
      className={`${styles.guideButton} ${isActive ? styles.guideButtonActive : ''}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onGuideOpen(isActive ? null : guideKey);
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      type="button"
    >
      i
    </button>
  );
}

function GuidePanel({ guideKey, onClose }: { guideKey: GuideKey; onClose: () => void }) {
  const content = guideContent[guideKey];
  return (
    <aside aria-labelledby="contextual-guide-title" className={styles.guidePanel} role="dialog">
      <div className={styles.guidePanelHeader}>
        <div>
          <p className={styles.panelEyebrow}>Contextual guide</p>
          <h3 className={styles.guideTitle} id="contextual-guide-title">
            {content.title}
          </h3>
        </div>
        <button className={styles.ghostButton} onClick={onClose} type="button">
          Close
        </button>
      </div>
      <div className={styles.guideBody}>
        <section className={styles.guideSection}>
          <h4>What</h4>
          <p>{content.what}</p>
        </section>
        <section className={styles.guideSection}>
          <h4>Why</h4>
          <p>{content.why}</p>
        </section>
        <section className={styles.guideSection}>
          <h4>How</h4>
          <p>{content.how}</p>
        </section>
      </div>
    </aside>
  );
}
